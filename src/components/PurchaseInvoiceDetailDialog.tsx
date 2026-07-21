import { useState, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Save, Loader2, Receipt, Lock, Search, Check, X, Split, Plus, Percent, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { parseDecimal, formatForInput } from "@/lib/num";

const FALLBACK_KATEGORIEN = [
  { value: "material", label: "Material" },
  { value: "verbrauchsmaterial", label: "Verbrauchsmaterial" },
  { value: "werkzeug", label: "Werkzeug / Maschinen" },
  { value: "werkstatt", label: "Werkstatt" },
  { value: "fremdleistung", label: "Fremdleistung" },
  { value: "miete", label: "Miete / Leasing" },
  { value: "treibstoff", label: "Treibstoff / KFZ" },
  { value: "geschaeftsessen", label: "Geschäftsessen / Bewirtung" },
  { value: "buero", label: "Büro / Verwaltung" },
  { value: "fortbildung", label: "Fortbildung / Schulung" },
  { value: "versicherung", label: "Versicherung / Gebühren" },
  { value: "reise", label: "Reise / Hotel" },
  { value: "sonstiges", label: "Sonstiges" },
];

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

// Teilbetrag/Position einer Eingangsrechnung, die einem Projekt zugeordnet ist.
type Allocation = {
  id: string;
  purchase_invoice_id: string;
  project_id: string;
  beschreibung: string | null;
  betrag_netto: number;
  position_index: number | null;
};

const eur = (n: number) => `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function PurchaseInvoiceDetailDialog({ invoiceId, onClose, onUpdated }: Props) {
  const { toast } = useToast();
  const { isAdmin } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [kategorien, setKategorien] = useState(FALLBACK_KATEGORIEN);
  // Verrechnen-Picker
  const [verrechnenOpen, setVerrechnenOpen] = useState(false);
  const [verrechnenSearch, setVerrechnenSearch] = useState("");
  const [invoiceOptions, setInvoiceOptions] = useState<Array<{ id: string; nummer: string; datum: string; kunde: string }>>([]);
  const [verrechnetRef, setVerrechnetRef] = useState<{ id: string; nummer: string; datum: string } | null>(null);
  // Projekt-Aufteilung (Teilbeträge/Positionen → Projekte)
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocSelected, setAllocSelected] = useState<Set<string>>(new Set());
  const [allocBulkProject, setAllocBulkProject] = useState("");
  const [newAlloc, setNewAlloc] = useState({ beschreibung: "", betrag: "", project_id: "" });
  const [allocSaving, setAllocSaving] = useState(false);
  // Nachträglicher Rabatt/Skonto-Abzug (kein DB-Feld — wird einmalig auf
  // Brutto/Netto angewendet und in den Notizen dokumentiert).
  const [rabattTyp, setRabattTyp] = useState<"prozent" | "euro">("prozent");
  const [rabattWert, setRabattWert] = useState("");

  useEffect(() => {
    (supabase.from("admin_config_options" as never) as any)
      .select("wert, label, sort_order")
      .eq("kategorie", "eingangsrechnung_kategorie")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          setKategorien(data.map((r: any) => ({ value: r.wert, label: r.label })));
        }
      });
  }, []);

  useEffect(() => {
    if (!invoiceId) { setForm(null); setFileUrl(null); return; }
    loadData();
  }, [invoiceId]);

  useEffect(() => {
    let cancelled = false;
    if (!form?.pdf_path) { setFileUrl(null); return; }
    supabase.storage.from("purchase-invoices").createSignedUrl(form.pdf_path, 300).then(({ data }) => {
      if (!cancelled) setFileUrl(data?.signedUrl || null);
    });
    return () => { cancelled = true; };
  }, [form?.pdf_path]);

  const loadAllocations = async (id: string) => {
    const { data } = await (supabase.from("purchase_invoice_allocations" as never) as any)
      .select("*")
      .eq("purchase_invoice_id", id)
      .order("position_index", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setAllocations((data as Allocation[]) || []);
    setAllocSelected(new Set());
  };

  const loadData = async () => {
    if (!invoiceId) return;
    setLoading(true);
    const [{ data: inv, error: invError }, { data: projs }] = await Promise.all([
      supabase.from("purchase_invoices").select("*").eq("id", invoiceId).single(),
      supabase.from("projects").select("id, name").order("name"),
      loadAllocations(invoiceId),
    ]);
    if (invError) {
      toast({ variant: "destructive", title: "Fehler", description: "Eingangsrechnung konnte nicht geladen werden." });
      setLoading(false);
      return;
    }
    if (inv) {
      // Beträge als Rohtext in österreichischer Schreibweise ins Formular —
      // die Felder sind Textfelder, damit „12,50" tippbar bleibt.
      setForm({
        ...inv,
        betrag_brutto: (inv as any).betrag_brutto != null ? formatForInput(Number((inv as any).betrag_brutto), 2) : "",
        betrag_netto: (inv as any).betrag_netto != null ? formatForInput(Number((inv as any).betrag_netto), 2) : "",
      });
      // Wenn bereits verrechnet, referenzierte Ausgangsrechnung laden
      const verId = (inv as any).verrechnet_in_invoice_id;
      if (verId) {
        const { data: ref } = await supabase
          .from("invoices")
          .select("id, nummer, datum")
          .eq("id", verId)
          .maybeSingle();
        if (ref) setVerrechnetRef({ id: ref.id, nummer: ref.nummer, datum: ref.datum });
      } else {
        setVerrechnetRef(null);
      }
    }
    if (projs) setProjects(projs);
    setLoading(false);
  };

  const openVerrechnen = async () => {
    setVerrechnenOpen(true);
    setVerrechnenSearch("");
    // Letzte 200 Rechnungen/AR/SR laden (keine Angebote, keine Stornierten)
    const { data } = await supabase
      .from("invoices")
      .select("id, nummer, datum, kunde_name, typ, status")
      .in("typ", ["rechnung", "anzahlungsrechnung", "schlussrechnung"])
      .neq("status", "storniert")
      .order("datum", { ascending: false })
      .limit(200);
    setInvoiceOptions(((data as any[]) || []).map(r => ({
      id: r.id,
      nummer: r.nummer,
      datum: r.datum,
      kunde: r.kunde_name,
    })));
  };

  const confirmVerrechnen = async (invId: string) => {
    if (!form) return;
    const { error } = await supabase.from("purchase_invoices").update({
      verrechnet_am: new Date().toISOString().split("T")[0],
      verrechnet_in_invoice_id: invId,
    } as any).eq("id", form.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Als verrechnet markiert" });
    setVerrechnenOpen(false);
    await loadData();
    onUpdated();
  };

  const unsetVerrechnet = async () => {
    if (!form) return;
    if (!window.confirm("Verrechnung wirklich aufheben? Der Beleg erscheint wieder als offen/bezahlt.")) return;
    const { error } = await supabase.from("purchase_invoices").update({
      verrechnet_am: null,
      verrechnet_in_invoice_id: null,
    } as any).eq("id", form.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Verrechnung aufgehoben" });
    await loadData();
    onUpdated();
  };

  const update = (field: string, value: any) => setForm((prev: any) => ({ ...prev, [field]: value }));

  // ── Projekt-Aufteilung (Teilbeträge → Projekte) ─────────────────────────
  // Sobald Teilbeträge existieren, rechnet die Nachkalkulation NUR mit den
  // Teilbeträgen (der Kopf-Betrag der Rechnung wird ignoriert, um
  // Doppelzählung zu vermeiden).

  /** Bruttobetrag laut Rechnung — die harte Obergrenze für alles Weitere. */
  const invoiceBrutto = (): number => {
    const b = parseDecimal(form?.betrag_brutto);
    return b !== null && b > 0 ? b : 0;
  };

  /** Netto aus dem Bruttobetrag + USt-Satz abgeleitet. */
  const nettoAusBrutto = (): number => {
    const u = parseDecimal(form?.ust_satz);
    const satz = u !== null && u >= 0 ? u : 20;
    return round2(invoiceBrutto() / (1 + satz / 100));
  };

  /** true, sobald das frei editierbare Netto-Feld über dem Brutto liegt. */
  const nettoUeberBrutto = (): boolean => {
    const n = parseDecimal(form?.betrag_netto);
    return n !== null && invoiceBrutto() > 0 && n - invoiceBrutto() > 0.005;
  };

  // Zuordnungs-Obergrenze. WICHTIG: Das Netto-Feld ist frei editierbar —
  // wird nur dagegen geprüft, kann man durch Hochsetzen des Nettos beliebig
  // viel auf Projekte buchen. Deshalb gilt der tatsächliche Rechnungsbetrag
  // (Brutto) als Deckel.
  const invoiceNetto = (): number => {
    const n = parseDecimal(form?.betrag_netto);
    const deckel = invoiceBrutto();
    if (n !== null && n > 0) return deckel > 0 ? Math.min(n, deckel) : n;
    if (deckel > 0) return nettoAusBrutto();
    return 0;
  };

  const zugeordnetSumme = allocations.reduce((s, a) => s + (Number(a.betrag_netto) || 0), 0);
  const restBetrag = Math.round((invoiceNetto() - zugeordnetSumme) * 100) / 100;

  /**
   * Rabatt/Skonto einmalig vom aktuellen Bruttobetrag abziehen.
   * Es gibt (noch) keine DB-Spalte dafür — der Abzug wird direkt in
   * Brutto/Netto eingerechnet und in den Notizen dokumentiert.
   */
  const applyRabatt = () => {
    const brutto = parseDecimal(form?.betrag_brutto);
    const w = parseDecimal(rabattWert);
    if (brutto === null || brutto <= 0) {
      toast({ variant: "destructive", title: "Kein Betrag", description: "Bitte zuerst einen Bruttobetrag erfassen." });
      return;
    }
    if (w === null || w <= 0) {
      toast({ variant: "destructive", title: "Rabatt fehlt", description: "Bitte einen Rabatt-/Skontowert > 0 eingeben." });
      return;
    }
    const abzug = round2(Math.min(rabattTyp === "prozent" ? (brutto * w) / 100 : w, brutto));
    const neuBrutto = round2(brutto - abzug);
    if (neuBrutto <= 0) {
      toast({ variant: "destructive", title: "Rabatt zu hoch", description: "Nach Abzug bleibt kein Zahlbetrag übrig." });
      return;
    }
    const ustW = parseDecimal(form?.ust_satz);
    const ust = ustW !== null && ustW >= 0 ? ustW : 20;
    const neuNetto = round2(neuBrutto / (1 + ust / 100));
    const notiz = `Rabatt/Skonto: ${rabattTyp === "prozent" ? `${w} %` : eur(abzug)} auf ${eur(brutto)} = −${eur(abzug)} → Zahlbetrag ${eur(neuBrutto)} brutto`;
    setForm((prev: any) => ({
      ...prev,
      betrag_brutto: formatForInput(neuBrutto, 2),
      betrag_netto: formatForInput(neuNetto, 2),
      notizen: [String(prev.notizen || "").trim(), notiz].filter(Boolean).join("\n"),
    }));
    setRabattWert("");
    toast({
      title: "Rabatt abgezogen",
      description: `−${eur(abzug)} → ${eur(neuBrutto)} brutto. Zum Übernehmen unten auf „Speichern" tippen.`,
    });
  };

  const addAllocation = async () => {
    if (!form) return;
    const betrag = parseDecimal(newAlloc.betrag);
    if (!newAlloc.project_id) {
      toast({ variant: "destructive", title: "Projekt fehlt", description: "Bitte ein Projekt für den Teilbetrag wählen." });
      return;
    }
    if (betrag === null || betrag <= 0) {
      toast({ variant: "destructive", title: "Betrag ungültig", description: "Bitte einen Teilbetrag (netto, > 0) eingeben." });
      return;
    }
    // Ohne gültigen Rechnungsbetrag gibt es keine belastbare Obergrenze —
    // dann lieber gar nicht zuordnen lassen.
    if (invoiceBrutto() <= 0) {
      toast({
        variant: "destructive",
        title: "Rechnungsbetrag fehlt",
        description: "Bitte zuerst einen Bruttobetrag erfassen und speichern — sonst lässt sich die Aufteilung nicht begrenzen.",
      });
      return;
    }
    // Überzuordnung verhindern — sonst zeigt die Nachkalkulation mehr
    // Fremdkosten, als die Rechnung überhaupt hergibt. Grundlage ist der
    // Rechnungsbetrag (Brutto), NICHT das frei editierbare Netto-Feld.
    if (betrag - restBetrag > 0.01) {
      toast({
        variant: "destructive",
        title: "Teilbetrag zu hoch",
        description: `Es sind nur noch ${eur(Math.max(0, restBetrag))} von ${eur(invoiceNetto())} netto frei (Rechnung: ${eur(invoiceBrutto())} brutto).`,
        duration: 8000,
      });
      return;
    }
    setAllocSaving(true);
    const { error } = await (supabase.from("purchase_invoice_allocations" as never) as any).insert({
      purchase_invoice_id: form.id,
      project_id: newAlloc.project_id,
      beschreibung: newAlloc.beschreibung.trim() || null,
      betrag_netto: Math.round(betrag * 100) / 100,
    });
    setAllocSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    setNewAlloc({ beschreibung: "", betrag: "", project_id: newAlloc.project_id });
    await loadAllocations(form.id);
    onUpdated();
  };

  const deleteAllocation = async (id: string) => {
    if (!form) return;
    const { error } = await (supabase.from("purchase_invoice_allocations" as never) as any).delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    await loadAllocations(form.id);
    onUpdated();
  };

  const reassignAllocation = async (id: string, projectId: string) => {
    if (!form) return;
    const { error } = await (supabase.from("purchase_invoice_allocations" as never) as any).update({ project_id: projectId }).eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    await loadAllocations(form.id);
    onUpdated();
  };

  const assignAllocBulk = async () => {
    if (!form || !allocBulkProject || allocSelected.size === 0) return;
    const { error } = await (supabase.from("purchase_invoice_allocations" as never) as any)
      .update({ project_id: allocBulkProject })
      .in("id", [...allocSelected]);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Zugeordnet", description: `${allocSelected.size} Teilbetrag${allocSelected.size === 1 ? "" : "e"} umgehängt.` });
    setAllocBulkProject("");
    await loadAllocations(form.id);
    onUpdated();
  };

  const toggleAllocSelected = (id: string) => {
    setAllocSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Netto aus Brutto + USt-Satz ableiten (wie im Upload-Dialog) — hält
  // betrag_netto konsistent, damit die Projekt-Nachkalkulation stimmt.
  const deriveNetto = (brutto: any, ust: any): string | null => {
    const b = parseDecimal(brutto);
    const u = parseDecimal(ust);
    if (b === null || u === null) return null;
    return (b / (1 + u / 100)).toFixed(2).replace(".", ",");
  };

  const handleSave = async () => {
    if (!form) return;
    // Validierung: Lieferant + gültiger Bruttobetrag (verhindert NaN in der DB)
    if (!form.lieferant?.trim()) {
      toast({ variant: "destructive", title: "Lieferant fehlt", description: "Bitte einen Lieferanten eingeben." });
      return;
    }
    const brutto = parseDecimal(form.betrag_brutto);
    if (brutto === null || brutto <= 0) {
      toast({ variant: "destructive", title: "Betrag ungültig", description: "Bitte einen gültigen Bruttobetrag (> 0) eingeben." });
      return;
    }
    const toNumOrNull = (v: any) => parseDecimal(v);
    const ustSatz = toNumOrNull(form.ust_satz) ?? 20;
    // Netto: fehlend/ungültig/negativ → aus Brutto+USt ableiten, damit die
    // Nachkalkulation nicht auf den pauschalen Brutto/1,2-Fallback fällt.
    let netto = toNumOrNull(form.betrag_netto);
    if (netto === null || netto <= 0) {
      netto = round2(brutto / (1 + ustSatz / 100));
    }
    // Netto darf das Brutto nicht übersteigen — sonst ist die
    // Nachkalkulation um den Faktor (1 + USt) daneben.
    if (netto - brutto > 0.005) {
      const korrigiert = round2(brutto / (1 + ustSatz / 100));
      update("betrag_netto", formatForInput(korrigiert, 2));
      toast({
        variant: "destructive",
        title: "Netto größer als Brutto",
        description: `Das Netto (${eur(netto)}) kann nicht größer sein als der Bruttobetrag (${eur(brutto)}). Korrigiert auf ${eur(korrigiert)} — bitte prüfen und erneut speichern.`,
        duration: 9000,
      });
      return;
    }
    // Harte Sperre: bereits gebuchte Teilbeträge dürfen den Rechnungsbetrag
    // nicht übersteigen (z. B. wenn der Betrag nachträglich gesenkt wird).
    if (allocations.length > 0 && zugeordnetSumme - netto > 0.01) {
      toast({
        variant: "destructive",
        title: "Zu viel auf Projekte gebucht",
        description: `Den Projekten sind ${eur(zugeordnetSumme)} zugeordnet, die Rechnung ergibt aber nur ${eur(netto)} netto. Bitte zuerst die Projekt-Aufteilung oben korrigieren.`,
        duration: 9000,
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("purchase_invoices").update({
      lieferant: form.lieferant.trim(),
      rechnungsnummer: form.rechnungsnummer || null,
      rechnungsdatum: form.rechnungsdatum || null,
      faellig_am: form.faellig_am || null,
      bezahlt_am: form.bezahlt_am || null,
      betrag_brutto: brutto,
      betrag_netto: netto,
      ust_satz: ustSatz,
      kategorie: form.kategorie,
      project_id: form.project_id || null,
      status: form.status,
      zahlungsart: form.zahlungsart || null,
      notizen: form.notizen || null,
      updated_at: new Date().toISOString(),
    }).eq("id", form.id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gespeichert" });
      onUpdated();
      onClose();
    }
    setSaving(false);
  };

  const openFile = async () => {
    if (!form?.pdf_path) return;
    const { data } = await supabase.storage.from("purchase-invoices").createSignedUrl(form.pdf_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (!invoiceId) return null;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base sm:text-lg">Eingangsrechnung bearbeiten</DialogTitle>
        </DialogHeader>

        {loading || !form ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {form.pdf_path && fileUrl && (
              <div className="space-y-2">
                <div className="rounded-lg border overflow-hidden bg-muted/20">
                  {form.mime_type === "application/pdf" || (form.file_name || "").toLowerCase().endsWith(".pdf") ? (
                    <iframe
                      src={fileUrl}
                      title={form.file_name || "Rechnung"}
                      className="w-full h-[260px] sm:h-[420px] bg-white"
                    />
                  ) : (
                    <img
                      src={fileUrl}
                      alt={form.file_name || "Rechnung"}
                      className="w-full max-h-[260px] sm:max-h-[420px] object-contain bg-white"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={openFile} className="h-11 flex-1 gap-2">
                    <ExternalLink className="h-4 w-4" />
                    In neuem Tab öffnen
                  </Button>
                  {form.beleg_locked && (
                    <Badge variant="outline" className="gap-1 px-2 py-1.5 text-xs bg-muted/40">
                      <Lock className="h-3 w-3" />
                      Beleg gesperrt
                    </Badge>
                  )}
                </div>
                {form.beleg_locked && (
                  <p className="text-[11px] text-muted-foreground">
                    Beleg-Datei ist nach dem ersten Upload unveränderbar. Meta-Daten (Betrag, Status,
                    Notizen) dürfen weiterhin korrigiert werden.
                  </p>
                )}
              </div>
            )}

            {/* Verrechnen-Block */}
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Weiterverrechnung</Label>
                {form.verrechnet_am && (
                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-[10px] py-0 h-5">
                    <Check className="h-3 w-3 mr-0.5" /> verrechnet
                  </Badge>
                )}
              </div>
              {form.verrechnet_am ? (
                <div className="space-y-1.5">
                  <div className="text-sm">
                    Verrechnet am{" "}
                    <span className="font-medium">
                      {new Date(form.verrechnet_am).toLocaleDateString("de-AT")}
                    </span>
                    {verrechnetRef && (
                      <>
                        {" in "}
                        <RouterLink
                          to={`/invoices/${verrechnetRef.id}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Rechnung {verrechnetRef.nummer}
                        </RouterLink>
                        {verrechnetRef.datum && (
                          <span className="text-xs text-muted-foreground">
                            {" "}({new Date(verrechnetRef.datum).toLocaleDateString("de-AT")})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={unsetVerrechnet} className="h-10 gap-1">
                      <X className="h-3.5 w-3.5" />
                      Verrechnung aufheben
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Noch nicht an Kunden verrechnet.
                  </span>
                  <Button variant="outline" size="sm" onClick={openVerrechnen} className="h-10 gap-1">
                    <Receipt className="h-3.5 w-3.5" />
                    Als verrechnet markieren
                  </Button>
                </div>
              )}
            </div>

            {/* Projekt-Aufteilung: Teilbeträge/Positionen auf mehrere Projekte */}
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Split className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Projekt-Aufteilung</Label>
                {allocations.length > 0 && (
                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                    {allocations.length} Teilbetr{allocations.length === 1 ? "ag" : "äge"}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Rechnung auf mehrere Projekte aufteilen (z.B. 3 Positionen → Projekt X, 5 → Projekt Z).
                Sobald Teilbeträge existieren, rechnet die Nachkalkulation je Projekt nur mit den
                zugeordneten Teilbeträgen — das Projekt oben dient dann nur noch als Hauptzuordnung der Rechnung.
              </p>

              {allocSelected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
                  <span className="text-xs whitespace-nowrap font-medium">{allocSelected.size} ausgewählt</span>
                  <Select value={allocBulkProject || "none"} onValueChange={v => setAllocBulkProject(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-11 text-xs flex-1 min-w-[8rem]"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Projekt wählen...</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" className="h-11" onClick={assignAllocBulk} disabled={!allocBulkProject}>
                    Auswahl zuordnen
                  </Button>
                </div>
              )}

              {allocations.length > 0 && (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {allocations.map(a => (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-2">
                      {/* 44px-Tap-Ziel um die Checkbox — am Handy sonst kaum treffbar. */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={allocSelected.has(a.id)}
                        aria-label="Teilbetrag auswählen"
                        onClick={() => toggleAllocSelected(a.id)}
                        className="flex h-11 w-9 shrink-0 items-center justify-center rounded hover:bg-muted"
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                          allocSelected.has(a.id) ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        }`}>
                          {allocSelected.has(a.id) && <Check className="h-4 w-4" />}
                        </span>
                      </button>
                      <span className="flex-1 min-w-[7rem] text-xs truncate" title={a.beschreibung || undefined}>
                        {a.beschreibung || `Teilbetrag${a.position_index != null ? ` (Position ${a.position_index + 1})` : ""}`}
                      </span>
                      <span className="text-xs font-mono tabular-nums whitespace-nowrap">
                        {eur(Number(a.betrag_netto) || 0)}
                      </span>
                      <Select value={a.project_id} onValueChange={v => reassignAllocation(a.id, v)}>
                        <SelectTrigger className="h-11 flex-1 min-w-[8rem] text-xs">
                          <SelectValue placeholder="Projekt" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                        onClick={() => deleteAllocation(a.id)}
                        title="Teilbetrag entfernen"
                        aria-label="Teilbetrag entfernen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Neuer Teilbetrag */}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Beschreibung (optional)"
                  value={newAlloc.beschreibung}
                  onChange={e => setNewAlloc(prev => ({ ...prev, beschreibung: e.target.value }))}
                  className="h-11 text-xs flex-1 min-w-[7rem]"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="€ netto"
                  aria-label="Teilbetrag netto"
                  data-testid="det-alloc-betrag"
                  value={newAlloc.betrag}
                  onChange={e => setNewAlloc(prev => ({ ...prev, betrag: e.target.value }))}
                  className="h-11 text-xs w-24 shrink-0"
                />
                <Select
                  value={newAlloc.project_id || "none"}
                  onValueChange={v => setNewAlloc(prev => ({ ...prev, project_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-11 flex-1 min-w-[8rem] text-xs">
                    <SelectValue placeholder="Projekt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Projekt wählen...</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-11 w-11 px-0 shrink-0"
                  onClick={addAllocation}
                  disabled={allocSaving}
                  title="Teilbetrag hinzufügen"
                  aria-label="Teilbetrag hinzufügen"
                >
                  {allocSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>

              <div className={`flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t ${restBetrag < -0.005 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                <span>
                  Zugeordnet: <span className="font-mono tabular-nums">{eur(zugeordnetSumme)}</span> von{" "}
                  <span className="font-mono tabular-nums">{eur(invoiceNetto())}</span>{" "}
                  (Rest: <span className="font-mono tabular-nums">{eur(restBetrag)}</span>)
                  {restBetrag < -0.005 && " — mehr zugeordnet als Rechnungsbetrag!"}
                </span>
                {restBetrag > 0.005 && allocations.length > 0 && (
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline shrink-0"
                    onClick={() => setNewAlloc(prev => ({
                      ...prev,
                      betrag: formatForInput(restBetrag, 2),
                      project_id: prev.project_id || form.project_id || "",
                      beschreibung: prev.beschreibung || "Restbetrag (Hauptprojekt)",
                    }))}
                    title="Restbetrag in das Betragsfeld übernehmen"
                  >
                    Rest übernehmen
                  </button>
                )}
              </div>
            </div>

            {/* Rabatt / Skonto nachträglich abziehen */}
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Rabatt / Skonto abziehen</Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Zieht den Rabatt einmalig vom Bruttobetrag ab, rechnet das Netto neu und
                vermerkt den Abzug in den Notizen. Danach unten „Speichern".
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Rabatt"
                  value={rabattWert}
                  onChange={e => setRabattWert(e.target.value)}
                  className="h-10 w-24 shrink-0 text-right font-mono"
                />
                <Select value={rabattTyp} onValueChange={(v: any) => setRabattTyp(v)}>
                  <SelectTrigger className="h-10 w-20 shrink-0" aria-label="Rabatt-Art"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prozent">%</SelectItem>
                    <SelectItem value="euro">€</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" className="h-10 px-2 text-xs" onClick={() => { setRabattTyp("prozent"); setRabattWert("3"); }}>
                  3 % Skonto
                </Button>
                <Button type="button" size="sm" className="h-10" onClick={applyRabatt} disabled={!rabattWert}>
                  Abziehen
                </Button>
              </div>
              {allocations.length > 0 && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  Achtung: Teilbeträge werden nicht automatisch gekürzt — nach dem Abzug bitte
                  die Projekt-Aufteilung oben prüfen.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Lieferant *</Label>
                <Input value={form.lieferant || ""} onChange={e => update("lieferant", e.target.value)} />
              </div>
              <div>
                <Label>Rechnungsnummer</Label>
                <Input value={form.rechnungsnummer || ""} onChange={e => update("rechnungsnummer", e.target.value)} />
              </div>
              <div>
                <Label>Rechnungsdatum</Label>
                <Input type="date" value={form.rechnungsdatum || ""} onChange={e => update("rechnungsdatum", e.target.value)} />
              </div>
              <div>
                <Label>Betrag Brutto * (€)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  data-testid="det-brutto"
                  value={form.betrag_brutto ?? ""}
                  onChange={e => {
                    const v = e.target.value;
                    setForm((prev: any) => ({
                      ...prev,
                      betrag_brutto: v,
                      betrag_netto: deriveNetto(v, prev.ust_satz) ?? prev.betrag_netto,
                    }));
                  }}
                  onBlur={() => {
                    const n = parseDecimal(form.betrag_brutto);
                    if (n === null) return;
                    update("betrag_brutto", formatForInput(round2(Math.max(0, n)), 2));
                  }}
                />
              </div>
              <div>
                <Label>Betrag Netto (€)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  data-testid="det-netto"
                  value={form.betrag_netto ?? ""}
                  onChange={e => update("betrag_netto", e.target.value)}
                  onBlur={() => {
                    // Leer → aus Brutto/USt ableiten; größer als Brutto → klemmen.
                    if (!String(form.betrag_netto ?? "").trim()) {
                      if (invoiceBrutto() > 0) update("betrag_netto", formatForInput(nettoAusBrutto(), 2));
                      return;
                    }
                    const n = parseDecimal(form.betrag_netto);
                    if (n === null) {
                      if (invoiceBrutto() > 0) update("betrag_netto", formatForInput(nettoAusBrutto(), 2));
                      return;
                    }
                    if (invoiceBrutto() > 0 && n - invoiceBrutto() > 0.005) {
                      update("betrag_netto", formatForInput(nettoAusBrutto(), 2));
                      toast({
                        variant: "destructive",
                        title: "Netto größer als Brutto",
                        description: `Netto ${eur(n)} ist größer als der Bruttobetrag ${eur(invoiceBrutto())} — korrigiert auf ${eur(nettoAusBrutto())}.`,
                        duration: 7000,
                      });
                      return;
                    }
                    update("betrag_netto", formatForInput(round2(Math.max(0, n)), 2));
                  }}
                />
                {nettoUeberBrutto() && (
                  <p className="text-[11px] font-medium text-destructive mt-0.5" data-testid="det-netto-warnung">
                    Netto darf nicht größer sein als Brutto ({eur(invoiceBrutto())}).
                  </p>
                )}
              </div>
              <div>
                <Label>USt-Satz (%)</Label>
                <Select
                  value={String(form.ust_satz || 20)}
                  onValueChange={v => {
                    setForm((prev: any) => ({
                      ...prev,
                      ust_satz: v,
                      betrag_netto: deriveNetto(prev.betrag_brutto, v) ?? prev.betrag_netto,
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="13">13%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kategorie</Label>
                <Select value={form.kategorie || "sonstiges"} onValueChange={v => update("kategorie", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {kategorien.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Projekt</Label>
                <Select value={form.project_id || "none"} onValueChange={v => update("project_id", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Projekt</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status || "offen"} onValueChange={v => update("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offen">Offen</SelectItem>
                    <SelectItem value="bezahlt">Bezahlt</SelectItem>
                    <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fällig am</Label>
                <Input type="date" value={form.faellig_am || ""} onChange={e => update("faellig_am", e.target.value)} />
              </div>
              <div>
                <Label>Bezahlt am</Label>
                <Input type="date" value={form.bezahlt_am || ""} onChange={e => update("bezahlt_am", e.target.value)} />
              </div>
              <div>
                <Label>Zahlungsart</Label>
                <Select value={form.zahlungsart || "ueberweisung"} onValueChange={v => update("zahlungsart", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ueberweisung">Überweisung</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="karte">Karte</SelectItem>
                    <SelectItem value="lastschrift">Lastschrift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Notizen</Label>
                <Textarea value={form.notizen || ""} onChange={e => update("notizen", e.target.value)} rows={3} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>Abbrechen</Button>
          <Button className="h-11" onClick={handleSave} disabled={saving || !form}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichert...</> : <><Save className="h-4 w-4 mr-2" /> Speichern</>}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Verrechnen-Picker */}
      <Dialog open={verrechnenOpen} onOpenChange={(o) => !o && setVerrechnenOpen(false)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[80vh] flex flex-col p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>In welcher Rechnung verrechnet?</DialogTitle>
            <DialogDescription>
              Wähle die Ausgangsrechnung, in der die Kosten an den Kunden weiterverrechnet werden.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nummer oder Kunde suchen..."
              value={verrechnenSearch}
              onChange={(e) => setVerrechnenSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 -mx-1">
            {invoiceOptions
              .filter(o => {
                const s = verrechnenSearch.trim().toLowerCase();
                if (!s) return true;
                return o.nummer.toLowerCase().includes(s) || (o.kunde || "").toLowerCase().includes(s);
              })
              .map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => confirmVerrechnen(o.id)}
                  className="w-full min-h-[44px] text-left flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent"
                >
                  <div className="flex-1">
                    <div className="font-medium">{o.nummer}</div>
                    <div className="text-xs text-muted-foreground truncate">{o.kunde}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {o.datum ? new Date(o.datum).toLocaleDateString("de-AT") : ""}
                  </span>
                </button>
              ))}
            {invoiceOptions.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-4">Lädt...</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerrechnenOpen(false)}>Abbrechen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
