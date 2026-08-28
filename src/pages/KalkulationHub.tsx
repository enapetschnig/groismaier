import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import {
  Calculator, Plus, FileText, Trash2, User, Clock, MoreVertical,
  Copy, LayoutTemplate, Pencil, FilePlus2, FolderOpen, ArrowLeft,
} from "lucide-react";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CustomerSelect } from "@/components/CustomerSelect";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AngebotItem, ProjektErgebnis, buildAngebotItems, calcProjekt,
  normalizeKalkulationState, resolveBetriebsdaten, round2,
} from "@/lib/kalkulationEngine";

// Hinweis: Die Tabelle `kalkulationen` (inkl. Spalte `ist_vorlage`, siehe
// Migration 20260716090200_kalkulation_vorlagen.sql) fehlt in den generierten
// Supabase-Typen (src/integrations/supabase/types.ts). Deshalb wird hier wie
// bisher mit `from("kalkulationen" as never) as any` gecastet und lokal getippt.
interface KalkRow {
  id: string;
  name: string;
  summe: number | null;
  updated_at: string;
  customer_id: string | null;
  ist_vorlage: boolean;
  customers?: { name: string } | null;
}

const NO_TEMPLATE = "__none__";

const kalkTable = () => (supabase.from("kalkulationen" as never) as any);

const fmtEuro = (n: number) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(n || 0);

/**
 * Sammelzeilen um die echten Selbstkosten ihres Aufbaus ergänzen (für den
 * internen Verdienst-Block im Beleg-Editor). Bewusst dupliziert wie in
 * KalkulationEditor.tsx/InvoiceDetail.tsx — Zuordnung über die Reihenfolge.
 */
function mitSelbstkosten(items: AngebotItem[], projekt: ProjektErgebnis): AngebotItem[] {
  const zeilenMitBetrag = projekt.zeilen.filter((z) => round2(z.gesamtAdj) > 0);
  let k = 0;
  return items.map((it) => {
    if (!it.ist_gruppensumme) return it;
    const zeile = zeilenMitBetrag[k];
    k += 1;
    return { ...it, ek_preis: round2(zeile?.verdienst.selbstkosten ?? 0) };
  });
}

/** Gemeinsamer Namens-Anfang der gewählten Kalkulationen ("Knapp - …" → "Knapp"). */
function gemeinsamerPraefix(namen: string[]): string {
  if (namen.length === 0) return "";
  let p = namen[0];
  for (const n of namen.slice(1)) {
    while (p && !n.startsWith(p)) p = p.slice(0, -1);
  }
  return p.replace(/[\s\-–—·/,]+$/, "").trim();
}

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return ""; }
};

