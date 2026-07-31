/**
 * KFZ-Manager — KingBill-Listenmaske für Fahrzeuge UND Maschinen.
 *
 * Aufbau exakt wie src/pages/Customers.tsx:
 *   KBToolbar [Zurück] „KFZ-Manager" [+ Fahrzeug][+ Maschine][Bearbeiten][Löschen][Liste drucken]
 *   + linke Filterspalte (kb-panel, mobil einklappbar)
 *   + Geräte-Grid rechts (Einfachklick markiert, Doppelklick bearbeitet).
 *
 * Fahrzeug und Maschine liegen in DERSELBEN Tabelle (`vehicles.art`) — beide
 * brauchen Stunden, Kilometer/Betriebsstunden, Kosten und aktiv/inaktiv. Was
 * sich unterscheidet, steuert `art`: die Typliste, die Pickerl-Felder (nur
 * Fahrzeug) und die Filter.
 *
 * Die Kostenstelle je Gerät steuert, worauf Stunden in der Zeiterfassung
 * gebucht werden. Sie lässt sich direkt hier anlegen — dafür muss niemand in
 * den Admin-Bereich wechseln.
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
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { matchesSearch } from "@/lib/searchUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  /** 'fahrzeug' | 'maschine' — siehe Migration 20260730130000. */
  art: string;
  bezeichnung: string;
  kennzeichen: string | null;
  typ: string | null;
  aktiv: boolean;
  notizen: string | null;
  /** Nächste wiederkehrende Begutachtung (§ 57a, „Pickerl"). */
  pickerl_faellig_am: string | null;
  /** Vorlauf der Erinnerung auf der Startseite, in Tagen. */
  pickerl_erinnerung_tage: number | null;
  pickerl_letzte_pruefung: string | null;
  /** Kostenstelle für Stundenbuchungen (admin_config_options.wert). */
  kostenstelle: string | null;
}

/** Auswahl aus admin_config_options (kategorie='kostenstelle'). */
interface KostenstelleOption {
  wert: string;
  label: string;
}

interface VehicleCost {
  id: string;
  vehicle_id: string;
  datum: string;
  betrag: number;
  kategorie: string;
  beschreibung: string | null;
  /** 'manuell' = Alt-Zeile aus vehicle_costs, 'er' = zugeordnete Eingangsrechnung. */
  quelle: "manuell" | "er";
}

/** Ein Fahrzeug-Einsatz = Zeile aus time_entry_vehicles + Datum/Person des Zeiteintrags. */
interface VehicleUsage {
  id: string;
  datum: string;
  mitarbeiter: string;
  stunden: number | null;
  km: number | null;
  /** Zählerstand am Ende der Fahrt (nur bei Modus „km Start/Ende" erfasst). */
  kmStand: number | null;
}

/** Kennzahlen des laufenden Jahres je Fahrzeug (Grid-Spalten rechts). */
interface VehicleStats {
  stunden: number;
  km: number;
  kosten: number;
}

/** Die beiden Arten — Beschriftungen an EINER Stelle, damit Maske,
 *  Filter und Meldungen nicht auseinanderlaufen. */
const ARTEN = [
  { value: "fahrzeug", label: "Fahrzeug", plural: "Fahrzeuge", icon: "🚚" },
  { value: "maschine", label: "Maschine", plural: "Maschinen", icon: "⚙️" },
] as const;
type Art = (typeof ARTEN)[number]["value"];

const artLabel = (a: string) => ARTEN.find(x => x.value === a)?.label || "Fahrzeug";

// Typ-Liste je Art. Die Fahrzeugtypen sind identisch zum bestehenden
// VehicleManager (Admin → Konfiguration), damit beide Masken dieselben Werte
// schreiben. `typ` ist in der DB freier Text.
const TYP_FAHRZEUG = [
  { value: "pkw", label: "PKW" },
  { value: "bus", label: "Bus / Transporter" },
  { value: "lkw", label: "LKW" },
  { value: "anhaenger", label: "Anhänger" },
  { value: "sonstiges", label: "Sonstiges" },
];

const TYP_MASCHINE = [
  { value: "stapler", label: "Stapler" },
  { value: "bagger", label: "Bagger" },
  { value: "kran", label: "Kran" },
  { value: "hebebuehne", label: "Hebebühne" },
  { value: "saege", label: "Säge / Abbundanlage" },
  { value: "kompressor", label: "Kompressor" },
  { value: "geraet", label: "Handgerät / Werkzeug" },
  { value: "sonstiges", label: "Sonstiges" },
];

const typOptionsFuer = (art: string) => (art === "maschine" ? TYP_MASCHINE : TYP_FAHRZEUG);

