/**
 * KFZ-Manager (Fahrzeuge) — KingBill-Listenmaske.
 *
 * Aufbau exakt wie src/pages/Customers.tsx:
 *   KBToolbar [Zurück] „Fahrzeuge" [+ Neu][Bearbeiten][Löschen][Liste drucken]
 *   + linke Filterspalte (kb-panel, mobil einklappbar)
 *   + Fahrzeug-Grid rechts (Einfachklick markiert, Doppelklick bearbeitet).
 *
 * Der Editor-Dialog enthält neben den Stammdaten eine kb-tab-Leiste:
 *   „Kosten"   — vehicle_costs des Fahrzeugs (anlegen/löschen, Summe)
 *                => das ist die „Reparaturkosten auf ein Kennzeichen buchen"-Funktion
 *   „Einsätze" — letzte 50 time_entry_vehicles (read-only)
 *
 * Hinweis zu den Typen: vehicle_costs und employees.standard_vehicle_id sind
 * erst per Migration 20260719100000 dazugekommen; src/integrations/supabase/types.ts
 * wurde bewusst NICHT neu generiert. Deshalb laufen alle Zugriffe auf diese
 * Objekte über `(supabase.from("…" as never) as any)` + lokale Interfaces.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { matchesSearch } from "@/lib/searchUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Plus, Pencil, Trash2, Printer, Filter, ChevronDown, ChevronUp, Check, Truck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Vehicle {
  id: string;
  bezeichnung: string;
  kennzeichen: string | null;
  typ: string | null;
  aktiv: boolean;
  notizen: string | null;
}

interface VehicleCost {
  id: string;
  vehicle_id: string;
  datum: string;
  betrag: number;
  kategorie: string;
  beschreibung: string | null;
}

/** Ein Fahrzeug-Einsatz = Zeile aus time_entry_vehicles + Datum/Person des Zeiteintrags. */
interface VehicleUsage {
  id: string;
  datum: string;
  mitarbeiter: string;
  stunden: number | null;
  km: number | null;
}

/** Kennzahlen des laufenden Jahres je Fahrzeug (Grid-Spalten rechts). */
interface VehicleStats {
  stunden: number;
  km: number;
  kosten: number;
}

// Typ-Liste identisch zum bestehenden VehicleManager (Admin → Konfiguration),
// damit beide Masken dieselben Werte schreiben. `typ` ist in der DB freier Text.
const TYP_OPTIONS = [
  { value: "pkw", label: "PKW" },
  { value: "bus", label: "Bus / Transporter" },
  { value: "lkw", label: "LKW" },
  { value: "anhaenger", label: "Anhänger" },
  { value: "stapler", label: "Stapler / Bagger" },
  { value: "sonstiges", label: "Sonstiges" },
];

const KATEGORIE_OPTIONS = [
  { value: "reparatur", label: "Reparatur" },
  { value: "service", label: "Service" },
  { value: "treibstoff", label: "Treibstoff" },
  { value: "sonstiges", label: "Sonstiges" },
];

const typLabel = (typ: string | null) =>
  TYP_OPTIONS.find(o => o.value === typ)?.label || typ || "–";

const kategorieLabel = (k: string) =>
  KATEGORIE_OPTIONS.find(o => o.value === k)?.label || k;

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Gefahrene Kilometer einer time_entry_vehicles-Zeile.
 * modus='gefahren'   → km_gefahren direkt
 * modus='start_ende' → Differenz km_ende − km_start (negative Werte verwerfen)
 */
const kmOfUsage = (row: any): number => {
  if (row.modus === "start_ende") {
    const start = Number(row.km_start);
    const ende = Number(row.km_ende);
    if (!Number.isFinite(start) || !Number.isFinite(ende)) return 0;
    return Math.max(0, ende - start);
  }
  const gef = Number(row.km_gefahren);
  return Number.isFinite(gef) ? gef : 0;
};

const EMPTY_FORM = {
  bezeichnung: "",
  kennzeichen: "",
  typ: "pkw",
  aktiv: true,
  notizen: "",
};