export default function KalkulationHub() {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const { toast } = useToast();
  const [rows, setRows] = useState<KalkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"kalkulationen" | "vorlagen">("kalkulationen");

  // Neu-anlegen-Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [creating, setCreating] = useState(false);

  // Löschen
  const [deleteRow, setDeleteRow] = useState<KalkRow | null>(null);

  // Als Vorlage speichern
  const [vorlageSource, setVorlageSource] = useState<KalkRow | null>(null);
  const [vorlageName, setVorlageName] = useState("");
  const [savingVorlage, setSavingVorlage] = useState(false);

  // Neue Kalkulation aus Vorlage
  const [fromVorlage, setFromVorlage] = useState<KalkRow | null>(null);
  const [fromVorlageName, setFromVorlageName] = useState("");
  const [fromVorlageCustomerId, setFromVorlageCustomerId] = useState<string | null>(null);
  const [creatingFromVorlage, setCreatingFromVorlage] = useState(false);

  // Bauvorhaben wechseln (Kundenwunsch 26.08.2026: "den Ordner vom
  // Bauvorhaben Knapp ins Bauvorhaben Knapp uebersiedeln") — die
  // Ordner richten sich nach dem Kunden der Kalkulation.
  const [bvWechselRow, setBvWechselRow] = useState<KalkRow | null>(null);
  const [bvWechselKunde, setBvWechselKunde] = useState<string | null>(null);
  const [bvWechselLaeuft, setBvWechselLaeuft] = useState(false);

  // Ordner-Aktionen (Kundenwunsch 27.08.2026: "Ich kann hier nichts
  // verändern, z.B. einen Ordner löschen oder umbenennen"). Der Ordnername
  // IST der Kundenname — Umbenennen ändert den Kunden, Löschen entfernt die
  // Kalkulationen im Ordner (der Kunde bleibt bestehen).
  const [bvRename, setBvRename] = useState<{ customerId: string; titel: string } | null>(null);
  const [bvRenameName, setBvRenameName] = useState("");
  const [bvRenaming, setBvRenaming] = useState(false);
  const [bvDelete, setBvDelete] = useState<{ key: string; titel: string; rows: KalkRow[] } | null>(null);
  const [bvDeleting, setBvDeleting] = useState(false);

  // Umbenennen (Vorlage)
  const [renameRow, setRenameRow] = useState<KalkRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Gemeinsames Angebot aus mehreren Kalkulationen (Kundenwunsch 23.08.2026:
  // "mehrere Projektabschnitte … Kannst du das sinnvoll zusammenführen?
  // Im Anbot können dann diese Bereiche auch gesondert dargestellt werden").
  // `auswahl` hält die IDs in KLICK-Reihenfolge — sie bestimmt die
  // Bereichs-Reihenfolge im Angebot.
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [sammelOpen, setSammelOpen] = useState(false);
  const [sammelBetreff, setSammelBetreff] = useState("");
  const [sammelErstellt, setSammelErstellt] = useState(false);

  const toggleAuswahl = (id: string) =>
    setAuswahl((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const oeffneSammelangebot = () => {
    const namen = auswahl
      .map((id) => rows.find((r) => r.id === id)?.name || "")
      .filter(Boolean);
    const praefix = gemeinsamerPraefix(namen);
    setSammelBetreff(praefix ? `${praefix} – Gesamtangebot` : "Gesamtangebot");
    setSammelOpen(true);
  };

  const erstelleSammelangebot = async () => {
    setSammelErstellt(true);
    try {
      const gewaehlt = auswahl
        .map((id) => rows.find((r) => r.id === id))
        .filter((r): r is KalkRow => !!r);
      // Betriebsdaten wie im Editor: kalk_*-Stammdaten aus app_settings.
      const { data: setData } = await supabase
        .from("app_settings").select("key, value").like("key", "kalk\\_%");
      const settings: Record<string, string> = {};
      for (const s of setData || []) settings[s.key] = s.value;

      const alleItems: AngebotItem[] = [];
      const leere: string[] = [];
      for (const r of gewaehlt) {
        const { data } = await kalkTable().select("id, name, data").eq("id", r.id).maybeSingle();
        const st = normalizeKalkulationState((data as any)?.data);
        const bd = resolveBetriebsdaten(st.settings.businessData, settings);
        const projekt = calcProjekt(st, bd);
        const { items } = buildAngebotItems(projekt);
        if (items.length === 0) { leere.push(r.name); continue; }
        // Bereichs-Überschrift: reine Textzeile (menge 0, keine Einheit, kein
        // Preis) — druckt nur den Text, siehe istTextzeile() in invoiceHtml.
        alleItems.push({
          beschreibung: `Bereich: ${r.name}`,
          menge: 0, einheit: "", einzelpreis: 0, gesamtpreis: 0,
          gruppe: undefined, auf_pdf: true, ist_gruppensumme: false,
          bereich: r.name,
        } as AngebotItem);
        // Gruppen müssen über das GANZE Angebot eindeutig sein (zwei Aufbauten
        // "Dach" in verschiedenen Bereichen fielen sonst zusammen). Suffix statt
        // Präfix: so trägt die Sammelzeile den Gruppennamen weiterhin und die
        // PDF-Kapitellogik druckt keine doppelte Überschrift.
        for (const it of mitSelbstkosten(items, projekt)) {
          alleItems.push({ ...it, gruppe: it.gruppe ? `${it.gruppe} — ${r.name}` : it.gruppe, bereich: r.name });
        }
      }
      if (!alleItems.some((it) => it.ist_gruppensumme)) {
        toast({ variant: "destructive", title: "Nichts zu übernehmen", description: "Keine der gewählten Kalkulationen enthält Aufbauten mit Betrag." });
        return;
      }
      if (leere.length > 0) {
        toast({ title: "Hinweis", description: `Ohne Beträge übersprungen: ${leere.join(", ")}` });
      }
      sessionStorage.setItem("kalkulation_to_angebot", JSON.stringify({
        betreff: sammelBetreff.trim() || "Gesamtangebot",
        customer_id: gewaehlt.find((r) => r.customer_id)?.customer_id || null,
        // Herkunft: kalkulation_id = erste Quelle (bestehende Verknüpfung),
        // kalkulation_ids = ALLE Quellen in Bereichs-Reihenfolge — damit kann
        // „Positionen neu übernehmen" das Sammelangebot komplett neu aufbauen.
        kalkulation_id: gewaehlt[0]?.id || null,
        kalkulation_ids: gewaehlt.map((r) => r.id),
        items: alleItems,
      }));
      navigate("/invoices/new?typ=angebot&from_kalkulation=1");
    } finally {
      setSammelErstellt(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await kalkTable()
      .select("id, name, summe, updated_at, customer_id, ist_vorlage, customers(name)")
      .order("updated_at", { ascending: false });
    if (error) {
      // Fallback, solange die Migration (ist_vorlage) noch nicht eingespielt ist.
      const { data: fallback } = await kalkTable()
        .select("id, name, summe, updated_at, customer_id, customers(name)")
        .order("updated_at", { ascending: false });
      setRows(((fallback as KalkRow[]) || []).map((r) => ({ ...r, ist_vorlage: false })));
    } else {
      setRows((data as KalkRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep-Link von der KingBill-Hauptmaske: ?neu=1 öffnet den Anlege-Dialog
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("neu") === "1") setDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kalkulationen = useMemo(() => rows.filter((r) => !r.ist_vorlage), [rows]);
  const vorlagen = useMemo(() => rows.filter((r) => r.ist_vorlage), [rows]);

  /**
   * Bauvorhaben-Ansicht (Kundenwunsch 25.08.2026: „die Kalkulations-
   * uebersicht pro BV ... dann klickt man drauf und kommt rein").
   * Gruppiert wird nach dem KUNDEN — der ist an der Kalkulation bereits
   * gepflegt (Anlege-Dialog) und entspricht Christians „BV Knapp".
   * Kalkulationen ohne Kunde landen in einer eigenen Gruppe.
   */
  const OHNE_KUNDE = "__ohne__";
  const [offenesBv, setOffenesBv] = useState<string | null>(null);
  const bauvorhaben = useMemo(() => {
    const map = new Map<string, { key: string; titel: string; rows: KalkRow[]; summe: number; letzte: string }>();
    for (const r of kalkulationen) {
      const key = r.customer_id || OHNE_KUNDE;
      const titel = r.customers?.name || "Ohne Kunde";
      const e = map.get(key) || { key, titel, rows: [], summe: 0, letzte: r.updated_at };
      e.rows.push(r);
      e.summe += Number(r.summe) || 0;
      if (r.updated_at > e.letzte) e.letzte = r.updated_at;
      map.set(key, e);
    }
    // Zuletzt bearbeitete Bauvorhaben zuerst.
    return [...map.values()].sort((a, b) => (a.letzte < b.letzte ? 1 : -1));
  }, [kalkulationen]);
  const offenesBvObjekt = bauvorhaben.find((b) => b.key === offenesBv) || null;

  /** Vollständige Zeile (inkl. data-Blob) für Kopier-Aktionen laden. */
  const fetchFull = async (id: string): Promise<any | null> => {
    const { data, error } = await kalkTable()
      .select("id, name, customer_id, project_id, data, summe")
      .eq("id", id)
      .single();
    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: error?.message || "Kalkulation konnte nicht geladen werden." });
      return null;
    }
    return data;
  };

  const insertCopy = async (values: Record<string, unknown>): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await kalkTable()
      .insert({ user_id: user?.id, ...values })
      .select("id")
      .single();
    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: error?.message || "Speichern fehlgeschlagen." });
      return null;
    }
    return (data as any).id as string;
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Kalkulation angeben." });
      return;
    }
    setCreating(true);
    let data: unknown = null;
    let summe = 0;
    if (templateId !== NO_TEMPLATE) {
      const tpl = await fetchFull(templateId);
      if (!tpl) { setCreating(false); return; }
      data = tpl.data;
      summe = Number(tpl.summe) || 0;
    }
    // ist_vorlage wird nicht mitgeschickt: DB-Default false (funktioniert so
    // auch, bevor die Migration 20260716090200 eingespielt ist).
    const id = await insertCopy({
      name: name.trim(), customer_id: customerId, data, summe,
    });
    setCreating(false);
    if (!id) return;
    setDialogOpen(false);
    setName(""); setCustomerId(null); setTemplateId(NO_TEMPLATE);
    navigate(`/auftragskalkulation/${id}`);
  };

  const handleDuplicate = async (row: KalkRow) => {
    const src = await fetchFull(row.id);
    if (!src) return;
    const id = await insertCopy({
      name: `${src.name} (Kopie)`,
      customer_id: src.customer_id,
      project_id: src.project_id,
      data: src.data,
      summe: src.summe,
    });
    if (!id) return;
    toast({ title: "Dupliziert", description: `„${src.name} (Kopie)“ wurde angelegt.` });
    load();
  };

  const handleSaveAsVorlage = async () => {
    if (!vorlageSource) return;
    if (!vorlageName.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Vorlage angeben." });
      return;
    }
    setSavingVorlage(true);
    const src = await fetchFull(vorlageSource.id);
    if (!src) { setSavingVorlage(false); return; }
    const id = await insertCopy({
      name: vorlageName.trim(),
      customer_id: null,
      project_id: null,
      data: src.data,
      summe: src.summe,
      ist_vorlage: true,
    });
    setSavingVorlage(false);
    if (!id) return;
    setVorlageSource(null);
    toast({ title: "Vorlage gespeichert", description: `Vorlage „${vorlageName.trim()}“ wurde angelegt.` });
    setTab("vorlagen");
    load();
  };

  const handleCreateFromVorlage = async () => {
    if (!fromVorlage) return;
    if (!fromVorlageName.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Kalkulation angeben." });
      return;
    }
    setCreatingFromVorlage(true);
    const src = await fetchFull(fromVorlage.id);
    if (!src) { setCreatingFromVorlage(false); return; }
    const id = await insertCopy({
      name: fromVorlageName.trim(),
      customer_id: fromVorlageCustomerId,
      data: src.data,
      summe: src.summe,
      ist_vorlage: false,
    }); // explizit false, da die Quelle eine Vorlage ist
    setCreatingFromVorlage(false);
    if (!id) return;
    setFromVorlage(null);
    navigate(`/auftragskalkulation/${id}`);
  };

  const handleRename = async () => {
    if (!renameRow) return;
    if (!renameName.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen angeben." });
      return;
    }
    setRenaming(true);
    const { error } = await kalkTable().update({ name: renameName.trim() }).eq("id", renameRow.id);
    setRenaming(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    setRenameRow(null);
    toast({ title: "Umbenannt", description: "Der Name wurde aktualisiert." });
    load();
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    await kalkTable().delete().eq("id", deleteRow.id);
    const wasVorlage = deleteRow.ist_vorlage;
    setDeleteRow(null);
    toast({ title: "Gelöscht", description: wasVorlage ? "Vorlage wurde gelöscht." : "Kalkulation wurde gelöscht." });
    load();
  };

  const bauvorhabenWechseln = async () => {
    if (!bvWechselRow) return;
    setBvWechselLaeuft(true);
    const { error } = await kalkTable()
      .update({ customer_id: bvWechselKunde })
      .eq("id", bvWechselRow.id);
    setBvWechselLaeuft(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({
      title: "Verschoben",
      description: bvWechselKunde
        ? `„${bvWechselRow.name}" liegt jetzt im Bauvorhaben des gewählten Kunden.`
        : `„${bvWechselRow.name}" liegt jetzt unter „Ohne Kunde".`,
    });
    setBvWechselRow(null);
    load();
  };

  const ordnerUmbenennen = async () => {
    if (!bvRename) return;
    const neu = bvRenameName.trim();
    if (!neu) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen angeben." });
      return;
    }
    setBvRenaming(true);
    const { error } = await supabase.from("customers").update({ name: neu }).eq("id", bvRename.customerId);
    setBvRenaming(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: `Umbenennen fehlgeschlagen: ${error.message}` });
      return;
    }
    toast({ title: "Umbenannt", description: `Der Kunde heißt jetzt „${neu}" — der Ordner und alle Stellen mit diesem Kunden zeigen den neuen Namen.` });
    setBvRename(null);
    load();
  };

  const ordnerLoeschen = async () => {
    if (!bvDelete) return;
    setBvDeleting(true);
    const { error } = await kalkTable().delete().in("id", bvDelete.rows.map((r) => r.id));
    setBvDeleting(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: `Löschen fehlgeschlagen: ${error.message}` });
      return;
    }
    toast({ title: "Ordner geleert", description: `${bvDelete.rows.length} Kalkulation${bvDelete.rows.length === 1 ? "" : "en"} gelöscht. Der Kunde selbst bleibt bestehen.` });
    setBvDelete(null);
    load();
  };

  const renderCard = (r: KalkRow) => (
    <Card
      key={r.id}
      className="flex flex-col hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => navigate(`/auftragskalkulation/${r.id}`)}
    >
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          {/* Auswahl fürs gemeinsame Angebot (Kundenwunsch 23.08.2026) */}
          {!r.ist_vorlage && (
            <span
              className="flex h-10 items-center gap-1 pr-1"
              onClick={(e) => { e.stopPropagation(); toggleAuswahl(r.id); }}
              title="Für ein gemeinsames Angebot auswählen — die Nummer zeigt die Bereichs-Reihenfolge"
            >
              <Checkbox
                checked={auswahl.includes(r.id)}
                className="h-5 w-5"
                aria-label={`${r.name} für gemeinsames Angebot auswählen`}
              />
              {auswahl.includes(r.id) && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {auswahl.indexOf(r.id) + 1}
                </span>
              )}
            </span>
          )}
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {r.ist_vorlage
              ? <LayoutTemplate className="h-5 w-5 text-primary" />
              : <FileText className="h-5 w-5 text-primary" />}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-11 w-11 text-muted-foreground sm:h-8 sm:w-8 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
                title="Aktionen"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {r.ist_vorlage ? (
                <>
                  <DropdownMenuItem onClick={() => {
                    setFromVorlage(r);
                    setFromVorlageName(r.name);
                    setFromVorlageCustomerId(null);
                  }}>
                    <FilePlus2 className="h-4 w-4 mr-2" /> Neue Kalkulation aus Vorlage
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setRenameRow(r); setRenameName(r.name); }}>
                    <Pencil className="h-4 w-4 mr-2" /> Umbenennen
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => { setRenameRow(r); setRenameName(r.name); }}>
                    <Pencil className="h-4 w-4 mr-2" /> Umbenennen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setBvWechselRow(r); setBvWechselKunde(r.customer_id); }}>
                    <FolderOpen className="h-4 w-4 mr-2" /> Bauvorhaben ändern
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDuplicate(r)}>
                    <Copy className="h-4 w-4 mr-2" /> Duplizieren
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setVorlageSource(r); setVorlageName(r.name); }}>
                    <LayoutTemplate className="h-4 w-4 mr-2" /> Als Vorlage speichern
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteRow(r)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardTitle className="text-base leading-snug">{r.name}</CardTitle>
        <CardDescription className="text-xs space-y-1">
          {r.customers?.name && (
            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {r.customers.name}</span>
          )}
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDate(r.updated_at)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <div className="text-lg font-bold text-primary">{fmtEuro(Number(r.summe) || 0)}</div>
      </CardContent>
    </Card>
  );

  const list = tab === "vorlagen" ? vorlagen : kalkulationen;

  return (
    <div className="min-h-screen kb-page">
      {/* KingBill-Toolbar: Zurück führt IMMER zur Startmaske (kein navigate(-1)-
          Ping-Pong zwischen Hub und Editor) */}
      <KBToolbar
        onBack={zurueck}
        title="Kalkulation"
        rightActions={
          <KBToolbarButton
            icon={Plus}
            label="Neue Kalkulation"
            variant="green"
            onClick={() => setDialogOpen(true)}
          />
        }
      />

      <div className="mx-auto w-full px-3 sm:px-4 lg:px-6 py-6 max-w-5xl">
        {/* KingBill-Tabs: Kalkulationen / Vorlagen mit gelber Aktiv-Umrandung */}
        <div className="mb-6 flex items-center gap-1.5">
          <button
            type="button"
            className={tab === "kalkulationen" ? "kb-tab kb-tab-active" : "kb-tab"}
            onClick={() => setTab("kalkulationen")}
          >
            Kalkulationen{kalkulationen.length > 0 ? ` (${kalkulationen.length})` : ""}
          </button>
          <button
            type="button"
            className={tab === "vorlagen" ? "kb-tab kb-tab-active" : "kb-tab"}
            onClick={() => { setTab("vorlagen"); setOffenesBv(null); }}
          >
            Vorlagen{vorlagen.length > 0 ? ` (${vorlagen.length})` : ""}
          </button>
        </div>

        {/* Auswahl-Leiste: gemeinsames Angebot aus mehreren Kalkulationen */}
        {tab === "kalkulationen" && auswahl.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
            <span className="text-sm">
              <b>{auswahl.length}</b> Kalkulation{auswahl.length === 1 ? "" : "en"} ausgewählt
            </span>
            <span className="flex-1" />
            <Button
              size="sm"
              className="h-10"
              disabled={auswahl.length < 2}
              title={auswahl.length < 2 ? "Mindestens zwei Kalkulationen auswählen" : undefined}
              onClick={oeffneSammelangebot}
            >
              <FileText className="mr-1.5 h-4 w-4" /> Gemeinsames Angebot erstellen
            </Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setAuswahl([])}>
              Auswahl aufheben
            </Button>
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground py-12 text-center">Lädt …</p>
        ) : list.length === 0 ? (
          tab === "vorlagen" ? (
            <div className="text-center py-16">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <LayoutTemplate className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-1">Noch keine Vorlage</h2>
              <p className="text-muted-foreground">
                Speichere eine bestehende Kalkulation über „Als Vorlage speichern“ als Vorlage.
              </p>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Calculator className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-1">Noch keine Kalkulation</h2>
              <p className="text-muted-foreground mb-5">Lege deine erste Auftragskalkulation an.</p>
              <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Neue Kalkulation</Button>
            </div>
          )
        ) : tab === "kalkulationen" && !offenesBv ? (
          /* Bauvorhaben-Ordner (Kundenwunsch 25.08.2026): erst das BV, dann
             die Kalkulationen darin — "dann bleibt das übersichtlicher". */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bauvorhaben.map((bv) => (
              <Card
                key={bv.key}
                className="flex cursor-pointer flex-col transition-shadow hover:shadow-md"
                onClick={() => setOffenesBv(bv.key)}
              >
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base leading-snug">{bv.titel}</CardTitle>
                      <CardDescription className="text-xs">
                        {bv.rows.length} Kalkulation{bv.rows.length === 1 ? "" : "en"} · zuletzt {fmtDate(bv.letzte)}
                      </CardDescription>
                    </div>
                    {/* Ordner-Aktionen (Kundenwunsch 27.08.2026) */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          className="h-11 w-11 shrink-0 text-muted-foreground sm:h-8 sm:w-8"
                          onClick={(e) => e.stopPropagation()}
                          title="Ordner-Aktionen"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {bv.key !== OHNE_KUNDE && (
                          <DropdownMenuItem onClick={() => { setBvRename({ customerId: bv.key, titel: bv.titel }); setBvRenameName(bv.titel); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Ordner umbenennen
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setBvDelete({ key: bv.key, titel: bv.titel, rows: bv.rows })}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Ordner löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="text-lg font-bold text-primary">{fmtEuro(bv.summe)}</div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {bv.rows.slice(0, 3).map((r) => r.name).join(" · ")}
                    {bv.rows.length > 3 ? " …" : ""}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Innerhalb eines Bauvorhabens: Kopfzeile mit Zurück */}
            {tab === "kalkulationen" && offenesBvObjekt && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
                <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={() => setOffenesBv(null)}>
                  <ArrowLeft className="h-4 w-4" /> Alle Bauvorhaben
                </Button>
                <span className="min-w-0 truncate text-sm font-semibold">{offenesBvObjekt.titel}</span>
                <span className="ml-auto text-sm font-bold text-primary">{fmtEuro(offenesBvObjekt.summe)}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(tab === "kalkulationen" && offenesBvObjekt ? offenesBvObjekt.rows : list).map(renderCard)}
            </div>
          </>
        )}
      </div>

      {/* Bauvorhaben (= Kunde) einer Kalkulation ändern */}
      <Dialog open={!!bvWechselRow} onOpenChange={(o) => { if (!o) setBvWechselRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bauvorhaben ändern</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              „{bvWechselRow?.name}" in das Bauvorhaben eines anderen Kunden
              verschieben. Die Ordner in der Übersicht richten sich nach dem
              Kunden der Kalkulation.
            </p>
            <div className="space-y-1.5">
              <Label>Kunde / Bauvorhaben</Label>
              <CustomerSelect value={bvWechselKunde} onChange={(id) => setBvWechselKunde(id)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBvWechselRow(null)}>Abbrechen</Button>
              <Button onClick={() => void bauvorhabenWechseln()} disabled={bvWechselLaeuft}>
                {bvWechselLaeuft ? "Wird verschoben …" : "Verschieben"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gemeinsames Angebot aus mehreren Kalkulationen */}
      <Dialog open={sammelOpen} onOpenChange={setSammelOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gemeinsames Angebot erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Jede Kalkulation wird als eigener <b>Bereich</b> mit Überschrift
              ins Angebot übernommen — in dieser Reihenfolge (= Reihenfolge des
              Anklickens):
            </p>
            <div className="divide-y rounded border">
              {auswahl.map((id, i) => {
                const r = rows.find((x) => x.id === id);
                if (!r) return null;
                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">{fmtEuro(Number(r.summe) || 0)}</span>
                  </div>
                );
              })}
            </div>
            {(() => {
              const kunden = new Set(
                auswahl.map((id) => rows.find((x) => x.id === id)?.customer_id).filter(Boolean),
              );
              return kunden.size > 1 ? (
                <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Achtung: Die gewählten Kalkulationen gehören zu verschiedenen
                  Kunden — ins Angebot wird der Kunde der ersten übernommen.
                </p>
              ) : null;
            })()}
            <div className="space-y-1.5">
              <Label>Betreff des Angebots</Label>
              <Input
                value={sammelBetreff}
                onChange={(e) => setSammelBetreff(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void erstelleSammelangebot(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSammelOpen(false)}>Abbrechen</Button>
              <Button onClick={() => void erstelleSammelangebot()} disabled={sammelErstellt}>
                {sammelErstellt ? "Wird erstellt …" : "Angebot erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Neue Kalkulation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Kalkulation</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="kalk-name">Bezeichnung *</Label>
              <Input
                id="kalk-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                placeholder="z.B. BV Mustermann – Einfamilienhaus"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kunde (optional)</Label>
              <CustomerSelect value={customerId} onChange={(id) => setCustomerId(id)} />
            </div>
            {vorlagen.length > 0 && (
              <div className="space-y-1.5">
                <Label>Aus Vorlage (optional)</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Leere Kalkulation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>Leere Kalkulation</SelectItem>
                    {vorlagen.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Wird angelegt …" : "Anlegen & kalkulieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Als Vorlage speichern Dialog */}
      <Dialog open={!!vorlageSource} onOpenChange={(o) => !o && setVorlageSource(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Als Vorlage speichern</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Es wird eine Kopie von „{vorlageSource?.name}“ als Vorlage gespeichert. Kunde und Projekt werden dabei nicht übernommen.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="vorlage-name">Vorlagenname *</Label>
              <Input
                id="vorlage-name" autoFocus value={vorlageName} onChange={(e) => setVorlageName(e.target.value)}
                placeholder="z.B. Vorlage Carport"
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveAsVorlage(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVorlageSource(null)}>Abbrechen</Button>
            <Button onClick={handleSaveAsVorlage} disabled={savingVorlage}>
              {savingVorlage ? "Wird gespeichert …" : "Vorlage speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Neue Kalkulation aus Vorlage Dialog */}
      <Dialog open={!!fromVorlage} onOpenChange={(o) => !o && setFromVorlage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Kalkulation aus Vorlage</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Vorlage: „{fromVorlage?.name}“
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="from-vorlage-name">Bezeichnung *</Label>
              <Input
                id="from-vorlage-name" autoFocus value={fromVorlageName}
                onChange={(e) => setFromVorlageName(e.target.value)}
                placeholder="z.B. BV Mustermann – Einfamilienhaus"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFromVorlage(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kunde (optional)</Label>
              <CustomerSelect value={fromVorlageCustomerId} onChange={(id) => setFromVorlageCustomerId(id)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFromVorlage(null)}>Abbrechen</Button>
            <Button onClick={handleCreateFromVorlage} disabled={creatingFromVorlage}>
              {creatingFromVorlage ? "Wird angelegt …" : "Anlegen & kalkulieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Umbenennen Dialog */}
      <Dialog open={!!renameRow} onOpenChange={(o) => !o && setRenameRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{renameRow?.ist_vorlage ? "Vorlage umbenennen" : "Kalkulation umbenennen"}</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="rename-name">Name *</Label>
            <Input
              id="rename-name" autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameRow(null)}>Abbrechen</Button>
            <Button onClick={handleRename} disabled={renaming}>
              {renaming ? "Wird gespeichert …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Löschen Bestätigung */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteRow?.ist_vorlage ? "Vorlage löschen?" : "Kalkulation löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow?.ist_vorlage
                ? "Diese Vorlage wird dauerhaft gelöscht. Bereits daraus erstellte Kalkulationen bleiben erhalten."
                : "Diese Kalkulation wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ordner umbenennen (Kundenwunsch 27.08.2026) */}
      <Dialog open={!!bvRename} onOpenChange={(o) => !o && setBvRename(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ordner umbenennen</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="bv-rename-name">Name *</Label>
            <Input
              id="bv-rename-name" autoFocus value={bvRenameName} onChange={(e) => setBvRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ordnerUmbenennen(); }}
            />
            <p className="text-xs text-muted-foreground">
              Der Ordnername ist der Kundenname — Umbenennen ändert den Kunden überall
              (auch auf Belegen, die den Kunden neu laden).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBvRename(null)}>Abbrechen</Button>
            <Button onClick={ordnerUmbenennen} disabled={bvRenaming}>
              {bvRenaming ? "Wird gespeichert …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ordner löschen (Kundenwunsch 27.08.2026) */}
      <AlertDialog open={!!bvDelete} onOpenChange={(o) => !o && setBvDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ordner „{bvDelete?.titel}" löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {bvDelete && (
                <>
                  Dabei {bvDelete.rows.length === 1 ? "wird die enthaltene Kalkulation" : `werden alle ${bvDelete.rows.length} enthaltenen Kalkulationen`} dauerhaft
                  gelöscht: {bvDelete.rows.map((r) => `„${r.name}"`).join(", ")}. Der Kunde selbst bleibt bestehen.
                  Das kann nicht rückgängig gemacht werden.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={ordnerLoeschen} disabled={bvDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bvDeleting ? "Löscht …" : "Ordner löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