/** Alle Typen für den Filter — ohne Dubletten („sonstiges" steht in beiden Listen). */
const TYP_OPTIONS = [
  ...TYP_FAHRZEUG,
  ...TYP_MASCHINE.filter(m => !TYP_FAHRZEUG.some(f => f.value === m.value)),
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
  KATEGORIE_OPTIONS.find(o => o.value === k)?.label
  || k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");

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
  art: "fahrzeug" as Art,
  bezeichnung: "",
  kennzeichen: "",
  typ: "pkw",
  aktiv: true,
  notizen: "",
  kostenstelle: "",
  pickerl_faellig_am: "",
  pickerl_erinnerung_tage: "30",
  pickerl_letzte_pruefung: "",
};

export default function Fahrzeuge() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const zurueck = useZurueck("/");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<Record<string, VehicleStats>>({});
  /** vehicle_id → Namen der Mitarbeiter mit diesem Standard-Fahrzeug */
  const [standardFahrer, setStandardFahrer] = useState<Record<string, string[]>>({});
  /** Auswahlliste der Kostenstellen — hier auch direkt erweiterbar. */
  const [kostenstellen, setKostenstellen] = useState<KostenstelleOption[]>([]);
  const [neueKostenstelle, setNeueKostenstelle] = useState("");
  const [loading, setLoading] = useState(true);

  // Filterspalte
  const [search, setSearch] = useState("");
  const [artFilter, setArtFilter] = useState<string>("alle");
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

  // Einsätze-Tab
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  /** Stunden je Mitarbeiter über ALLE geladenen Einsätze (Kundenwunsch:
   *  „welche Mitarbeiter wie viele Stunden darauf geschrieben haben"). */
  const [stundenJeMitarbeiter, setStundenJeMitarbeiter] = useState<{ name: string; stunden: number; einsaetze: number }[]>([]);
  const [usagesLoading, setUsagesLoading] = useState(false);

  const jahr = new Date().getFullYear();
  const jahrStart = `${jahr}-01-01`;
  const jahrEnde = `${jahr}-12-31`;

  // ── Laden: Fahrzeuge + Jahres-Kennzahlen + Standard-Fahrer ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [vehRes, empRes, usageRes, costRes, erRes] = await Promise.all([
      (supabase.from("vehicles" as never) as any)
        .select("id, art, bezeichnung, kennzeichen, typ, aktiv, notizen, kostenstelle, pickerl_faellig_am, pickerl_erinnerung_tage, pickerl_letzte_pruefung")
        .order("art")
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
      // Zugeordnete Eingangsrechnungen zählen automatisch als Gerätekosten
      // (Kundenwunsch) — abgelehnte nicht.
      (supabase.from("purchase_invoices" as never) as any)
        .select("vehicle_id, betrag_netto, rechnungsdatum, status")
        .not("vehicle_id", "is", null)
        .neq("status", "abgelehnt"),
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
    ((erRes?.data as any[]) || []).forEach((r: any) => {
      const d = String(r.rechnungsdatum || "");
      if (d >= jahrStart && d <= jahrEnde) {
        bucket(r.vehicle_id).kosten += Number(r.betrag_netto) || 0;
      }
    });
    setStats(agg);
    setLoading(false);
  }, [jahrStart, jahrEnde, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Kostenstellen laden (dieselbe Liste wie in der Zeiterfassung) ──
  const fetchKostenstellen = useCallback(async () => {
    const { data } = await supabase
      .from("admin_config_options")
      .select("wert, label")
      .eq("kategorie", "kostenstelle")
      .eq("is_active", true)
      .order("sort_order");
    setKostenstellen(((data as KostenstelleOption[]) || []));
  }, []);

  useEffect(() => {
    fetchKostenstellen();
  }, [fetchKostenstellen]);

  /**
   * Neue Kostenstelle direkt hier anlegen (Kundenwunsch: „da kann ich auch die
   * Kostenstellen erstellen"). Der technische Wert wird aus der Beschriftung
   * abgeleitet, damit niemand zwei Felder ausfüllen muss.
   */
  const kostenstelleAnlegen = async () => {
    const label = neueKostenstelle.trim();
    if (!label) return;
    const wert = label
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!wert) {
      toast({ variant: "destructive", title: "Bezeichnung ungeeignet", description: "Bitte einen Namen mit Buchstaben oder Ziffern eingeben." });
      return;
    }
    if (kostenstellen.some(k => k.wert === wert)) {
      toast({ variant: "destructive", title: "Gibt es schon", description: `„${label}" ist bereits als Kostenstelle angelegt.` });
      return;
    }
    const maxSort = kostenstellen.length * 10 + 100;
    const { error } = await supabase.from("admin_config_options").insert({
      kategorie: "kostenstelle", wert, label, sort_order: maxSort, is_active: true,
    });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Kostenstelle angelegt", description: `„${label}" steht ab sofort auch in der Zeiterfassung zur Auswahl.` });
    setNeueKostenstelle("");
    setForm(f => ({ ...f, kostenstelle: wert }));
    fetchKostenstellen();
  };

  // ── Kosten des offenen Fahrzeugs ──
  const fetchCosts = async (vehicleId: string) => {
    setCostsLoading(true);
    const [{ data, error }, { data: erDaten }] = await Promise.all([
      (supabase.from("vehicle_costs" as never) as any)
        .select("id, vehicle_id, datum, betrag, kategorie, beschreibung")
        .eq("vehicle_id", vehicleId)
        .order("datum", { ascending: false }),
      (supabase.from("purchase_invoices" as never) as any)
        .select("id, rechnungsdatum, betrag_netto, kategorie, lieferant, rechnungsnummer, status")
        .eq("vehicle_id", vehicleId)
        .neq("status", "abgelehnt")
        .order("rechnungsdatum", { ascending: false }),
    ]);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Kosten konnten nicht geladen werden" });
      setCosts([]);
    } else {
      // Hinweis: purchase_invoices sind per RLS nur für Admin/Vorarbeiter
      // vollständig lesbar — für reine Mitarbeiter fehlen die ER-Kosten hier
      // rollenbedingt (der KFZ-Manager ist praktisch eine Chef-Maske).
      const manuell: VehicleCost[] = (((data as any[]) || [])).map((c) => ({ ...c, quelle: "manuell" as const }));
      // Zugeordnete Eingangsrechnungen — automatisch, netto, nicht löschbar
      // (gelöst wird die Zuordnung in der Eingangsrechnung selbst).
      const er: VehicleCost[] = (((erDaten as any[]) || [])).map((r) => ({
        id: r.id,
        vehicle_id: vehicleId,
        datum: r.rechnungsdatum || "",
        betrag: Number(r.betrag_netto) || 0,
        kategorie: r.kategorie || "eingangsrechnung",
        beschreibung: [r.lieferant, r.rechnungsnummer].filter(Boolean).join(" · ") || "Eingangsrechnung",
        quelle: "er" as const,
      }));
      setCosts([...manuell, ...er].sort((a, b) => (b.datum || "").localeCompare(a.datum || "")));
    }
    setCostsLoading(false);
  };

  // ── Einsätze des offenen Fahrzeugs (letzte 50) ──
  const fetchUsages = async (vehicleId: string) => {
    setUsagesLoading(true);
    const { data, error } = await (supabase.from("time_entry_vehicles" as never) as any)
      .select("id, modus, stunden, km_gefahren, km_start, km_ende, time_entries!inner(datum, user_id)")
      .eq("vehicle_id", vehicleId)
      // Neueste zuerst: ohne Sortierung wäre das 500er-Fenster eine
      // willkürliche Teilmenge (Review-Befund).
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setUsages([]);
      setUsagesLoading(false);
      return;
    }

    // Mitarbeitername über employees.user_id auflösen (time_entries kennt nur
    // user_id). Nicht jeder Login hat einen employees-Datensatz — dann greift
    // der Fallback auf profiles, sonst stünde in der Spalte nur „–".
    const rows = (data as any[]) || [];
    const userIds = Array.from(new Set(rows.map(r => r.time_entries?.user_id).filter(Boolean)));
    const nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const [{ data: emps }, { data: profs }] = await Promise.all([
        supabase.from("employees").select("user_id, vorname, nachname").in("user_id", userIds),
        (supabase.from("profiles" as never) as any).select("id, vorname, nachname").in("id", userIds),
      ]);
      ((profs as any[]) || []).forEach((p: any) => {
        const n = `${p.vorname || ""} ${p.nachname || ""}`.trim();
        if (p.id && n) nameMap[p.id] = n;
      });
      ((emps as any[]) || []).forEach((e: any) => {
        const n = `${e.vorname || ""} ${e.nachname || ""}`.trim();
        if (e.user_id && n) nameMap[e.user_id] = n;
      });
    }

    // Sortierung/Limit lokal: „order" auf einer eingebetteten Tabelle ist
    // fehleranfällig, die Zeilenzahl je Fahrzeug ist unkritisch klein.
    const alleEinsaetze: VehicleUsage[] = rows
      .map(r => ({
        id: r.id,
        datum: r.time_entries?.datum || "",
        mitarbeiter: nameMap[r.time_entries?.user_id] || "–",
        stunden: r.stunden === null || r.stunden === undefined ? null : Number(r.stunden),
        km: kmOfUsage(r) || null,
        kmStand: Number.isFinite(Number(r.km_ende)) ? Number(r.km_ende) : null,
      }))
      .sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));

    // Aggregation über ALLE geladenen Einsätze — die Detailliste darunter
    // zeigt nur die letzten 50.
    const jeMitarbeiter = new Map<string, { stunden: number; einsaetze: number }>();
    for (const u of alleEinsaetze) {
      const e = jeMitarbeiter.get(u.mitarbeiter) || { stunden: 0, einsaetze: 0 };
      e.stunden += u.stunden || 0;
      e.einsaetze += 1;
      jeMitarbeiter.set(u.mitarbeiter, e);
    }
    setStundenJeMitarbeiter(
      [...jeMitarbeiter.entries()]
        .map(([name, w]) => ({ name, ...w, stunden: Math.round(w.stunden * 100) / 100 }))
        .sort((a, b) => b.stunden - a.stunden)
    );

    setUsages(alleEinsaetze.slice(0, 50));
    setUsagesLoading(false);
  };

  /** Höchster erfasster Zählerstand = aktueller km-Stand des Fahrzeugs. */
  const aktuellerKmStand = usages.reduce<number | null>(
    (max, u) => (u.kmStand != null && (max === null || u.kmStand > max) ? u.kmStand : max),
    null
  );

  // ── Filterung ──
  const filtered = vehicles.filter(v => {
    if (artFilter !== "alle" && (v.art || "fahrzeug") !== artFilter) return false;
    if (typFilter !== "alle" && (v.typ || "") !== typFilter) return false;
    if (aktivFilter === "aktiv" && !v.aktiv) return false;
    if (aktivFilter === "inaktiv" && v.aktiv) return false;
    if (!search.trim()) return true;
    return matchesSearch(v.kennzeichen, search) || matchesSearch(v.bezeichnung, search);
  });

  const selectedRow = vehicles.find(v => v.id === selectedId) || null;

  // Summen über die gefilterte Liste — der Chef will die Jahres-Gesamtkosten
  // des Fuhrparks sehen, ohne selbst zusammenzuzählen.
  const summeStunden = filtered.reduce((s, v) => s + (stats[v.id]?.stunden || 0), 0);
  const summeKm = filtered.reduce((s, v) => s + (stats[v.id]?.km || 0), 0);
  const summeKosten = filtered.reduce((s, v) => s + (stats[v.id]?.kosten || 0), 0);

  // ── Editor öffnen ──
  const openNew = (art: Art = "fahrzeug") => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, art, typ: typOptionsFuer(art)[0].value });
    setNeueKostenstelle("");
    setCosts([]);
    setUsages([]);
    setTab("kosten");
    setDialogOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditId(v.id);
    setNeueKostenstelle("");
    setForm({
      art: ((v.art === "maschine" ? "maschine" : "fahrzeug") as Art),
      kostenstelle: v.kostenstelle || "",
      pickerl_faellig_am: v.pickerl_faellig_am || "",
      pickerl_erinnerung_tage: String(v.pickerl_erinnerung_tage ?? 30),
      pickerl_letzte_pruefung: v.pickerl_letzte_pruefung || "",
      bezeichnung: v.bezeichnung || "",
      kennzeichen: v.kennzeichen || "",
      typ: v.typ || typOptionsFuer(v.art || "fahrzeug")[0].value,
      aktiv: !!v.aktiv,
      notizen: v.notizen || "",
    });
    setTab("kosten");
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
    const istMaschine = form.art === "maschine";
    const payload = {
      art: form.art,
      bezeichnung: form.bezeichnung.trim(),
      kennzeichen: form.kennzeichen.trim() || null,
      typ: form.typ || null,
      aktiv: form.aktiv,
      notizen: form.notizen.trim() || null,
      kostenstelle: form.kostenstelle || null,
      // Das Pickerl (§ 57a) betrifft nur Fahrzeuge. Wird ein Gerät auf
      // „Maschine" umgestellt, muss der Termin mit weg — sonst erinnert die
      // Startseite ewig an eine Begutachtung, die es nicht gibt.
      pickerl_faellig_am: istMaschine ? null : (form.pickerl_faellig_am || null),
      pickerl_erinnerung_tage: Math.max(0, Number(form.pickerl_erinnerung_tage) || 30),
      pickerl_letzte_pruefung: istMaschine ? null : (form.pickerl_letzte_pruefung || null),
    };
    try {
      if (editId) {
        const { error } = await (supabase.from("vehicles" as never) as any)
          .update(payload)
          .eq("id", editId);
        if (error) throw error;
        toast({ title: "Gespeichert", description: `${artLabel(form.art)} wurde aktualisiert` });
      } else {
        const { error } = await (supabase.from("vehicles" as never) as any).insert(payload);
        if (error) throw error;
        toast({ title: "Erstellt", description: `${artLabel(form.art)} wurde angelegt` });
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
          ? "Dafür gibt es bereits Zeitbuchungen. Setze den Eintrag stattdessen auf „inaktiv“."
          : error.message,
      });
      return;
    }
    toast({ title: "Gelöscht", description: "Eintrag wurde gelöscht" });
    if (selectedId === id) setSelectedId(null);
    fetchAll();
  };

  // Kosten kommen jetzt aus zugeordneten Eingangsrechnungen (Kundenwunsch:
  // „dann brauchen wir das im KFZ-Manager nicht, weil das automatisch
  // zugeordnet wird"). Löschen gibt es nur noch für Alt-Zeilen aus der
  // früheren Handerfassung.
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
  // Die Grid-Spalte „Kosten (Jahr)" zeigt nur das laufende Jahr — im Dialog
  // stehen alle Jahre. Beides getrennt ausweisen, sonst wundert sich der Chef.
  const costSumJahr = costs
    .filter(c => (c.datum || "").slice(0, 4) === String(jahr))
    .reduce((s, c) => s + (Number(c.betrag) || 0), 0);
  // Über die tatsächlich vorkommenden Kategorien iterieren — ER-Zeilen tragen
  // eingangsrechnung_kategorie-Werte, die in der alten Festliste fehlten;
  // ihre Beträge tauchten dann in der Summe, aber in keinem Chip auf.
  const costsNachKategorie = [...new Set(costs.map(c => c.kategorie))]
    .map(kat => ({
      label: kategorieLabel(kat),
      betrag: costs.filter(c => c.kategorie === kat).reduce((s, c) => s + (Number(c.betrag) || 0), 0),
    }))
    .filter(k => k.betrag > 0)
    .sort((a, b) => b.betrag - a.betrag);

  // ── Editor-Dialog (KingBill-Look: Toolbar-Kopf + grünes „Speichern & Schließen") ──
  const editorDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{editId ? `${artLabel(form.art)} bearbeiten` : `Neue${form.art === "maschine" ? "" : "s"} ${artLabel(form.art)}`}</DialogTitle>
        </DialogHeader>
        <KBToolbar
          sticky={false}
          className="rounded-t-md pr-12"
          onBack={() => setDialogOpen(false)}
          backLabel="Schließen ohne Speichern"
          title={editId ? `${artLabel(form.art)} bearbeiten` : `Neue${form.art === "maschine" ? "" : "s"} ${artLabel(form.art)}`}
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
          {/* ── Art: Fahrzeug oder Maschine ──
              Steht ganz oben, weil davon Typliste und Pickerl-Felder abhängen. */}
          <div>
            <span className="block text-xs font-semibold mb-1">Art</span>
            <div className="flex gap-2">
              {ARTEN.map(a => {
                const aktiv = form.art === a.value;
                return (
                  <button
                    key={a.value}
                    type="button"
                    aria-pressed={aktiv}
                    onClick={() => setForm(f => (
                      f.art === a.value ? f : {
                        ...f,
                        art: a.value,
                        // Typ zurücksetzen: „PKW" passt zu keiner Maschine.
                        typ: typOptionsFuer(a.value)[0].value,
                      }
                    ))}
                    className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-md border-2 px-3 text-sm font-medium transition-colors ${
                      aktiv ? "border-kb-blue bg-kb-blue/15 text-kb-blue-dark" : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <span aria-hidden>{a.icon}</span>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Stammdaten ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1" htmlFor="fz-bez">Bezeichnung *</label>
              <input
                id="fz-bez"
                className="kb-input w-full"
                value={form.bezeichnung}
                onChange={(e) => setForm(f => ({ ...f, bezeichnung: e.target.value }))}
                placeholder={form.art === "maschine" ? "z.B. Liebherr Kran 22 K" : "z.B. VW T6 Werkstatt"}
              />
            </div>
            <div>
              {/* Dieselbe Spalte trägt bei Maschinen die Inventar-/Seriennummer —
                  gebucht und ausgewertet wird beides gleich. */}
              <label className="block text-xs font-semibold mb-1" htmlFor="fz-kz">
                {form.art === "maschine" ? "Inventar-/Seriennummer" : "Kennzeichen"}
              </label>
              <input
                id="fz-kz"
                className="kb-input w-full"
                value={form.kennzeichen}
                onChange={(e) => setForm(f => ({ ...f, kennzeichen: e.target.value }))}
                placeholder={form.art === "maschine" ? "z.B. SN-884321" : "ZT-1234F"}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Typ</label>
              <Select value={form.typ} onValueChange={(v) => setForm(f => ({ ...f, typ: v }))}>
                <SelectTrigger className="h-9" aria-label="Typ"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typOptionsFuer(form.art).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                {artLabel(form.art)} aktiv
              </label>
            </div>
            {/* ── Kostenstelle: worauf Stunden für dieses Gerät gebucht werden ──
                Dieselbe Liste wie in der Zeiterfassung; neue Einträge lassen
                sich hier direkt anlegen (Kundenwunsch). */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Kostenstelle (Zeiterfassung)</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={form.kostenstelle || "__keine__"}
                  onValueChange={(v) => setForm(f => ({ ...f, kostenstelle: v === "__keine__" ? "" : v }))}
                >
                  <SelectTrigger className="h-9 sm:flex-1" aria-label="Kostenstelle"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__keine__">— keine —</SelectItem>
                    {kostenstellen.map(k => <SelectItem key={k.wert} value={k.wert}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 sm:w-[300px]">
                  <input
                    className="kb-input flex-1"
                    value={neueKostenstelle}
                    onChange={(e) => setNeueKostenstelle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); kostenstelleAnlegen(); } }}
                    placeholder="Neue Kostenstelle…"
                    aria-label="Neue Kostenstelle anlegen"
                  />
                  <button
                    type="button"
                    className="kb-btn shrink-0"
                    onClick={kostenstelleAnlegen}
                    disabled={!neueKostenstelle.trim()}
                    title="Kostenstelle anlegen"
                  >
                    <Plus className="h-4 w-4 text-kb-green" />
                  </button>
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Steuert, worauf die Mitarbeiter Stunden für dieses Gerät buchen. Neue
                Kostenstellen stehen sofort auch in der Zeiterfassung zur Auswahl.
              </p>
            </div>

            {/* ── Pickerl (§ 57a) — nur bei Fahrzeugen ── */}
            {form.art === "fahrzeug" && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1" htmlFor="fz-pickerl">Pickerl fällig am</label>
                  <input
                    id="fz-pickerl"
                    type="date"
                    className="kb-input w-full"
                    value={form.pickerl_faellig_am}
                    onChange={(e) => setForm(f => ({ ...f, pickerl_faellig_am: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" htmlFor="fz-vorlauf">Erinnerung (Tage vorher)</label>
                  <input
                    id="fz-vorlauf"
                    type="text"
                    inputMode="numeric"
                    className="kb-input w-full"
                    value={form.pickerl_erinnerung_tage}
                    onChange={(e) => setForm(f => ({ ...f, pickerl_erinnerung_tage: e.target.value.replace(/[^0-9]/g, "") }))}
                    placeholder="30"
                  />
                  <p className="mt-0.5 text-[11px] text-muted-foreground">z.B. 30 für einen Monat, 14 für zwei Wochen</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" htmlFor="fz-letzte">Letzte Überprüfung</label>
                  <input
                    id="fz-letzte"
                    type="date"
                    className="kb-input w-full"
                    value={form.pickerl_letzte_pruefung}
                    onChange={(e) => setForm(f => ({ ...f, pickerl_letzte_pruefung: e.target.value }))}
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1" htmlFor="fz-notiz">Notizen</label>
              <textarea
                id="fz-notiz"
                className="kb-input w-full min-h-[70px] py-2"
                value={form.notizen}
                onChange={(e) => setForm(f => ({ ...f, notizen: e.target.value }))}
                placeholder={form.art === "maschine" ? "z.B. Service alle 250 Betriebsstunden" : "z.B. Winterreifen im Lager"}
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
                  <p className="text-xs text-muted-foreground">
                    Kosten kommen automatisch aus Eingangsrechnungen, die diesem
                    Gerät zugeordnet sind (Eingangsrechnungen → „Fahrzeug / Maschine").
                  </p>

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
                              <TableCell>
                                {kategorieLabel(c.kategorie)}
                                {c.quelle === "er" && (
                                  <span className="ml-1.5 rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground">ER</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium whitespace-nowrap">€ {eur(Number(c.betrag) || 0)}</TableCell>
                              <TableCell className="max-w-[260px] truncate">{c.beschreibung || "–"}</TableCell>
                              <TableCell className="w-10">
                                {c.quelle === "manuell" && (
                                  <button
                                    type="button"
                                    className="text-destructive hover:opacity-70"
                                    onClick={() => deleteCost(c.id)}
                                    title="Alt-Kostenzeile löschen"
                                    aria-label="Alt-Kostenzeile löschen"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="border-t border-border pt-2 space-y-1">
                    {costsNachKategorie.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {costsNachKategorie.map(k => (
                          <span key={k.label}>{k.label}: € {eur(k.betrag)}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-x-4 text-sm font-bold">
                      <span className="text-xs font-normal text-muted-foreground">davon {jahr}: € {eur(costSumJahr)}</span>
                      <span>Summe: € {eur(costSum)}</span>
                    </div>
                    <p className="text-right text-[11px] text-muted-foreground">
                      Eingangsrechnungen zählen netto; Alt-Einträge wie seinerzeit erfasst.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Tab „Einsätze": read-only ── */}
              {tab === "einsaetze" && (
                <div className="pt-3 space-y-3">
                  {/* Kopfzeile: aktueller Zählerstand + Jahresleistung auf einen Blick */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="kb-panel p-2">
                      <p className="text-[11px] text-muted-foreground">Aktueller km-Stand</p>
                      <p className="text-base font-bold">
                        {aktuellerKmStand !== null ? `${aktuellerKmStand.toLocaleString("de-AT")} km` : "–"}
                      </p>
                    </div>
                    <div className="kb-panel p-2">
                      <p className="text-[11px] text-muted-foreground">Gefahren ({jahr})</p>
                      <p className="text-base font-bold">
                        {(stats[editId || ""]?.km || 0).toLocaleString("de-AT")} km
                      </p>
                    </div>
                    <div className="kb-panel p-2 col-span-2 sm:col-span-1">
                      <p className="text-[11px] text-muted-foreground">Stunden ({jahr})</p>
                      <p className="text-base font-bold">{(stats[editId || ""]?.stunden || 0).toFixed(2)} h</p>
                    </div>
                  </div>

                  {/* Stunden je Mitarbeiter — auf einen Blick, ohne die
                      Einzelliste durchzählen zu müssen. */}
                  {stundenJeMitarbeiter.length > 0 && (
                    <div className="kb-panel p-3">
                      <p className="mb-1.5 text-xs font-semibold">Stunden je Mitarbeiter <span className="font-normal text-muted-foreground">(letzte 500 Einsätze)</span></p>
                      <div className="divide-y divide-border/60 text-sm">
                        {stundenJeMitarbeiter.map((m) => (
                          <div key={m.name} className="flex items-center justify-between py-1">
                            <span className="min-w-0 truncate">{m.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground mr-3">{m.einsaetze} Einsätze</span>
                            <span className="shrink-0 font-bold tabular-nums">{m.stunden.toFixed(2)} h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mobil: Karten — am Handy ist die 5-Spalten-Tabelle unlesbar */}
                  <div className="space-y-2 sm:hidden">
                    {usagesLoading ? (
                      <p className="text-center text-muted-foreground py-6">Lädt…</p>
                    ) : usages.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6">Keine Einsätze erfasst.</p>
                    ) : (
                      usages.map(u => (
                        <div key={u.id} className="rounded-md border border-border p-2 text-sm">
                          <div className="flex items-center justify-between font-medium">
                            <span>{u.datum ? format(parseISO(u.datum), "dd.MM.yyyy", { locale: de }) : "–"}</span>
                            <span>{u.stunden !== null ? `${u.stunden.toFixed(2)} h` : "–"}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="truncate">{u.mitarbeiter}</span>
                            <span>
                              {u.km ? `${u.km.toLocaleString("de-AT")} km` : "– km"}
                              {u.kmStand != null ? ` · Stand ${u.kmStand.toLocaleString("de-AT")}` : ""}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Datum</TableHead>
                          <TableHead>Mitarbeiter</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Stunden</TableHead>
                          <TableHead className="text-right whitespace-nowrap">km</TableHead>
                          <TableHead className="text-right whitespace-nowrap">km-Stand</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usagesLoading ? (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Lädt…</TableCell></TableRow>
                        ) : usages.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Keine Einsätze erfasst.</TableCell></TableRow>
                        ) : (
                          usages.map(u => (
                            <TableRow key={u.id}>
                              <TableCell className="whitespace-nowrap">
                                {u.datum ? format(parseISO(u.datum), "dd.MM.yyyy", { locale: de }) : "–"}
                              </TableCell>
                              <TableCell>{u.mitarbeiter}</TableCell>
                              <TableCell className="text-right">{u.stunden !== null ? u.stunden.toFixed(2) : "–"}</TableCell>
                              <TableCell className="text-right">{u.km ? u.km.toLocaleString("de-AT") : "–"}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {u.kmStand != null ? u.kmStand.toLocaleString("de-AT") : "–"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Letzte 50 Einsätze aus der Zeiterfassung (nur Anzeige). Der km-Stand
                    kommt aus den Buchungen mit „km Start / Ende".
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground border-t border-border pt-3">
              Kosten und Einsätze können erfasst werden, sobald der Eintrag gespeichert ist.
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

      <KBToolbar onBack={zurueck} title="KFZ-Manager">
        {/* Zwei getrennte Knöpfe statt „Neu" + Rückfrage: ein Klick weniger,
            und man sieht ohne Öffnen, dass es beides gibt. */}
        <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Fahrzeug" title="Neues Fahrzeug anlegen" onClick={() => openNew("fahrzeug")} />
        <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Maschine" title="Neue Maschine anlegen" onClick={() => openNew("maschine")} />
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
              className="kb-btn min-h-[44px] w-full justify-between lg:hidden"
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
                aria-label="Fahrzeuge und Maschinen durchsuchen"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <Select value={artFilter} onValueChange={setArtFilter}>
                <SelectTrigger className="w-full h-9" aria-label="Art filtern">
                  <SelectValue placeholder="Art filtern…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Fahrzeuge & Maschinen</SelectItem>
                  {ARTEN.map(a => <SelectItem key={a.value} value={a.value}>Nur {a.plural}</SelectItem>)}
                </SelectContent>
              </Select>

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
                Anzahl Einträge: {loading ? "…" : filtered.length}
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
              <h2 className="text-lg font-bold">Fahrzeuge & Maschinen</h2>
              <p className="text-xs text-muted-foreground">Anzahl Einträge: {filtered.length} — Kennzahlen {jahr}</p>
            </div>
            <div className="p-2 sm:p-3">
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Lädt...</p>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-lg font-semibold mb-1">
                    {search || artFilter !== "alle" || typFilter !== "alle" || aktivFilter !== "alle"
                      ? "Nichts gefunden"
                      : "Noch keine Fahrzeuge oder Maschinen"}
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {search || artFilter !== "alle" || typFilter !== "alle" || aktivFilter !== "alle"
                      ? "Passe Suche/Filter an oder lege einen neuen Eintrag an."
                      : "Lege dein erstes Fahrzeug oder deine erste Maschine an, um Stunden, Kilometer und Kosten zu erfassen."}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className="kb-btn" onClick={() => openNew("fahrzeug")}>
                      <Plus className="w-4 h-4 text-kb-green" /> Fahrzeug anlegen
                    </button>
                    <button type="button" className="kb-btn" onClick={() => openNew("maschine")}>
                      <Plus className="w-4 h-4 text-kb-green" /> Maschine anlegen
                    </button>
                  </div>
                </div>
              ) : (
                <>
                {/* ── Mobil: Karten (die 8-Spalten-Tabelle ist am Handy unbrauchbar) ── */}
                <div className="space-y-2 sm:hidden print:hidden">
                  {filtered.map(v => {
                    const isSelected = selectedId === v.id;
                    const s = stats[v.id] || { stunden: 0, km: 0, kosten: 0 };
                    const fahrer = standardFahrer[v.id] || [];
                    return (
                      <button
                        key={v.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedId(v.id)}
                        onDoubleClick={() => openEdit(v)}
                        className={`w-full min-h-[44px] rounded-md border p-3 text-left transition-colors ${
                          isSelected ? "border-kb-blue bg-kb-blue/15" : "border-border bg-card"
                        } ${!v.aktiv ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.aktiv ? "bg-green-500" : "bg-gray-400"}`} />
                              <span className="font-semibold truncate">{v.bezeichnung}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {v.kennzeichen ? <span className="font-mono">{v.kennzeichen}</span> : "ohne Kennzeichen"} · {artLabel(v.art)} · {typLabel(v.typ)}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold whitespace-nowrap">
                            {s.kosten > 0 ? `€ ${eur(s.kosten)}` : "€ 0,00"}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                          <span className="text-muted-foreground">Std. {jahr}: <b className="text-foreground">{s.stunden > 0 ? s.stunden.toFixed(2) : "–"}</b></span>
                          <span className="text-muted-foreground">km {jahr}: <b className="text-foreground">{s.km > 0 ? s.km.toLocaleString("de-AT") : "–"}</b></span>
                          <span className="text-muted-foreground truncate">Fahrer: <b className="text-foreground">{fahrer.length > 0 ? fahrer.join(", ") : "–"}</b></span>
                        </div>
                        {isSelected && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); openEdit(v); } }}
                            className="mt-2 flex min-h-[44px] items-center justify-center rounded-md border border-kb-blue-dark bg-white text-sm font-semibold text-kb-blue-dark"
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Öffnen / bearbeiten
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm font-bold flex items-center justify-between">
                    <span>Summe {jahr}</span>
                    <span>€ {eur(summeKosten)}</span>
                  </div>
                </div>

                <div className="hidden sm:block print:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"><span className="sr-only">Status</span></TableHead>
                        <TableHead>Kennzeichen</TableHead>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead>Art</TableHead>
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
                            <TableCell className="whitespace-nowrap">{artLabel(v.art)}</TableCell>
                            <TableCell className="whitespace-nowrap">{typLabel(v.typ)}</TableCell>
                            <TableCell className="max-w-[220px] truncate">{fahrer.length > 0 ? fahrer.join(", ") : "–"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{s.stunden > 0 ? s.stunden.toFixed(2) : "–"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{s.km > 0 ? s.km.toLocaleString("de-AT") : "–"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap font-medium">{s.kosten > 0 ? `€ ${eur(s.kosten)}` : "–"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={6} className="text-right font-bold">Summe {jahr}:</TableCell>
                        <TableCell className="text-right font-bold whitespace-nowrap">{summeStunden > 0 ? summeStunden.toFixed(2) : "–"}</TableCell>
                        <TableCell className="text-right font-bold whitespace-nowrap">{summeKm > 0 ? summeKm.toLocaleString("de-AT") : "–"}</TableCell>
                        <TableCell className="text-right font-bold whitespace-nowrap">€ {eur(summeKosten)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Löschen-Bestätigung für die markierte Zeile */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedRow ? `${artLabel(selectedRow.art)} löschen?` : "Löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRow
                ? `${selectedRow.bezeichnung}${selectedRow.kennzeichen ? ` (${selectedRow.kennzeichen})` : ""} wird dauerhaft gelöscht — inklusive der erfassten Kosten. Einträge mit Zeitbuchungen lassen sich nicht löschen.`
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