export default function Fahrzeuge() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<Record<string, VehicleStats>>({});
  /** vehicle_id → Namen der Mitarbeiter mit diesem Standard-Fahrzeug */
  const [standardFahrer, setStandardFahrer] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  // Filterspalte
  const [search, setSearch] = useState("");
  const [typFilter, setTypFilter] = useState<string>("alle");
  const [aktivFilter, setAktivFilter] = useState<"alle" | "aktiv" | "inaktiv">("alle");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Listen-Selektion (Toolbar-Aktionen wirken auf die markierte Zeile)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Editor-Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"kosten" | "einsaetze">("kosten");

  // Kosten-Tab
  const [costs, setCosts] = useState<VehicleCost[]>([]);
  const [costsLoading, setCostsLoading] = useState(false);
  const [newCost, setNewCost] = useState({
    datum: format(new Date(), "yyyy-MM-dd"),
    kategorie: "reparatur",
    betrag: "",
    beschreibung: "",
  });

  // Einsätze-Tab
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  const [usagesLoading, setUsagesLoading] = useState(false);

  const jahr = new Date().getFullYear();
  const jahrStart = `${jahr}-01-01`;
  const jahrEnde = `${jahr}-12-31`;

  // ── Laden: Fahrzeuge + Jahres-Kennzahlen + Standard-Fahrer ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [vehRes, empRes, usageRes, costRes] = await Promise.all([
      (supabase.from("vehicles" as never) as any)
        .select("id, bezeichnung, kennzeichen, typ, aktiv, notizen")
        .order("aktiv", { ascending: false })
        .order("bezeichnung"),
      // employees.standard_vehicle_id ist neu → über den untypisierten Client
      (supabase.from("employees" as never) as any)
        .select("id, vorname, nachname, standard_vehicle_id")
        .not("standard_vehicle_id", "is", null),
      // Fahrzeugstunden/-km des laufenden Jahres. !inner, damit der
      // Datumsfilter auf der eingebetteten time_entries-Tabelle greift.
      (supabase.from("time_entry_vehicles" as never) as any)
        .select("vehicle_id, modus, stunden, km_gefahren, km_start, km_ende, time_entries!inner(datum)")
        .gte("time_entries.datum", jahrStart)
        .lte("time_entries.datum", jahrEnde),
      (supabase.from("vehicle_costs" as never) as any)
        .select("vehicle_id, betrag")
        .gte("datum", jahrStart)
        .lte("datum", jahrEnde),
    ]);

    if (vehRes.error) {
      toast({ variant: "destructive", title: "Fehler", description: "Fahrzeuge konnten nicht geladen werden" });
      setLoading(false);
      return;
    }
    setVehicles((vehRes.data as Vehicle[]) || []);

    // Standard-Fahrer je Fahrzeug
    const fahrerMap: Record<string, string[]> = {};
    ((empRes?.data as any[]) || []).forEach((e: any) => {
      const vid = e.standard_vehicle_id;
      if (!vid) return;
      const name = `${e.vorname || ""} ${e.nachname || ""}`.trim();
      if (!name) return;
      (fahrerMap[vid] ||= []).push(name);
    });
    setStandardFahrer(fahrerMap);

    // Kennzahlen aggregieren
    const agg: Record<string, VehicleStats> = {};
    const bucket = (vid: string) => (agg[vid] ||= { stunden: 0, km: 0, kosten: 0 });
    ((usageRes?.data as any[]) || []).forEach((r: any) => {
      const b = bucket(r.vehicle_id);
      b.stunden += Number(r.stunden) || 0;
      b.km += kmOfUsage(r);
    });
    ((costRes?.data as any[]) || []).forEach((r: any) => {
      bucket(r.vehicle_id).kosten += Number(r.betrag) || 0;
    });
    setStats(agg);
    setLoading(false);
  }, [jahrStart, jahrEnde, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Kosten des offenen Fahrzeugs ──
  const fetchCosts = async (vehicleId: string) => {
    setCostsLoading(true);
    const { data, error } = await (supabase.from("vehicle_costs" as never) as any)
      .select("id, vehicle_id, datum, betrag, kategorie, beschreibung")
      .eq("vehicle_id", vehicleId)
      .order("datum", { ascending: false });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Kosten konnten nicht geladen werden" });
      setCosts([]);
    } else {
      setCosts((data as VehicleCost[]) || []);
    }
    setCostsLoading(false);
  };

  // ── Einsätze des offenen Fahrzeugs (letzte 50) ──
  const fetchUsages = async (vehicleId: string) => {
    setUsagesLoading(true);
    const { data, error } = await (supabase.from("time_entry_vehicles" as never) as any)
      .select("id, modus, stunden, km_gefahren, km_start, km_ende, time_entries!inner(datum, user_id)")
      .eq("vehicle_id", vehicleId)
      .limit(500);

    if (error) {
      setUsages([]);
      setUsagesLoading(false);
      return;
    }

    // Mitarbeitername über employees.user_id auflösen (time_entries kennt nur user_id).
    const rows = (data as any[]) || [];
    const userIds = Array.from(new Set(rows.map(r => r.time_entries?.user_id).filter(Boolean)));
    const nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: emps } = await supabase
        .from("employees")
        .select("user_id, vorname, nachname")
        .in("user_id", userIds);
      ((emps as any[]) || []).forEach((e: any) => {
        if (e.user_id) nameMap[e.user_id] = `${e.vorname || ""} ${e.nachname || ""}`.trim();
      });
    }

    // Sortierung/Limit lokal: „order" auf einer eingebetteten Tabelle ist
    // fehleranfällig, die Zeilenzahl je Fahrzeug ist unkritisch klein.
    const mapped: VehicleUsage[] = rows
      .map(r => ({
        id: r.id,
        datum: r.time_entries?.datum || "",
        mitarbeiter: nameMap[r.time_entries?.user_id] || "–",
        stunden: r.stunden === null || r.stunden === undefined ? null : Number(r.stunden),
        km: kmOfUsage(r) || null,
      }))
      .sort((a, b) => (b.datum || "").localeCompare(a.datum || ""))
      .slice(0, 50);

    setUsages(mapped);
    setUsagesLoading(false);
  };

  // ── Filterung ──
  const filtered = vehicles.filter(v => {
    if (typFilter !== "alle" && (v.typ || "") !== typFilter) return false;
    if (aktivFilter === "aktiv" && !v.aktiv) return false;
    if (aktivFilter === "inaktiv" && v.aktiv) return false;
    if (!search.trim()) return true;
    return matchesSearch(v.kennzeichen, search) || matchesSearch(v.bezeichnung, search);
  });

  const selectedRow = vehicles.find(v => v.id === selectedId) || null;

  // ── Editor öffnen ──
  const openNew = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setCosts([]);
    setUsages([]);
    setTab("kosten");
    setDialogOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditId(v.id);
    setForm({
      bezeichnung: v.bezeichnung || "",
      kennzeichen: v.kennzeichen || "",
      typ: v.typ || "pkw",
      aktiv: !!v.aktiv,
      notizen: v.notizen || "",
    });
    setTab("kosten");
    setNewCost({ datum: format(new Date(), "yyyy-MM-dd"), kategorie: "reparatur", betrag: "", beschreibung: "" });
    setDialogOpen(true);
    fetchCosts(v.id);
    fetchUsages(v.id);
  };

  const editSelected = () => {
    if (selectedRow) openEdit(selectedRow);
  };

  // ── Speichern ──
  const handleSave = async () => {
    if (!form.bezeichnung.trim()) {
      toast({ variant: "destructive", title: "Pflichtfeld fehlt", description: "Bezeichnung ist erforderlich." });
      return;
    }
    setSaving(true);
    const payload = {
      bezeichnung: form.bezeichnung.trim(),
      kennzeichen: form.kennzeichen.trim() || null,
      typ: form.typ || null,
      aktiv: form.aktiv,
      notizen: form.notizen.trim() || null,
    };
    try {
      if (editId) {
        const { error } = await (supabase.from("vehicles" as never) as any)
          .update(payload)
          .eq("id", editId);
        if (error) throw error;
        toast({ title: "Gespeichert", description: "Fahrzeug wurde aktualisiert" });
      } else {
        const { error } = await (supabase.from("vehicles" as never) as any).insert(payload);
        if (error) throw error;
        toast({ title: "Erstellt", description: "Neues Fahrzeug wurde angelegt" });
      }
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
    setSaving(false);
  };

  // ── Löschen ──
  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from("vehicles" as never) as any).delete().eq("id", id);
    if (error) {
      // time_entry_vehicles.vehicle_id ist ON DELETE RESTRICT — Fahrzeuge mit
      // Buchungen lassen sich nicht löschen. Klartext statt DB-Fehlermeldung.
      const restrict = /foreign key|violates|constraint/i.test(error.message || "");
      toast({
        variant: "destructive",
        title: "Löschen nicht möglich",
        description: restrict
          ? "Für dieses Fahrzeug gibt es bereits Zeitbuchungen. Setze es stattdessen auf „inaktiv“."
          : error.message,
      });
      return;
    }
    toast({ title: "Gelöscht", description: "Fahrzeug wurde gelöscht" });
    if (selectedId === id) setSelectedId(null);
    fetchAll();
  };

  // ── Kosten anlegen / löschen ──
  const addCost = async () => {
    if (!editId) return;
    const betrag = parseFloat(String(newCost.betrag).replace(",", "."));
    if (!Number.isFinite(betrag) || betrag === 0) {
      toast({ variant: "destructive", title: "Betrag fehlt", description: "Bitte einen gültigen Betrag eingeben." });
      return;
    }
    if (!newCost.datum) {
      toast({ variant: "destructive", title: "Datum fehlt", description: "Bitte ein Datum wählen." });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from("vehicle_costs" as never) as any).insert({
      vehicle_id: editId,
      datum: newCost.datum,
      betrag,
      kategorie: newCost.kategorie,
      beschreibung: newCost.beschreibung.trim() || null,
      created_by: user?.id || null,
    });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Kosten gebucht", description: `${kategorieLabel(newCost.kategorie)}: € ${eur(betrag)}` });
    setNewCost({ datum: format(new Date(), "yyyy-MM-dd"), kategorie: "reparatur", betrag: "", beschreibung: "" });
    fetchCosts(editId);
    fetchAll();
  };

  const deleteCost = async (id: string) => {
    const { error } = await (supabase.from("vehicle_costs" as never) as any).delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    if (editId) fetchCosts(editId);
    fetchAll();
  };

  const costSum = costs.reduce((s, c) => s + (Number(c.betrag) || 0), 0);

  // ── Editor-Dialog (KingBill-Look: Toolbar-Kopf + grünes „Speichern & Schließen") ──
  const editorDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{editId ? "Fahrzeug bearbeiten" : "Neues Fahrzeug"}</DialogTitle>
        </DialogHeader>
        <KBToolbar
          sticky={false}
          className="rounded-t-md pr-12"
          onBack={() => setDialogOpen(false)}
          backLabel="Schließen ohne Speichern"
          title={editId ? "Fahrzeug bearbeiten" : "Neues Fahrzeug"}
          rightActions={
            <KBToolbarButton
              icon={Check}
              label={saving ? "Speichert…" : "Speichern & Schließen"}
              variant="green"
              onClick={handleSave}
              disabled={saving}
            />
          }
        />

        <div className="p-4 sm:p-5 space-y-5">
          {/* ── Stammdaten ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1" htmlFor="fz-bez">Bezeichnung *</label>
              <input
                id="fz-bez"
                className="kb-input w-full"
                value={form.bezeichnung}
                onChange={(e) => setForm(f => ({ ...f, bezeichnung: e.target.value }))}
                placeholder="z.B. VW T6 Werkstatt"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" htmlFor="fz-kz">Kennzeichen</label>
              <input
                id="fz-kz"
                className="kb-input w-full"
                value={form.kennzeichen}
                onChange={(e) => setForm(f => ({ ...f, kennzeichen: e.target.value }))}
                placeholder="ZT-1234F"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Typ</label>
              <Select value={form.typ} onValueChange={(v) => setForm(f => ({ ...f, typ: v }))}>
                <SelectTrigger className="h-9" aria-label="Fahrzeugtyp"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                id="fz-aktiv"
                checked={form.aktiv}
                onCheckedChange={(c) => setForm(f => ({ ...f, aktiv: !!c }))}
              />
              <label htmlFor="fz-aktiv" className="text-sm font-medium cursor-pointer">
                Fahrzeug aktiv
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1" htmlFor="fz-notiz">Notizen</label>
              <textarea
                id="fz-notiz"
                className="kb-input w-full min-h-[70px] py-2"
                value={form.notizen}
                onChange={(e) => setForm(f => ({ ...f, notizen: e.target.value }))}
                placeholder="z.B. Pickerl fällig 03/2027"
              />
            </div>
          </div>

          {/* ── kb-Tab-Leiste: Kosten / Einsätze ── */}
          {editId ? (
            <div>
              <div className="flex gap-1 flex-wrap border-b border-border pb-2">
                <button
                  type="button"
                  className={tab === "kosten" ? "kb-tab-active" : "kb-tab"}
                  onClick={() => setTab("kosten")}
                >
                  Kosten
                </button>
                <button
                  type="button"
                  className={tab === "einsaetze" ? "kb-tab-active" : "kb-tab"}
                  onClick={() => setTab("einsaetze")}
                >
                  Einsätze
                </button>
              </div>

              {/* ── Tab „Kosten": Reparatur-/Service-/Treibstoffkosten buchen ── */}
              {tab === "kosten" && (
                <div className="pt-3 space-y-3">
                  {/* Neue Kostenzeile */}
                  <div className="kb-panel p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold mb-1" htmlFor="k-datum">Datum</label>
                      <input
                        id="k-datum"
                        type="date"
                        className="kb-input w-full"
                        value={newCost.datum}
                        onChange={(e) => setNewCost(c => ({ ...c, datum: e.target.value }))}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold mb-1">Kategorie</label>
                      <Select value={newCost.kategorie} onValueChange={(v) => setNewCost(c => ({ ...c, kategorie: v }))}>
                        <SelectTrigger className="h-9" aria-label="Kostenkategorie"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {KATEGORIE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold mb-1" htmlFor="k-betrag">Betrag (€)</label>
                      <input
                        id="k-betrag"
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        className="kb-input w-full"
                        value={newCost.betrag}
                        onChange={(e) => setNewCost(c => ({ ...c, betrag: e.target.value }))}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold mb-1" htmlFor="k-text">Beschreibung</label>
                      <input
                        id="k-text"
                        className="kb-input w-full"
                        value={newCost.beschreibung}
                        onChange={(e) => setNewCost(c => ({ ...c, beschreibung: e.target.value }))}
                        placeholder="z.B. Bremsen hinten"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <button type="button" className="kb-btn w-full justify-center" onClick={addCost} title="Kosten buchen">
                        <Plus className="h-4 w-4 text-kb-green" />
                      </button>
                    </div>
                  </div>

                  {/* Kostenliste */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Datum</TableHead>
                          <TableHead>Kategorie</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Betrag</TableHead>
                          <TableHead>Beschreibung</TableHead>
                          <TableHead className="w-10"><span className="sr-only">Löschen</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {costsLoading ? (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Lädt…</TableCell></TableRow>
                        ) : costs.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Noch keine Kosten gebucht.</TableCell></TableRow>
                        ) : (
                          costs.map(c => (
                            <TableRow key={c.id}>
                              <TableCell className="whitespace-nowrap">
                                {c.datum ? format(parseISO(c.datum), "dd.MM.yyyy", { locale: de }) : "–"}
                              </TableCell>
                              <TableCell>{kategorieLabel(c.kategorie)}</TableCell>
                              <TableCell className="text-right font-medium whitespace-nowrap">€ {eur(Number(c.betrag) || 0)}</TableCell>
                              <TableCell className="max-w-[260px] truncate">{c.beschreibung || "–"}</TableCell>
                              <TableCell className="w-10">
                                <button
                                  type="button"
                                  className="text-destructive hover:opacity-70"
                                  onClick={() => deleteCost(c.id)}
                                  title="Kostenzeile löschen"
                                  aria-label="Kostenzeile löschen"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end border-t border-border pt-2 text-sm font-bold">
                    Summe: € {eur(costSum)}
                  </div>
                </div>
              )}

              {/* ── Tab „Einsätze": read-only ── */}
              {tab === "einsaetze" && (
                <div className="pt-3">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Datum</TableHead>
                          <TableHead>Mitarbeiter</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Stunden</TableHead>
                          <TableHead className="text-right whitespace-nowrap">km</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usagesLoading ? (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Lädt…</TableCell></TableRow>
                        ) : usages.length === 0 ? (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Keine Einsätze erfasst.</TableCell></TableRow>
                        ) : (
                          usages.map(u => (
                            <TableRow key={u.id}>
                              <TableCell className="whitespace-nowrap">
                                {u.datum ? format(parseISO(u.datum), "dd.MM.yyyy", { locale: de }) : "–"}
                              </TableCell>
                              <TableCell>{u.mitarbeiter}</TableCell>
                              <TableCell className="text-right">{u.stunden !== null ? u.stunden.toFixed(2) : "–"}</TableCell>
                              <TableCell className="text-right">{u.km ? u.km.toLocaleString("de-AT") : "–"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-2">
                    Letzte 50 Einsätze aus der Zeiterfassung (nur Anzeige).
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground border-t border-border pt-3">
              Kosten und Einsätze können erfasst werden, sobald das Fahrzeug gespeichert ist.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── KingBill-Listenmaske ──
  return (
    <div className="kb-page min-h-screen">
      {/* Print-CSS: „Liste drucken" druckt nur das Fahrzeug-Grid */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kb-print-area, #kb-print-area * { visibility: visible; }
          #kb-print-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; border-radius: 0; }
          #kb-print-area .overflow-x-auto { overflow: visible !important; }
        }
      `}</style>

      <KBToolbar onBack={() => navigate("/")} title="Fahrzeuge">
        <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Neu" onClick={openNew} />
        <KBToolbarButton
          icon={Pencil}
          label="Bearbeiten"
          onClick={editSelected}
          disabled={!selectedRow}
          title={selectedRow ? `${selectedRow.bezeichnung} bearbeiten` : "Zuerst eine Zeile markieren"}
        />
        <KBToolbarButton
          icon={Trash2}
          label="Löschen"
          onClick={() => selectedRow && setDeleteDialogOpen(true)}
          disabled={!selectedRow}
          title={selectedRow ? `${selectedRow.bezeichnung} löschen` : "Zuerst eine Zeile markieren"}
        />
        <KBToolbarButton icon={Printer} label="Liste drucken" onClick={() => window.print()} />
      </KBToolbar>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-[1600px]">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-4">

          {/* ── Linke Filterspalte ── */}
          <aside className="kb-panel w-full lg:w-64 shrink-0 p-3 print:hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <button
              type="button"
              className="kb-btn w-full justify-between lg:hidden"
              onClick={() => setFiltersOpen(o => !o)}
              aria-expanded={filtersOpen}
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-kb-blue-dark" />
                Filter & Suche
              </span>
              {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            <div className={`${filtersOpen ? "flex" : "hidden"} lg:flex flex-col gap-3 mt-3 lg:mt-0`}>
              <input
                type="search"
                className="kb-input"
                placeholder="Suche… (Kennzeichen, Bezeichnung)"
                aria-label="Fahrzeuge durchsuchen"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <Select value={typFilter} onValueChange={setTypFilter}>
                <SelectTrigger className="w-full h-9" aria-label="Typ filtern">
                  <SelectValue placeholder="Typ filtern…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Typen</SelectItem>
                  {TYP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={aktivFilter} onValueChange={(v) => setAktivFilter(v as typeof aktivFilter)}>
                <SelectTrigger className="w-full h-9" aria-label="Status filtern">
                  <SelectValue placeholder="Status filtern…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Aktive & inaktive</SelectItem>
                  <SelectItem value="aktiv">Nur aktive</SelectItem>
                  <SelectItem value="inaktiv">Nur inaktive</SelectItem>
                </SelectContent>
              </Select>

              <div className="border-t border-border pt-2 text-sm font-bold">
                Anzahl Fahrzeuge: {loading ? "…" : filtered.length}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Zeile anklicken = markieren, Doppelklick = bearbeiten.
                Std./km/Kosten beziehen sich auf {jahr}.
              </p>
            </div>
          </aside>

          {/* ── Fahrzeug-Grid (zugleich Druckbereich) ── */}
          <section id="kb-print-area" className="kb-panel flex-1 min-w-0 overflow-hidden">
            <div className="hidden print:block px-4 pt-4">
              <h2 className="text-lg font-bold">Fahrzeugliste</h2>
              <p className="text-xs text-muted-foreground">Anzahl Fahrzeuge: {filtered.length} — Kennzahlen {jahr}</p>
            </div>
            <div className="p-2 sm:p-3">
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Lädt...</p>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-lg font-semibold mb-1">
                    {search || typFilter !== "alle" || aktivFilter !== "alle"
                      ? "Keine Fahrzeuge gefunden"
                      : "Noch keine Fahrzeuge"}
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {search || typFilter !== "alle" || aktivFilter !== "alle"
                      ? "Passe Suche/Filter an oder lege ein neues Fahrzeug an."
                      : "Lege dein erstes Fahrzeug an, um Stunden, Kilometer und Kosten zu erfassen."}
                  </p>
                  <button type="button" className="kb-btn mx-auto" onClick={openNew}>
                    <Plus className="w-4 h-4 text-kb-green" /> Fahrzeug anlegen
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"><span className="sr-only">Status</span></TableHead>
                        <TableHead>Kennzeichen</TableHead>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Standard-Fahrer</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Std. ({jahr})</TableHead>
                        <TableHead className="text-right whitespace-nowrap">km ({jahr})</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kosten ({jahr})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(v => {
                        const isSelected = selectedId === v.id;
                        const s = stats[v.id] || { stunden: 0, km: 0, kosten: 0 };
                        const fahrer = standardFahrer[v.id] || [];
                        return (
                          <TableRow
                            key={v.id}
                            aria-selected={isSelected}
                            className={`cursor-pointer ${isSelected ? "bg-kb-blue/15 hover:bg-kb-blue/20" : "hover:bg-muted/50"} ${!v.aktiv ? "opacity-60" : ""}`}
                            onClick={() => setSelectedId(v.id)}
                            onDoubleClick={() => openEdit(v)}
                          >
                            <TableCell className="w-8">
                              <span
                                className={`block h-2.5 w-2.5 rounded-full ${v.aktiv ? "bg-green-500" : "bg-gray-400"}`}
                                title={v.aktiv ? "Aktiv" : "Inaktiv"}
                              />
                            </TableCell>
                            <TableCell className="font-mono font-medium whitespace-nowrap">{v.kennzeichen || "–"}</TableCell>
                            <TableCell className="font-medium">{v.bezeichnung}</TableCell>
                            <TableCell className="whitespace-nowrap">{typLabel(v.typ)}</TableCell>
                            <TableCell className="max-w-[220px] truncate">{fahrer.length > 0 ? fahrer.join(", ") : "–"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{s.stunden > 0 ? s.stunden.toFixed(2) : "–"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{s.km > 0 ? s.km.toLocaleString("de-AT") : "–"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap font-medium">{s.kosten > 0 ? `€ ${eur(s.kosten)}` : "–"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Löschen-Bestätigung für die markierte Zeile */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fahrzeug löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRow
                ? `${selectedRow.bezeichnung}${selectedRow.kennzeichen ? ` (${selectedRow.kennzeichen})` : ""} wird dauerhaft gelöscht — inklusive der erfassten Kosten. Fahrzeuge mit Zeitbuchungen lassen sich nicht löschen.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (selectedRow) handleDelete(selectedRow.id); setDeleteDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editorDialog}
    </div>
  );
}
