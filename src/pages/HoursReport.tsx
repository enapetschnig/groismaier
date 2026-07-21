import { useState, useEffect, useMemo, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, Building2, Hammer, ChevronDown, ChevronRight, Pencil, Trash2, Save, Plus, UserCog, CalendarOff, Truck } from "lucide-react";
import { KBToolbar } from "@/components/kingbill";
import { toNumber, clamp } from "@/lib/num";
import { AdminAbsenceDialog } from "@/components/AdminAbsenceDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AdminTimeEntryDialog } from "@/components/AdminTimeEntryDialog";
import { format, isSameDay, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import * as XLSX from "xlsx-js-style";
import { cn } from "@/lib/utils";
import ProjectHoursReport from "@/components/ProjectHoursReport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNormalWorkingHours } from "@/lib/workingHours";
import { aggregateByDay, totalAutoSaldo, formatSaldo, type DayBalance } from "@/lib/hoursAccounting";

interface TimeEntry {
  id: string;
  datum: string;
  start_time: string;
  end_time: string;
  pause_minutes: number;
  pause_start?: string;
  pause_end?: string;
  stunden: number;
  location_type: string;
  project_id: string | null;
  user_id: string;
  taetigkeit: string;
  week_type?: string | null;
  disturbance_id?: string | null;
  wetterschicht_stunden?: number | null;
  nachgetragen_von?: string | null;
  nachgetragen_am?: string | null;
}

interface Profile {
  vorname: string;
  nachname: string;
}

interface Project {
  id: string;
  name: string;
  adresse?: string;
  plz?: string;
}

/** Kostenstelle aus admin_config_options (kategorie='kostenstelle'). */
interface KostenstelleOption {
  wert: string;
  label: string;
}

/** Rohzeile für die Kostenstellen-Auswertung. */
interface KostenstelleRow {
  user_id: string;
  stunden: number;
  kostenstelle: string;
}

/** Aggregierte Fahrzeug-Kennzahlen für den gewählten Zeitraum. */
interface VehicleStat {
  vehicleId: string;
  bezeichnung: string;
  kennzeichen: string | null;
  stunden: number;
  km: number;
  kostenGesamt: number;
  kostenNachKategorie: Record<string, number>;
}

const KOSTENSTELLEN_FALLBACK: KostenstelleOption[] = [
  { wert: "baustelle", label: "Baustelle" },
  { wert: "werkstatt", label: "Werkstatt" },
  { wert: "lagerwerkstatt", label: "Lagerwerkstatt" },
  { wert: "lagerplatz", label: "Lagerplatz" },
];

const KOSTEN_KATEGORIEN: { wert: string; label: string }[] = [
  { wert: "reparatur", label: "Reparatur" },
  { wert: "service", label: "Service" },
  { wert: "treibstoff", label: "Treibstoff" },
  { wert: "sonstiges", label: "Sonstiges" },
];

const formatEuro = (v: number) =>
  v.toLocaleString("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

const monthNames = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export default function HoursReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  // pause_minutes als Rohtext (parseDecimal beim Speichern) — „30" wie bisher,
  // aber auch „30,0" oder Leereingabe brechen nichts mehr.
  const [editForm, setEditForm] = useState({ start_time: "", end_time: "", pause_minutes: "0", stunden: 0, taetigkeit: "", location_type: "", project_id: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Admin-Dialog (voller Editor + Nachtrag)
  const [adminDialog, setAdminDialog] = useState<{ open: boolean; entryId: string | null; datum: string }>({
    open: false, entryId: null, datum: "",
  });
  // Admin-Abwesenheits-Dialog (Urlaub/Krank/ZA/Feiertag/Weiterbildung
  // für Datumsbereich nachtragen).
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const openAdminEdit = (entry: TimeEntry) => setAdminDialog({ open: true, entryId: entry.id, datum: entry.datum });
  const openAdminCreate = (dateIso: string) => setAdminDialog({ open: true, entryId: null, datum: dateIso });
  const closeAdminDialog = () => setAdminDialog({ open: false, entryId: null, datum: "" });

  // ---- Kostenstellen-Auswertung -------------------------------------
  const [ksOptions, setKsOptions] = useState<KostenstelleOption[]>(KOSTENSTELLEN_FALLBACK);
  const [ksFilter, setKsFilter] = useState<string>("alle");
  const [ksRows, setKsRows] = useState<KostenstelleRow[]>([]);
  const [ksLoading, setKsLoading] = useState(false);
  const [expandedKs, setExpandedKs] = useState<Set<string>>(new Set());

  // ---- Fahrzeug-Auswertung ------------------------------------------
  const [vehicleStats, setVehicleStats] = useState<VehicleStat[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);

  const periodStart = format(new Date(year, month - 1, 1), "yyyy-MM-dd");
  const periodEnd = format(new Date(year, month, 0), "yyyy-MM-dd");

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  useEffect(() => {
    checkAdminStatus();
    fetchProfiles();
    fetchProjects();
    fetchKostenstellenOptions();
  }, []);

  useEffect(() => {
    fetchKostenstellenRows();
    fetchVehicleStats();
  }, [month, year]);

  const fetchKostenstellenOptions = async () => {
    const { data } = await (supabase.from("admin_config_options" as never) as any)
      .select("wert, label, sort_order")
      .eq("kategorie", "kostenstelle")
      .eq("is_active", true)
      .order("sort_order");
    const list = ((data as any[]) || []).map((o) => ({ wert: o.wert as string, label: o.label as string }));
    if (list.length > 0) setKsOptions(list);
  };

  // Alle Zeiteinträge des Zeitraums — RLS begrenzt Nicht-Admins
  // automatisch auf die eigenen Einträge.
  const fetchKostenstellenRows = async () => {
    setKsLoading(true);
    const { data, error } = await (supabase.from("time_entries" as never) as any)
      .select("user_id, stunden, kostenstelle")
      .gte("datum", periodStart)
      .lte("datum", periodEnd);
    if (error) {
      console.error("Kostenstellen-Auswertung:", error);
      setKsRows([]);
    } else {
      setKsRows(((data as any[]) || []).map((r) => ({
        user_id: r.user_id,
        stunden: Number(r.stunden) || 0,
        kostenstelle: r.kostenstelle || "baustelle",
      })));
    }
    setKsLoading(false);
  };

  // Fahrzeugstunden + km aus time_entry_vehicles (Join auf time_entries
  // für den Datumsfilter) sowie Kosten aus vehicle_costs.
  const fetchVehicleStats = async () => {
    setVehicleLoading(true);
    const [{ data: vehData }, { data: tevData }, { data: costData }] = await Promise.all([
      (supabase.from("vehicles" as never) as any)
        .select("id, bezeichnung, kennzeichen")
        .order("bezeichnung"),
      (supabase.from("time_entry_vehicles" as never) as any)
        .select("vehicle_id, stunden, modus, km_gefahren, km_start, km_ende, time_entries!inner(datum, stunden)")
        .gte("time_entries.datum", periodStart)
        .lte("time_entries.datum", periodEnd),
      (supabase.from("vehicle_costs" as never) as any)
        .select("vehicle_id, betrag, kategorie")
        .gte("datum", periodStart)
        .lte("datum", periodEnd),
    ]);

    const statMap = new Map<string, VehicleStat>();
    const ensure = (id: string): VehicleStat => {
      let s = statMap.get(id);
      if (!s) {
        const v = ((vehData as any[]) || []).find((x) => x.id === id);
        s = {
          vehicleId: id,
          bezeichnung: v?.bezeichnung || "Unbekanntes Fahrzeug",
          kennzeichen: v?.kennzeichen ?? null,
          stunden: 0,
          km: 0,
          kostenGesamt: 0,
          kostenNachKategorie: {},
        };
        statMap.set(id, s);
      }
      return s;
    };

    for (const row of ((tevData as any[]) || [])) {
      if (!row.vehicle_id) continue;
      const s = ensure(row.vehicle_id);
      // Fallback auf die Stunden des Zeiteintrags NUR bei NULL (Altbestand
      // ohne eigene Fahrzeugstunden). Eine ausdrücklich erfasste 0 bleibt 0 —
      // sonst würde ein „nicht gefahren" als volle Arbeitszeit gezählt.
      const eigen = row.stunden === null || row.stunden === undefined ? null : Number(row.stunden);
      const h = eigen !== null && isFinite(eigen)
        ? eigen
        : (Number(row.time_entries?.stunden) || 0);
      s.stunden += isFinite(h) ? h : 0;
      const km = row.km_gefahren != null
        ? Number(row.km_gefahren)
        : (row.km_start != null && row.km_ende != null ? Number(row.km_ende) - Number(row.km_start) : 0);
      s.km += isFinite(km) && km > 0 ? km : 0;
    }

    for (const c of ((costData as any[]) || [])) {
      if (!c.vehicle_id) continue;
      const s = ensure(c.vehicle_id);
      const betrag = Number(c.betrag) || 0;
      s.kostenGesamt += betrag;
      const kat = c.kategorie || "sonstiges";
      s.kostenNachKategorie[kat] = (s.kostenNachKategorie[kat] || 0) + betrag;
    }

    // Fahrzeuge ohne Bewegung im Zeitraum trotzdem anzeigen
    for (const v of ((vehData as any[]) || [])) ensure(v.id);

    setVehicleStats(
      Array.from(statMap.values()).sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de"))
    );
    setVehicleLoading(false);
  };

  const ksLabel = (wert: string) =>
    ksOptions.find((o) => o.wert === wert)?.label || wert;

  const employeeName = (userId: string) =>
    profiles[userId] ? `${profiles[userId].vorname} ${profiles[userId].nachname}` : "Unbekannt";

  // Kostenstellen-Aggregation: Summe je Kostenstelle + je Mitarbeiter
  const kostenstellenAggregat = useMemo(() => {
    const filtered = ksFilter === "alle" ? ksRows : ksRows.filter((r) => r.kostenstelle === ksFilter);
    const map = new Map<string, { kostenstelle: string; stunden: number; perUser: Map<string, number> }>();
    for (const r of filtered) {
      let e = map.get(r.kostenstelle);
      if (!e) {
        e = { kostenstelle: r.kostenstelle, stunden: 0, perUser: new Map() };
        map.set(r.kostenstelle, e);
      }
      e.stunden += r.stunden;
      e.perUser.set(r.user_id, (e.perUser.get(r.user_id) || 0) + r.stunden);
    }
    const order = ksOptions.map((o) => o.wert);
    return Array.from(map.values())
      .map((e) => ({
        kostenstelle: e.kostenstelle,
        stunden: e.stunden,
        perUser: Array.from(e.perUser.entries())
          .map(([user_id, stunden]) => ({ user_id, stunden }))
          .sort((a, b) => b.stunden - a.stunden),
      }))
      .sort((a, b) => {
        const ia = order.indexOf(a.kostenstelle);
        const ib = order.indexOf(b.kostenstelle);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
  }, [ksRows, ksFilter, ksOptions]);

  const kostenstellenGesamt = useMemo(
    () => kostenstellenAggregat.reduce((s, e) => s + e.stunden, 0),
    [kostenstellenAggregat]
  );

  const toggleKs = (wert: string) => {
    setExpandedKs((prev) => {
      const next = new Set(prev);
      if (next.has(wert)) next.delete(wert); else next.add(wert);
      return next;
    });
  };

  // Kompakter Monats-/Jahres-Wähler für die neuen Auswertungs-Tabs
  const renderPeriodPicker = () => (
    <div className="flex flex-col sm:flex-row gap-3">
      <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
        <SelectTrigger className="h-11 kb-input"><SelectValue /></SelectTrigger>
        <SelectContent position="popper">
          {monthNames.map((name, i) => (
            <SelectItem key={i} value={(i + 1).toString()}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
        <SelectTrigger className="h-11 kb-input"><SelectValue /></SelectTrigger>
        <SelectContent position="popper">
          {years.map((y) => (
            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  useEffect(() => {
    if (selectedUserId) {
      fetchTimeEntries();
    }
  }, [month, year, selectedUserId]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const admin = data?.role === "administrator";
    setIsAdmin(admin);

    // Wenn nicht Admin, eigene User ID setzen
    if (!admin) {
      setSelectedUserId(user.id);
    } else {
      // Check for employee query param
      const employeeParam = searchParams.get("employee");
      if (employeeParam) {
        setSelectedUserId(employeeParam);
      }
    }
  };

  const fetchProfiles = async () => {
    const { data } = await (supabase.from("profiles" as never) as any)
      .select("id, vorname, nachname")
      .eq("hidden", false);
    if (data) {
      const profileMap: Record<string, Profile> = {};
      data.forEach((p) => {
        profileMap[p.id] = { vorname: p.vorname, nachname: p.nachname };
      });
      setProfiles(profileMap);
    }
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name, adresse, plz");
    if (data) {
      const projectMap: Record<string, Project> = {};
      data.forEach((p) => {
        projectMap[p.id] = p;
      });
      setProjects(projectMap);
    }
  };

  const fetchTimeEntries = async () => {
    setLoading(true);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // time_entries mit zugehörigen KFZ-Einträgen (time_entry_vehicles) laden —
    // damit wir in der Auswertung gefahrene km + Fahrzeug anzeigen können.
    const { data, error } = await supabase
      .from("time_entries")
      .select("*, time_entry_vehicles(modus, km_gefahren, km_start, km_ende, vehicle_id, vehicles(bezeichnung, kennzeichen))")
      .eq("user_id", selectedUserId)
      .gte("datum", format(startDate, "yyyy-MM-dd"))
      .lte("datum", format(endDate, "yyyy-MM-dd"))
      .order("datum");

    if (error) {
      toast({ title: "Fehler beim Laden", description: error.message, variant: "destructive" });
    } else {
      setTimeEntries(data || []);
    }
    setLoading(false);
  };

  const openEdit = (entry: TimeEntry) => {
    setEditEntry(entry);
    setEditForm({
      start_time: entry.start_time?.substring(0, 5) || "",
      end_time: entry.end_time?.substring(0, 5) || "",
      pause_minutes: String(entry.pause_minutes || 0),
      stunden: entry.stunden,
      taetigkeit: entry.taetigkeit || "",
      location_type: entry.location_type || "baustelle",
      project_id: entry.project_id || "",
    });
  };

  const recalcHours = (start: string, end: string, pause: number) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const totalMin = (eh * 60 + em) - (sh * 60 + sm) - pause;
    return Math.max(0, Math.round(totalMin / 60 * 100) / 100);
  };

  const handleEditSave = async () => {
    if (!editEntry) return;
    const pause = clamp(Math.round(toNumber(editForm.pause_minutes, 0)), 0, 720);
    const stunden = recalcHours(editForm.start_time, editForm.end_time, pause);
    // Plausibilisieren statt den Postgres-Fehler durchzureichen.
    if (!(stunden > 0) || stunden > 24) {
      toast({
        title: "Zeiten unplausibel",
        description: "Aus Von/Bis/Pause ergeben sich " + stunden.toFixed(2) + " Stunden. Bitte Werte prüfen (0,01 bis 24 h).",
        variant: "destructive",
      });
      return;
    }
    setEditSaving(true);
    const { error } = await supabase.from("time_entries").update({
      start_time: editForm.start_time || null,
      end_time: editForm.end_time || null,
      pause_minutes: pause,
      stunden,
      taetigkeit: editForm.taetigkeit,
      location_type: editForm.location_type,
      project_id: editForm.project_id || null,
    }).eq("id", editEntry.id);
    setEditSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Eintrag aktualisiert" });
      setEditEntry(null);
      fetchTimeEntries();
    }
  };

  const handleEditDelete = async () => {
    if (!editEntry || !confirm("Eintrag wirklich löschen?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", editEntry.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Eintrag gelöscht" });
      setEditEntry(null);
      fetchTimeEntries();
    }
  };

  const generateMonthDays = () => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();

      days.push({
        date,
        dayNumber: day,
        dayOfWeek,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isFriday: dayOfWeek === 5,
      });
    }

    return days;
  };

  // Tages-Saldo aus dem zentralen Helper — pro Tag aggregiert,
  // Sonderzeiten neutral, Minusstunden möglich.
  const dayBalances = useMemo(() => aggregateByDay(timeEntries as any), [timeEntries]);
  const dayBalanceMap = useMemo(() => new Map(dayBalances.map(d => [d.datum, d])), [dayBalances]);
  // Erste Eintrags-ID pro Tag — damit "Überstunden" und Soll nur in
  // der ersten Zeile pro Tag gezeigt werden (vermeidet Doppelzählung).
  const firstEntryIdPerDay = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of timeEntries) {
      if (!map.has(e.datum)) map.set(e.datum, e.id);
    }
    return map;
  }, [timeEntries]);
  const getDayBal = (datum: string): DayBalance | undefined => dayBalanceMap.get(datum);
  const isFirstEntryOfDay = (entry: TimeEntry) => firstEntryIdPerDay.get(entry.datum) === entry.id;

  const calculateLunchBreak = (entry: TimeEntry) => {
    // Prioritize new pause_start/pause_end fields if available
    if (entry.pause_start && entry.pause_end) {
      return {
        start: entry.pause_start.substring(0, 5),
        end: entry.pause_end.substring(0, 5),
      };
    }
    
    // Fallback for old entries with only pause_minutes
    if (!entry.pause_minutes || entry.pause_minutes === 0) return null;

    const pauseStart = new Date(`2000-01-01T12:00:00`);
    const pauseEnd = new Date(pauseStart);
    pauseEnd.setMinutes(pauseEnd.getMinutes() + entry.pause_minutes);

    return {
      start: format(pauseStart, "HH:mm"),
      end: format(pauseEnd, "HH:mm"),
    };
  };

  const monthDays = generateMonthDays();
  // Per-Tag-Aggregation aus dem Helper — Multi-Project-Tage fließen
  // korrekt zusammen, Minusstunden bleiben erhalten.
  const totalHours = dayBalances.reduce((s, d) => s + d.ist, 0);
  const totalSaldo = dayBalances.reduce((s, d) => s + d.saldo, 0);
  const totalSoll = dayBalances.reduce((s, d) => s + d.soll, 0);
  // Stundenkonto-Status aus time_accounts (manuelle Buchungen) +
  // Live-Auto-Saldo über ALLE time_entries des Mitarbeiters (nicht
  // nur des aktuellen Monats). Wird im Header-Block angezeigt.
  const [manualBalance, setManualBalance] = useState<number>(0);
  const [autoBalanceAll, setAutoBalanceAll] = useState<number>(0);
  useEffect(() => {
    if (!selectedUserId) return;
    let cancelled = false;
    (async () => {
      const [{ data: acc }, { data: allEntries }] = await Promise.all([
        (supabase.from("time_accounts" as never) as any)
          .select("balance_hours").eq("user_id", selectedUserId).maybeSingle(),
        supabase.from("time_entries")
          .select("datum, stunden, taetigkeit").eq("user_id", selectedUserId),
      ]);
      if (cancelled) return;
      setManualBalance(Number((acc as any)?.balance_hours) || 0);
      setAutoBalanceAll(totalAutoSaldo((allEntries as any[]) || []));
    })();
    return () => { cancelled = true; };
  }, [selectedUserId]);

  const addBordersToCell = (cell: any, thick: boolean = false, centered: boolean = false) => {
    const borderStyle = thick ? "medium" : "thin";
    cell.s = {
      border: {
        top: { style: borderStyle, color: { rgb: "000000" } },
        bottom: { style: borderStyle, color: { rgb: "000000" } },
        left: { style: borderStyle, color: { rgb: "000000" } },
        right: { style: borderStyle, color: { rgb: "000000" } },
      },
      alignment: { vertical: "center", horizontal: centered ? "center" : "left" },
    };
  };

  const exportToExcel = (includeOvertime: boolean = true) => {
    if (!selectedUserId) {
      toast({ title: "Kein Mitarbeiter ausgewählt", variant: "destructive" });
      return;
    }

    const employeeName = profiles[selectedUserId]
      ? `${profiles[selectedUserId].vorname} ${profiles[selectedUserId].nachname}`
      : "Mitarbeiter";

    const monthNamesShort = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

    const worksheetData: any[][] = [
      // Firmendaten Header
      ["Holzbau Groismaier — Zimmerei & Holzbau", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
      ["Dienstnehmer:", "", employeeName, "", "", "", "", "", "Monat:", `${monthNamesShort[month - 1]}-${year.toString().slice(-2)}`, "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
    ];

    // Header-Zeilen dynamisch je nach includeOvertime
    if (includeOvertime) {
      worksheetData.push(
        ["Datum", "V o r m i t t a g", "", "Unterbrechung", "N a c h m i t t a g", "", "Stunden", "Überstunden", "Ort", "Projekt", "Tätigkeit", "PLZ", "☔ Wetter h"],
        ["", "Beginn", "Ende", "von - bis", "Beginn", "Ende", "Gesamt", "", "", "", "", "", ""]
      );
    } else {
      worksheetData.push(
        ["Datum", "V o r m i t t a g", "", "Unterbrechung", "N a c h m i t t a g", "", "Stunden", "Ort", "Projekt", "Tätigkeit", "PLZ", "", "☔ Wetter h"],
        ["", "Beginn", "Ende", "von - bis", "Beginn", "Ende", "Gesamt", "", "", "", "", "", ""]
      );
    }

    worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]);

    // Vormonat letzter Tag hinzufügen (leere Zeile)
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    worksheetData.push([prevMonthLastDay, "", "", "", "", "", "", "", "", "", "", ""]);

    // Alle Tage des Monats (1-31) durchgehen
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(year, month - 1, day);
      // Finde alle Einträge für diesen Tag
      const dayEntries = timeEntries.filter((e) => isSameDay(parseISO(e.datum), dayDate));
      

      if (dayEntries.length === 0) {
        worksheetData.push([day, "", "", "", "", "", "", "", "", "", "", ""]);
      } else {
        // Alle Einträge des Tages hinzufügen
        dayEntries.forEach((entry, entryIndex) => {
          const lunchBreak = calculateLunchBreak(entry);
          const project = projects[entry.project_id];
          
          // Ort-Spalte: Baustelle oder Werkstatt
          const ortText = entry.location_type === "baustelle" ? "Baustelle" : "Werkstatt";
          
          // Projekt-Spalte: Urlaub/Krankenstand/Weiterbildung, Störung oder Projektname
          const isAbsence = ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag"].includes(entry.taetigkeit);
          const isDisturbance = entry.disturbance_id != null || entry.taetigkeit?.startsWith("Störungseinsatz");
          
          let projektName = "";
          if (isAbsence) {
            projektName = entry.taetigkeit;
          } else if (isDisturbance) {
            projektName = "Störung";
          } else {
            projektName = project?.name || "";
          }
          
          // PLZ: nur bei Baustellen (nicht bei Abwesenheit/Werkstatt/Störung)
          const plz = (isAbsence || isDisturbance)
            ? ""
            : entry.location_type === "baustelle" ? (project?.plz || "") : "";

          // Datum nur beim ersten Eintrag des Tages anzeigen
          const displayDay = entryIndex === 0 ? day : "";

          if (includeOvertime) {
            // Export MIT Überstunden: Tatsächliche Zeiten verwenden
            const actualMorningEnd = lunchBreak?.start || "";
            const actualAfternoonStart = lunchBreak?.end || "";
            const actualPauseText = entry.pause_minutes && entry.pause_minutes > 0 && lunchBreak
              ? `${lunchBreak.start} - ${lunchBreak.end}`
              : "";
            // Saldo PRO TAG (positiv oder negativ) — nur in der ersten
            // Eintragszeile anzeigen, sonst leer (sonst doppelt gezählt).
            const dayBal = getDayBal(entry.datum);
            const overtimeText = (entryIndex === 0 && dayBal && Math.abs(dayBal.saldo) >= 0.005)
              ? formatSaldo(dayBal.saldo)
              : "";

            worksheetData.push([
              displayDay,
              entry.start_time?.substring(0, 5) || "",
              actualMorningEnd,
              actualPauseText,
              actualAfternoonStart,
              entry.end_time?.substring(0, 5) || "",
              entry.stunden.toFixed(2),
              overtimeText,
              ortText,
              projektName,
              entry.taetigkeit,
              plz,
              entry.wetterschicht_stunden && entry.wetterschicht_stunden > 0 ? entry.wetterschicht_stunden.toFixed(2) : "",
            ]);
          } else {
            // Export OHNE Überstunden: Regelarbeitszeiten aus Lib
            const regelarbeitszeit = getNormalWorkingHours(dayDate);

            // Regelarbeitszeiten für Zeiten — Mo-Do 07:00-17:30 Pause 12:00-12:30
            const regelStart = regelarbeitszeit > 0 ? "07:00" : "";
            const regelMorningEnd = regelarbeitszeit > 0 ? "12:00" : "";
            const regelPause = regelarbeitszeit > 0 ? "12:00 - 12:30" : "";
            const regelAfternoonStart = regelarbeitszeit > 0 ? "12:30" : "";
            const regelEnd = regelarbeitszeit > 0 ? "17:30" : "";
            
            worksheetData.push([
              displayDay,
              regelStart,
              regelMorningEnd,
              regelPause,
              regelAfternoonStart,
              regelEnd,
              regelarbeitszeit.toFixed(2),
              ortText,
              projektName,
              entry.taetigkeit,
              plz,
              "",
              entry.wetterschicht_stunden && entry.wetterschicht_stunden > 0 ? entry.wetterschicht_stunden.toFixed(2) : "",
            ]);
          }
        });

        // Tagessumme wenn mehrere Einträge am Tag — Saldo aus dem
        // Helper, NICHT mehr per-Entry summieren.
        if (dayEntries.length > 1) {
          const datumStr = dayDate.toISOString().slice(0, 10);
          const dayBal = getDayBal(datumStr);
          const dayTotalHours = dayBal?.ist ?? dayEntries.reduce((sum, e) => sum + e.stunden, 0);
          if (includeOvertime) {
            const saldoText = (dayBal && Math.abs(dayBal.saldo) >= 0.005) ? formatSaldo(dayBal.saldo) : "";
            worksheetData.push(["", "", "", "", "", "Tagessumme:", dayTotalHours.toFixed(2), saldoText, "", "", "", ""]);
          } else {
            const regelarbeitszeitTag = getNormalWorkingHours(dayDate);
            // Tagessoll erscheint genau EINMAL pro Tag (vorher ×Anzahl-Einträge — Bug).
            worksheetData.push(["", "", "", "", "", "Tagessumme:", regelarbeitszeitTag.toFixed(2), "", "", "", "", ""]);
          }
        }
      }
    }

    // Regelarbeitszeit-Summe für Export ohne Überstunden — pro Tag,
    // NICHT pro Entry. Summe aller Tagessoll der Tage mit Buchungen.
    const calculateRegelarbeitszeitSumme = () => {
      let summe = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(year, month - 1, day);
        const hasEntries = timeEntries.some((e) => isSameDay(parseISO(e.datum), dayDate));
        if (hasEntries) summe += getNormalWorkingHours(dayDate);
      }
      return summe;
    };

    // Summenzeile — Saldo statt Math.max(0,…), Vorzeichen sichtbar.
    if (includeOvertime) {
      worksheetData.push(["", "", "", "", "", "SUMME", totalHours.toFixed(2), formatSaldo(totalSaldo), "", "", "", "", timeEntries.reduce((s, e) => s + (e.wetterschicht_stunden || 0), 0).toFixed(2)]);
    } else {
      const regelarbeitszeitSumme = calculateRegelarbeitszeitSumme();
      worksheetData.push(["", "", "", "", "", "SUMME", regelarbeitszeitSumme.toFixed(2), "", "", "", "", ""]);
    }
    
    // Footer-Zeilen
    worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
    worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
    worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
    if (includeOvertime) {
      worksheetData.push(["", "Hiermit bestätige ich die Richtigkeit der von mir angegebenen Überstunden.", "", "", "", "", "", "", "", "", "", ""]);
      worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
      worksheetData.push(["", `Derzeitiger offener Überstundenstand: ${formatSaldo(totalSaldo)}`, "", "", "", "", "", "", "", "", "", ""]);
      worksheetData.push(["", "Restliche Überstunden wurden zur Gänze abgegolten.", "", "", "", "", "", "", "", "", "", ""]);
    } else {
      worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer statt Überstunden-Text
      worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
      worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
      worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
    }
    worksheetData.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // Leer
    worksheetData.push(["", "Datum:", "", "", "", "Unterschrift:", "", "", "", "", "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Spaltenbreiten für 12 Spalten
    ws["!cols"] = [
      { wch: 12 },  // A: Datum
      { wch: 24 },  // B: breiter für Footer-Text
      { wch: 24 },  // C
      { wch: 26 },  // D
      { wch: 12 },  // E
      { wch: 12 },  // F
      { wch: 10 },  // G: Stunden
      { wch: 12 },  // H: Überstunden oder Ort
      { wch: 12 },  // I: Ort oder Projekt
      { wch: 22 },  // J: Projekt
      { wch: 20 },  // K: Tätigkeit
      { wch: 6 },   // L: PLZ
    ];

    // Merged Cells
    const sumRowIndex = worksheetData.length - 9; // Footer hat immer 9 Zeilen
    ws["!merges"] = [
      // Firmendaten Header
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },
      // Mitarbeiter und Monat
      { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } },
      { s: { r: 5, c: 2 }, e: { r: 5, c: 7 } },
      { s: { r: 5, c: 9 }, e: { r: 5, c: 11 } },
      { s: { r: 7, c: 1 }, e: { r: 7, c: 2 } },
      { s: { r: 7, c: 4 }, e: { r: 7, c: 5 } },
      // Footer Merges - immer aktiv
      { s: { r: sumRowIndex + 4, c: 1 }, e: { r: sumRowIndex + 4, c: 10 } },
      { s: { r: sumRowIndex + 6, c: 1 }, e: { r: sumRowIndex + 6, c: 10 } },
      { s: { r: sumRowIndex + 7, c: 1 }, e: { r: sumRowIndex + 7, c: 10 } }
    ];

    // Zeilenhöhe für Header
    ws["!rows"] = ws["!rows"] || [];
    [0, 1, 2, 3].forEach((r) => {
      ws["!rows"][r] = { hpt: 18 };
    });
    
    // Footer-Texte: erhöhte Zeilenhöhe für Lesbarkeit - immer aktiv
    ws["!rows"][sumRowIndex + 4] = { hpt: 30 }; // "Hiermit bestätige ich..."
    ws["!rows"][sumRowIndex + 6] = { hpt: 25 }; // "Derzeitiger offener Überstundenstand..."

    // Formatierung anwenden
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { t: "s", v: "" };
        }
        
        const isFirmenHeader = R >= 0 && R <= 3;
        const isHeaderRow = R === 7 || R === 8;
        const footerBaseRow = worksheetData.length - 9; // Footer hat immer 9 Zeilen
        const isSumRow = R === footerBaseRow;
        const isFooterRow = R >= footerBaseRow + 1;
        
        const borderStyle = isHeaderRow ? "medium" : "thin";
        
        if (isFirmenHeader || isFooterRow) {
          ws[cellAddress].s = {
            alignment: { 
              vertical: "center", 
              horizontal: "left",
              wrapText: true
            },
            font: { bold: R === 0, size: R === 0 ? 14 : 11 },
          };
        } else {
          ws[cellAddress].s = {
            border: {
              top: { style: borderStyle, color: { rgb: "000000" } },
              bottom: { style: borderStyle, color: { rgb: "000000" } },
              left: { style: borderStyle, color: { rgb: "000000" } },
              right: { style: borderStyle, color: { rgb: "000000" } },
            },
            alignment: { 
              vertical: "center", 
              horizontal: isHeaderRow ? "center" : "left",
              wrapText: false
            },
          };
          
          if (isHeaderRow || isSumRow) {
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              font: { bold: true },
            };
          }
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Arbeitszeit");
    const suffix = includeOvertime ? "_mit_Ueberstunden" : "_ohne_Ueberstunden";
    XLSX.writeFile(wb, `Arbeitszeiterfassung_${employeeName}_${monthNamesShort[month - 1]}_${year}${suffix}.xlsx`);

    toast({ title: "Excel exportiert", description: `Datei wurde heruntergeladen` });
  };

  return (
    <div className="kb-page min-h-screen">
      {/* Kopfleiste wie in allen anderen Masken — vorher war /hours-report
          ohne Toolbar eine Sackgasse (kein Weg zurück zum Start). */}
      <KBToolbar onBack={() => navigate("/")} title="Stundenauswertung" />

      <div className="container mx-auto p-4 space-y-6">
      <Tabs defaultValue="mitarbeiter" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
          <TabsTrigger value="mitarbeiter">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            <span className="truncate">Arbeitszeit</span>
          </TabsTrigger>
          <TabsTrigger value="projekte">
            <Building2 className="w-4 h-4 mr-2" />
            <span className="truncate">Projekte</span>
          </TabsTrigger>
          <TabsTrigger value="kostenstellen">
            <Hammer className="w-4 h-4 mr-2" />
            <span className="truncate">Kostenstellen</span>
          </TabsTrigger>
          <TabsTrigger value="fahrzeuge">
            <Truck className="w-4 h-4 mr-2" />
            <span className="truncate">Fahrzeuge</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mitarbeiter" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
                    Arbeitszeiterfassung nach Mitarbeitern
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Monatsberichte mit Überstunden exportieren</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={!selectedUserId}
                      onClick={() => setAbsenceDialogOpen(true)}
                    >
                      <CalendarOff className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Abwesenheit nachtragen</span>
                      <span className="sm:hidden">Abwesenheit</span>
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button disabled={!selectedUserId} className="h-11">
                        <Download className="mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Excel exportieren</span>
                        <span className="sm:hidden">Export</span>
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportToExcel(true)}>
                        Mit Überstunden
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportToExcel(false)}>
                        Ohne Überstunden
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              
              <div className="flex flex-col sm:flex-row gap-3">
                {isAdmin && (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Mitarbeiter auswählen" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.entries(profiles).map(([id, profile]) => (
                        <SelectItem key={id} value={id}>
                          {profile.vorname} {profile.nachname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {monthNames.map((name, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {years.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUserId && (
                <>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Gesamtstunden</p>
                        <p className="text-2xl font-bold">{totalHours.toFixed(2)} h</p>
                        <p className="text-[10px] text-muted-foreground">Soll: {totalSoll.toFixed(2)} h</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Saldo Monat</p>
                        <p className={`text-2xl font-bold ${totalSaldo > 0.005 ? "text-green-600" : totalSaldo < -0.005 ? "text-red-600" : ""}`}>
                          {formatSaldo(totalSaldo)} h
                        </p>
                        <p className="text-[10px] text-muted-foreground">+ Überstunden / − Minusstunden</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Stundenkonto effektiv</p>
                        <p className={`text-2xl font-bold ${(autoBalanceAll + manualBalance) > 0.005 ? "text-green-600" : (autoBalanceAll + manualBalance) < -0.005 ? "text-red-600" : ""}`}>
                          {formatSaldo(autoBalanceAll + manualBalance)} h
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Auto {formatSaldo(autoBalanceAll)} h
                          {Math.abs(manualBalance) >= 0.005 ? ` · Manuell ${formatSaldo(manualBalance)} h` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <span aria-hidden>☔</span> Wetterschicht
                        </p>
                        <p className="text-2xl font-bold">
                          {timeEntries.reduce((s, e) => s + (e.wetterschicht_stunden || 0), 0).toFixed(2)} h
                        </p>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="h-[500px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Datum</TableHead>
                          <TableHead>Von</TableHead>
                          <TableHead>Bis</TableHead>
                          <TableHead>Pause</TableHead>
                          <TableHead className="text-right">Stunden</TableHead>
                          <TableHead className="text-right">Überstunden</TableHead>
                          <TableHead className="text-right" title="Wetterschicht (Regenstunden)">☔ h</TableHead>
                          <TableHead>Ort</TableHead>
                          <TableHead>Projekt</TableHead>
                          <TableHead>Tätigkeit</TableHead>
                          <TableHead>KFZ / km</TableHead>
                          {isAdmin && <TableHead className="w-10"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center">
                              Lade...
                            </TableCell>
                          </TableRow>
                        ) : monthDays.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center">
                              Keine Daten verfügbar
                            </TableCell>
                          </TableRow>
                        ) : (
                          monthDays.map((day) => {
                            // Finde alle Einträge für diesen Tag
                            const dayEntries = timeEntries.filter((e) => isSameDay(parseISO(e.datum), day.date));
                            const dayTotalHours = dayEntries.reduce((sum, e) => sum + e.stunden, 0);
                            const hasMultipleEntries = dayEntries.length > 1;

                            if (dayEntries.length === 0) {
                              return (
                                <TableRow
                                  key={day.dayNumber}
                                  className={cn(day.isWeekend && "bg-muted/30", "text-muted-foreground")}
                                >
                                  <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                      <span>{day.dayNumber}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {format(day.date, "EEE", { locale: de })}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell colSpan={isAdmin ? 10 : 10}></TableCell>
                                  {isAdmin && (
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="Eintrag für diesen Tag nachtragen"
                                        onClick={() => openAdminCreate(format(day.date, "yyyy-MM-dd"))}
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            }

                            return dayEntries.map((entry, entryIndex) => {
                              const lunchBreak = calculateLunchBreak(entry);
                              // Tagessaldo aus Helper — pro-Tag, nur in 1. Zeile anzeigen.
                              const dayBal = getDayBal(entry.datum);
                              const project = projects[entry.project_id];
                              const ortIcon = entry.location_type === "baustelle" ? "🏗️" : entry.location_type === "werkstatt" ? "🏢" : "";
                              const ortText = entry.location_type === "baustelle" ? "Baustelle" : entry.location_type === "werkstatt" ? "Firma" : "";
                              const projektName = entry.taetigkeit === "Urlaub" || entry.taetigkeit === "Krankenstand"
                                ? entry.taetigkeit
                                : (project?.name || "");
                              const isFirstEntry = entryIndex === 0;
                              const isLastEntry = entryIndex === dayEntries.length - 1;

                              return (
                                <TableRow
                                  key={entry.id}
                                  className={cn(
                                    day.isWeekend && "bg-muted/30",
                                    hasMultipleEntries && !isLastEntry && "border-b-0"
                                  )}
                                >
                                  <TableCell className="font-medium">
                                    {isFirstEntry && (
                                      <div className="flex flex-col">
                                        <span>{day.dayNumber}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {format(day.date, "EEE", { locale: de })}
                                        </span>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>{entry.start_time?.substring(0, 5) || '-'}</TableCell>
                                  <TableCell>{entry.end_time?.substring(0, 5) || '-'}</TableCell>
                                  <TableCell>{entry.pause_minutes > 0 ? `${entry.pause_minutes} Min` : '-'}</TableCell>
                                  <TableCell className="text-right font-medium">
                                    {entry.stunden.toFixed(2)} h
                                    {hasMultipleEntries && isLastEntry && (
                                      <div className="text-xs text-primary font-bold mt-1">
                                        Σ {dayTotalHours.toFixed(2)} h
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {isFirstEntry && dayBal && Math.abs(dayBal.saldo) >= 0.005 && (
                                      <span className={cn(
                                        "font-medium",
                                        dayBal.saldo > 0 ? "text-orange-600" : "text-red-600"
                                      )}>
                                        {formatSaldo(dayBal.saldo)} h
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-xs">
                                    {entry.wetterschicht_stunden && entry.wetterschicht_stunden > 0 ? (
                                      <span className="text-blue-600 font-medium">
                                        {entry.wetterschicht_stunden.toFixed(2)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <span className="flex items-center gap-1">
                                      <span>{ortIcon}</span>
                                      <span className="text-xs">{ortText}</span>
                                    </span>
                                  </TableCell>
                                  <TableCell className="max-w-[150px] truncate">
                                    {projektName}
                                  </TableCell>
                                  <TableCell className="max-w-[200px]">
                                    <div className="flex items-start gap-1.5 flex-wrap">
                                      <span className="truncate">{entry.taetigkeit}</span>
                                      {entry.nachgetragen_von && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1 py-0 h-4 gap-0.5 border-amber-400 text-amber-700 bg-amber-50"
                                          title={`Nachgetragen am ${entry.nachgetragen_am ? format(parseISO(entry.nachgetragen_am), "dd.MM.yyyy") : "—"}`}
                                        >
                                          <UserCog className="h-2.5 w-2.5" />
                                          Admin
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {((entry as any).time_entry_vehicles || []).length === 0 ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : (
                                      <div className="space-y-0.5">
                                        {((entry as any).time_entry_vehicles || []).map((tev: any, i: number) => {
                                          const name = tev.vehicles?.bezeichnung || "?";
                                          const km = tev.modus === "gefahren"
                                            ? (tev.km_gefahren != null ? `${tev.km_gefahren} km` : "")
                                            : (tev.km_start != null && tev.km_ende != null
                                                ? `${tev.km_ende - tev.km_start} km (${tev.km_start}→${tev.km_ende})`
                                                : "");
                                          return (
                                            <div key={i}>
                                              <span className="font-medium">{name}</span>
                                              {km && <span className="text-muted-foreground"> · {km}</span>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </TableCell>
                                  {isAdmin && (
                                    <TableCell>
                                      <div className="flex gap-0.5">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          title="Eintrag bearbeiten (voller Editor)"
                                          onClick={() => openAdminEdit(entry)}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        {isLastEntry && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            title="Weiteren Eintrag für diesen Tag nachtragen"
                                            onClick={() => openAdminCreate(format(day.date, "yyyy-MM-dd"))}
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            });
                          })
                        )}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={4} className="text-right font-bold">
                            Gesamt:
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {totalHours.toFixed(2)} h
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-bold",
                            totalSaldo > 0.005 ? "text-orange-600" : totalSaldo < -0.005 ? "text-red-600" : ""
                          )}>
                            {formatSaldo(totalSaldo)} h
                          </TableCell>
                          <TableCell className="text-right font-bold text-blue-600">
                            {timeEntries.reduce((s, e) => s + (e.wetterschicht_stunden || 0), 0).toFixed(2)}
                          </TableCell>
                          <TableCell colSpan={isAdmin ? 4 : 3}></TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projekte">
          <ProjectHoursReport />
        </TabsContent>

        {/* ---------------- Kostenstellen ---------------- */}
        <TabsContent value="kostenstellen" className="space-y-4">
          <Card className="kb-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Hammer className="w-5 h-5" />
                Kostenstellen
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Stunden je Kostenstelle im gewählten Zeitraum — zum Aufklappen je Mitarbeiter antippen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {renderPeriodPicker()}
                <Select value={ksFilter} onValueChange={setKsFilter}>
                  <SelectTrigger className="h-11 kb-input">
                    <SelectValue placeholder="Alle Kostenstellen" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="alle">Alle Kostenstellen</SelectItem>
                    {ksOptions.map((o) => (
                      <SelectItem key={o.wert} value={o.wert}>Nur {o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Gesamtstunden {ksFilter !== "alle" ? `(${ksLabel(ksFilter)})` : ""}
                  </p>
                  <p className="text-2xl font-bold">{kostenstellenGesamt.toFixed(2)} h</p>
                </div>
                <Badge variant="secondary">
                  {monthNames[month - 1]} {year}
                </Badge>
              </div>

              {/* Kein min-w: bei 390px wurde sonst die Stunden-Spalte
                  abgeschnitten. „Anteil" entfällt am Handy. */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Kostenstelle</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Stunden</TableHead>
                      <TableHead className="hidden sm:table-cell text-right w-[80px]">Anteil</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ksLoading ? (
                      <TableRow><TableCell colSpan={4} className="text-center">Lade...</TableCell></TableRow>
                    ) : kostenstellenAggregat.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Keine Buchungen im Zeitraum</TableCell></TableRow>
                    ) : (
                      kostenstellenAggregat.map((e) => {
                        const open = expandedKs.has(e.kostenstelle);
                        const anteil = kostenstellenGesamt > 0 ? (e.stunden / kostenstellenGesamt) * 100 : 0;
                        return (
                          <Fragment key={e.kostenstelle}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleKs(e.kostenstelle)}
                            >
                              <TableCell className="h-12">
                                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="font-medium">
                                {ksLabel(e.kostenstelle)}
                                <span className="sm:hidden block text-xs font-normal text-muted-foreground">
                                  {anteil.toFixed(0)} % Anteil
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-bold whitespace-nowrap">{e.stunden.toFixed(2)} h</TableCell>
                              <TableCell className="hidden sm:table-cell text-right text-muted-foreground text-xs">{anteil.toFixed(0)} %</TableCell>
                            </TableRow>
                            {open && e.perUser.map((u) => (
                              <TableRow key={`${e.kostenstelle}-${u.user_id}`} className="bg-muted/30">
                                <TableCell></TableCell>
                                <TableCell className="pl-6 text-sm">{employeeName(u.user_id)}</TableCell>
                                <TableCell className="text-right text-sm whitespace-nowrap">{u.stunden.toFixed(2)} h</TableCell>
                                <TableCell className="hidden sm:table-cell"></TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold text-right">Gesamt:</TableCell>
                      <TableCell className="text-right font-bold whitespace-nowrap">{kostenstellenGesamt.toFixed(2)} h</TableCell>
                      <TableCell className="hidden sm:table-cell"></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Fahrzeuge ---------------- */}
        <TabsContent value="fahrzeuge" className="space-y-4">
          <Card className="kb-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Truck className="w-5 h-5" />
                Fahrzeuge
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Fahrzeugstunden, gefahrene Kilometer und Kosten im gewählten Zeitraum
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderPeriodPicker()}

              <div className="bg-muted/50 p-4 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Fahrzeugstunden</p>
                  <p className="text-2xl font-bold">
                    {vehicleStats.reduce((s, v) => s + v.stunden, 0).toFixed(2)} h
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gefahrene km</p>
                  <p className="text-2xl font-bold">
                    {vehicleStats.reduce((s, v) => s + v.km, 0).toLocaleString("de-AT")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Kosten</p>
                  <p className="text-2xl font-bold">
                    {formatEuro(vehicleStats.reduce((s, v) => s + v.kostenGesamt, 0))}
                  </p>
                </div>
              </div>

              {/* Mobil: Karten statt 8-Spalten-Tabelle — am Handy waren die
                  Kostenspalten sonst nur per Seitwärts-Scrollen erreichbar. */}
              <div className="space-y-2 md:hidden">
                {vehicleLoading ? (
                  <p className="text-center text-muted-foreground py-6">Lade...</p>
                ) : vehicleStats.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">Keine Fahrzeuge vorhanden</p>
                ) : (
                  vehicleStats.map((v) => (
                    <div key={v.vehicleId} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{v.bezeichnung}</p>
                          {v.kennzeichen && <p className="text-xs text-muted-foreground">{v.kennzeichen}</p>}
                        </div>
                        <p className="shrink-0 font-bold whitespace-nowrap">{formatEuro(v.kostenGesamt)}</p>
                      </div>
                      <div className="mt-2 flex gap-4 text-sm">
                        <span className="text-muted-foreground">Std.: <b className="text-foreground">{v.stunden.toFixed(2)} h</b></span>
                        <span className="text-muted-foreground">km: <b className="text-foreground">{v.km.toLocaleString("de-AT")}</b></span>
                      </div>
                      {v.kostenGesamt > 0 && (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {KOSTEN_KATEGORIEN.filter((k) => v.kostenNachKategorie[k.wert]).map((k) => (
                            <span key={k.wert}>{k.label}: {formatEuro(v.kostenNachKategorie[k.wert])}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fahrzeug</TableHead>
                      <TableHead className="text-right">Stunden</TableHead>
                      <TableHead className="text-right">km</TableHead>
                      {KOSTEN_KATEGORIEN.map((k) => (
                        <TableHead key={k.wert} className="text-right">{k.label}</TableHead>
                      ))}
                      <TableHead className="text-right">Kosten gesamt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center">Lade...</TableCell></TableRow>
                    ) : vehicleStats.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Keine Fahrzeuge vorhanden</TableCell></TableRow>
                    ) : (
                      vehicleStats.map((v) => (
                        <TableRow key={v.vehicleId}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{v.bezeichnung}</span>
                              {v.kennzeichen && (
                                <span className="text-xs text-muted-foreground">{v.kennzeichen}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{v.stunden.toFixed(2)} h</TableCell>
                          <TableCell className="text-right">{v.km.toLocaleString("de-AT")}</TableCell>
                          {KOSTEN_KATEGORIEN.map((k) => (
                            <TableCell key={k.wert} className="text-right text-xs">
                              {v.kostenNachKategorie[k.wert]
                                ? formatEuro(v.kostenNachKategorie[k.wert])
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold">{formatEuro(v.kostenGesamt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">Gesamt</TableCell>
                      <TableCell className="text-right font-bold">
                        {vehicleStats.reduce((s, v) => s + v.stunden, 0).toFixed(2)} h
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {vehicleStats.reduce((s, v) => s + v.km, 0).toLocaleString("de-AT")}
                      </TableCell>
                      {KOSTEN_KATEGORIEN.map((k) => (
                        <TableCell key={k.wert} className="text-right text-xs font-bold">
                          {formatEuro(vehicleStats.reduce((s, v) => s + (v.kostenNachKategorie[k.wert] || 0), 0))}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold">
                        {formatEuro(vehicleStats.reduce((s, v) => s + v.kostenGesamt, 0))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Fahrzeugstunden ohne eigenen Wert (Altbestand) werden mit den Stunden des
                zugehörigen Zeiteintrags gerechnet.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Admin Edit Dialog */}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Zeiteintrag bearbeiten</DialogTitle>
          </DialogHeader>
          {editEntry && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {format(parseISO(editEntry.datum), "EEEE, d. MMMM yyyy", { locale: de })}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Von</Label>
                  <Input type="time" value={editForm.start_time} onChange={(e) => setEditForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <Label>Bis</Label>
                  <Input type="time" value={editForm.end_time} onChange={(e) => setEditForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Pause (Min.)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editForm.pause_minutes}
                    onChange={(e) => setEditForm(f => ({ ...f, pause_minutes: e.target.value }))}
                    onBlur={() => setEditForm(f => ({ ...f, pause_minutes: String(clamp(Math.round(toNumber(f.pause_minutes, 0)), 0, 720)) }))}
                  />
                </div>
                <div>
                  <Label>Stunden (berechnet)</Label>
                  <p className="text-lg font-bold mt-1">{recalcHours(editForm.start_time, editForm.end_time, clamp(Math.round(toNumber(editForm.pause_minutes, 0)), 0, 720)).toFixed(2)} h</p>
                </div>
              </div>
              <div>
                <Label>Ort</Label>
                <Select value={editForm.location_type} onValueChange={(v) => setEditForm(f => ({ ...f, location_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baustelle">Baustelle</SelectItem>
                    <SelectItem value="werkstatt">Firma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Projekt</Label>
                <Select value={editForm.project_id || "none"} onValueChange={(v) => setEditForm(f => ({ ...f, project_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Projekt</SelectItem>
                    {Object.values(projects).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tätigkeit</Label>
                <Input value={editForm.taetigkeit} onChange={(e) => setEditForm(f => ({ ...f, taetigkeit: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button variant="destructive" size="sm" className="gap-1" onClick={handleEditDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Löschen
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditEntry(null)}>Abbrechen</Button>
              <Button onClick={handleEditSave} disabled={editSaving} className="gap-1">
                <Save className="h-3.5 w-3.5" />
                {editSaving ? "Speichert..." : "Speichern"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voller Admin-Editor für Zeit-Einträge (bearbeiten + nachtragen) */}
      {isAdmin && selectedUserId && (
        <AdminTimeEntryDialog
          open={adminDialog.open}
          onClose={closeAdminDialog}
          onSaved={fetchTimeEntries}
          userId={selectedUserId}
          datum={adminDialog.datum}
          entryId={adminDialog.entryId}
          employeeLabel={
            profiles[selectedUserId]
              ? `${profiles[selectedUserId].vorname} ${profiles[selectedUserId].nachname}`
              : undefined
          }
        />
      )}

      {/* Abwesenheits-Nachtrag (Urlaub / Krank / ZA / Feiertag / Weiterbildung
          über Datumsbereich, schreibt time_entries + leave_request) */}
      {isAdmin && (
        <AdminAbsenceDialog
          open={absenceDialogOpen}
          onOpenChange={setAbsenceDialogOpen}
          defaultUserId={selectedUserId}
          profiles={profiles}
          onSaved={fetchTimeEntries}
        />
      )}
      </div>
    </div>
  );
}
