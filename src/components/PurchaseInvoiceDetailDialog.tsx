import { useState, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Save, Loader2, Receipt, Lock, Search, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

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

  const loadData = async () => {
    if (!invoiceId) return;
    setLoading(true);
    const [{ data: inv, error: invError }, { data: projs }] = await Promise.all([
      supabase.from("purchase_invoices").select("*").eq("id", invoiceId).single(),
      supabase.from("projects").select("id, name").order("name"),
    ]);
    if (invError) {
      toast({ variant: "destructive", title: "Fehler", description: "Eingangsrechnung konnte nicht geladen werden." });
      setLoading(false);
      return;
    }
    if (inv) {
      setForm(inv);
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

  const handleSave = async () => {
    if (!form) return;
    // Validierung: Lieferant + gültiger Bruttobetrag (verhindert NaN in der DB)
    if (!form.lieferant?.trim()) {
      toast({ variant: "destructive", title: "Lieferant fehlt", description: "Bitte einen Lieferanten eingeben." });
      return;
    }
    const brutto = parseFloat(form.betrag_brutto);
    if (!Number.isFinite(brutto) || brutto <= 0) {
      toast({ variant: "destructive", title: "Betrag ungültig", description: "Bitte einen gültigen Bruttobetrag (> 0) eingeben." });
      return;
    }
    const toNumOrNull = (v: any) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    setSaving(true);
    const { error } = await supabase.from("purchase_invoices").update({
      lieferant: form.lieferant.trim(),
      rechnungsnummer: form.rechnungsnummer || null,
      rechnungsdatum: form.rechnungsdatum || null,
      faellig_am: form.faellig_am || null,
      bezahlt_am: form.bezahlt_am || null,
      betrag_brutto: brutto,
      betrag_netto: toNumOrNull(form.betrag_netto),
      ust_satz: toNumOrNull(form.ust_satz),
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eingangsrechnung bearbeiten</DialogTitle>
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
                      className="w-full h-[420px] bg-white"
                    />
                  ) : (
                    <img
                      src={fileUrl}
                      alt={form.file_name || "Rechnung"}
                      className="w-full max-h-[420px] object-contain bg-white"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={openFile} className="flex-1 gap-2">
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
                    <Button variant="outline" size="sm" onClick={unsetVerrechnet} className="gap-1">
                      <X className="h-3.5 w-3.5" />
                      Verrechnung aufheben
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Noch nicht an Kunden verrechnet.
                  </span>
                  <Button variant="outline" size="sm" onClick={openVerrechnen} className="gap-1">
                    <Receipt className="h-3.5 w-3.5" />
                    Als verrechnet markieren
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
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
                <Input type="number" step="0.01" value={form.betrag_brutto || ""} onChange={e => update("betrag_brutto", e.target.value)} />
              </div>
              <div>
                <Label>Betrag Netto (€)</Label>
                <Input type="number" step="0.01" value={form.betrag_netto || ""} onChange={e => update("betrag_netto", e.target.value)} />
              </div>
              <div>
                <Label>USt-Satz (%)</Label>
                <Select value={String(form.ust_satz || 20)} onValueChange={v => update("ust_satz", v)}>
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
              <div className="col-span-2">
                <Label>Notizen</Label>
                <Textarea value={form.notizen || ""} onChange={e => update("notizen", e.target.value)} rows={3} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !form}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichert...</> : <><Save className="h-4 w-4 mr-2" /> Speichern</>}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Verrechnen-Picker */}
      <Dialog open={verrechnenOpen} onOpenChange={(o) => !o && setVerrechnenOpen(false)}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
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
                  className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent"
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
