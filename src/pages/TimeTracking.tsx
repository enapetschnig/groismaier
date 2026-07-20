import { useState, useEffect, useRef } from "react";
import { Clock, Plus, AlertTriangle, CheckCircle2, Calendar, Sun, Trash2, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MultiEmployeeSelect } from "@/components/MultiEmployeeSelect";
import { PageHeader } from "@/components/PageHeader";
import { format, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { 
  getNormalWorkingHours, 
  getDefaultWorkTimes, 
  isNonWorkingDay,
  getWeeklyTargetHours,
  getTotalWorkingHours
} from "@/lib/workingHours";

type Project = {
  id: string;
  name: string;
  status: string;
  plz: string;
};

type ExistingEntry = {
  id: string;
  start_time: string;
  end_time: string;
  stunden: number;
  taetigkeit: string;
  project_name: string | null;
  plz: string | null;
  pause_start: string | null;
};

interface KfzEntry {
  key: string;              // lokale UI-Kennung
  vehicleId: string;
  modus: "gefahren" | "start_ende";
  kmGefahren: string;
  kmStart: string;
  kmEnde: string;
  stunden: string;          // Fahrzeugstunden (leer = Stunden des Zeitblocks)
  stundenTouched: boolean;  // true, sobald manuell verändert
}

/** Kostenstelle aus admin_config_options (kategorie='kostenstelle'). */
interface KostenstelleOption {
  wert: string;
  label: string;
}

/** Fallback, falls admin_config_options nicht geladen werden kann. */
const KOSTENSTELLEN_FALLBACK: KostenstelleOption[] = [
  { wert: "baustelle", label: "Baustelle" },
  { wert: "werkstatt", label: "Werkstatt" },
  { wert: "lagerwerkstatt", label: "Lagerwerkstatt" },
  { wert: "lagerplatz", label: "Lagerplatz" },
];

const KOSTENSTELLEN_ICONS: Record<string, string> = {
  baustelle: "🏗️",
  werkstatt: "🏢",
  lagerwerkstatt: "🧰",
  lagerplatz: "📦",
};

interface TimeBlock {
  id: string;
  locationType: "baustelle" | "werkstatt" | "regie";
  /** Kostenstelle der Buchung — Pflichtfeld, wird in time_entries.kostenstelle gespeichert. */
  kostenstelle: string;
  projectId: string;
  taetigkeit: string;
  startTime: string;
  endTime: string;
  pauseStart: string;
  pauseEnd: string;
  pauseDuration: number; // 0, 30, 45, 60 minutes
  selectedEmployees: string[];
  manualHours: string;
  disturbanceId: string;
  selectedDisturbanceIds: string[];
  wetterschichtStunden: string; // Regenstunden, nur Info — leer wenn nicht relevant
  kfzOpen: boolean;         // KFZ-Block aufgeklappt?
  kfzEntries: KfzEntry[];   // mehrere Fahrzeuge pro Zeiteintrag
}

type Disturbance = {
  id: string;
  datum: string;
  kunde_name: string;
  status: string;
};

const createDefaultBlock = (startTime = "", endTime = "", pauseStart = "", pauseEnd = ""): TimeBlock => ({
  id: crypto.randomUUID(),
  locationType: "baustelle",
  kostenstelle: "baustelle",
  projectId: "",
  taetigkeit: "",
  startTime,
  endTime,
  pauseStart,
  pauseEnd,
  pauseDuration: 0, // Keine Pause vorausgewählt
  selectedEmployees: [],
  manualHours: "",
  disturbanceId: "",
  selectedDisturbanceIds: [],
  wetterschichtStunden: "",
  kfzOpen: false,
  kfzEntries: [],
});

const createEmptyKfzEntry = (vehicleId = ""): KfzEntry => ({
  key: crypto.randomUUID(),
  vehicleId,
  modus: "gefahren",
  kmGefahren: "",
  kmStart: "",
  kmEnde: "",
  stunden: "",
  stundenTouched: false,
});

const TimeTracking = () => {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; bezeichnung: string; kennzeichen: string | null }[]>([]);
  const [taetigkeitOptions, setTaetigkeitOptions] = useState<string[]>([]);
  const [kostenstellen, setKostenstellen] = useState<KostenstelleOption[]>(KOSTENSTELLEN_FALLBACK);
  // Standard-Fahrzeug des eingeloggten Mitarbeiters (employees.standard_vehicle_id).
  // Zusätzlich als Ref, damit Block-Erzeugung ohne Stale-Closure funktioniert.
  const [standardVehicleId, setStandardVehicleId] = useState<string>("");
  const standardVehicleIdRef = useRef<string>("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPlz, setNewProjectPlz] = useState("");
  const [newProjectAddress, setNewProjectAddress] = useState("");
  const [pendingBlockIdForNewProject, setPendingBlockIdForNewProject] = useState<string | null>(null);

  const [existingDayEntries, setExistingDayEntries] = useState<ExistingEntry[]>([]);
  const [loadingDayEntries, setLoadingDayEntries] = useState(false);
  
  const [showAbsenceDialog, setShowAbsenceDialog] = useState(false);
  
  const [absenceData, setAbsenceData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: "urlaub" as "urlaub" | "krankenstand" | "weiterbildung" | "feiertag" | "za",
    document: null as File | null,
    customHours: "" as string,
    isFullDay: true,
    absenceStartTime: "07:00",
    absenceEndTime: "16:00",
    absencePauseMinutes: "30",
  });
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([createDefaultBlock()]);
  const [disturbances, setDisturbances] = useState<Disturbance[]>([]);
  const entryMode = "zeitraum" as const;

  // Neuer Zeitblock inkl. Vorschlag des Standard-Fahrzeugs (entfernbar).
  const buildBlock = (startTime = "", endTime = "", pauseStart = "", pauseEnd = ""): TimeBlock => {
    const block = createDefaultBlock(startTime, endTime, pauseStart, pauseEnd);
    const vid = standardVehicleIdRef.current;
    if (vid) {
      block.kfzOpen = true;
      block.kfzEntries = [createEmptyKfzEntry(vid)];
    }
    return block;
  };

  // Fetch existing entries for selected date
  const fetchExistingDayEntries = async (date: string) => {
    setLoadingDayEntries(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoadingDayEntries(false);
      return;
    }

    const { data, error } = await supabase
      .from("time_entries")
      .select(`
        id,
        start_time,
        end_time,
        stunden,
        taetigkeit,
        pause_start,
        projects (name, plz)
      `)
      .eq("user_id", user.id)
      .eq("datum", date)
      .order("start_time");

    if (!error && data) {
      const entries: ExistingEntry[] = data.map((entry: any) => ({
        id: entry.id,
        start_time: entry.start_time,
        end_time: entry.end_time,
        stunden: entry.stunden,
        taetigkeit: entry.taetigkeit,
        project_name: entry.projects?.name || null,
        plz: entry.projects?.plz || null,
        pause_start: entry.pause_start || null,
      }));
      setExistingDayEntries(entries);
      
      // If entries exist, suggest next time slot for first block
      if (entries.length > 0 && !entries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit))) {
        const lastEntry = entries[entries.length - 1];
        const [lastEndHours, lastEndMinutes] = lastEntry.end_time.split(':').map(Number);
        const nextStartMinutes = lastEndHours * 60 + lastEndMinutes + 30;
        const suggestedStart = `${String(Math.floor(nextStartMinutes / 60)).padStart(2, '0')}:${String(nextStartMinutes % 60).padStart(2, '0')}`;
        
        setTimeBlocks([buildBlock(suggestedStart)]);
      } else if (!entries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit))) {
        // Auto-fill default work times for the selected date
        const dateObj = new Date(date);
        const defaults = getDefaultWorkTimes(dateObj);
        if (defaults) {
          setTimeBlocks([buildBlock(defaults.startTime, defaults.endTime, defaults.pauseStart, defaults.pauseEnd)]);
        } else {
          setTimeBlocks([buildBlock()]);
        }
      }
    } else {
      setExistingDayEntries([]);
      // Reset to empty default for new day
      setTimeBlocks([buildBlock()]);
    }
    setLoadingDayEntries(false);
  };

  // Load existing entries when date changes
  useEffect(() => {
    fetchExistingDayEntries(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    fetchProjects();
    fetchDisturbances();

    // Fahrzeuge + Tätigkeitsliste + Kostenstellen einmalig laden
    (async () => {
      const [{ data: vehData }, { data: taetData }, { data: ksData }] = await Promise.all([
        (supabase.from("vehicles" as never) as any)
          .select("id, bezeichnung, kennzeichen")
          .eq("aktiv", true)
          .order("bezeichnung"),
        (supabase.from("admin_config_options" as never) as any)
          .select("label, sort_order")
          .eq("kategorie", "taetigkeit")
          .eq("is_active", true)
          .order("sort_order"),
        (supabase.from("admin_config_options" as never) as any)
          .select("wert, label, sort_order")
          .eq("kategorie", "kostenstelle")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (vehData) setVehicles(vehData as any);
      if (taetData) setTaetigkeitOptions(((taetData as any[]) || []).map(o => o.label));
      // Fallback-Liste behalten, wenn der Fetch nichts liefert
      const ksList = ((ksData as any[]) || []).map(o => ({ wert: o.wert as string, label: o.label as string }));
      if (ksList.length > 0) setKostenstellen(ksList);
    })();

    // Standard-Fahrzeug des eingeloggten Mitarbeiters laden
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: emp } = await (supabase.from("employees" as never) as any)
        .select("standard_vehicle_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const vid = (emp as any)?.standard_vehicle_id as string | null | undefined;
      if (vid) {
        standardVehicleIdRef.current = vid;
        setStandardVehicleId(vid);
      }
    })();

    // Check if user is admin
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
        setIsAdmin(roleData?.role === "administrator");
      }
    })();

    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Das Standard-Fahrzeug kommt asynchron — Blöcke, die vorher erzeugt
  // wurden, bekommen den Vorschlag einmalig nachgereicht.
  const standardVehicleAppliedRef = useRef(false);
  useEffect(() => {
    if (!standardVehicleId || standardVehicleAppliedRef.current) return;
    standardVehicleAppliedRef.current = true;
    setTimeBlocks(prev => prev.map(b =>
      b.kfzEntries.length === 0
        ? { ...b, kfzOpen: true, kfzEntries: [createEmptyKfzEntry(standardVehicleId)] }
        : b
    ));
  }, [standardVehicleId]);

  const handleCreateNewProject = async () => {
    if (creatingProject) return;
    
    if (!newProjectName.trim() || !newProjectPlz.trim()) {
      sonnerToast.error("Name und PLZ sind Pflichtfelder");
      return;
    }

    if (!/^\d{4,5}$/.test(newProjectPlz)) {
      sonnerToast.error("PLZ muss 4-5 Ziffern haben");
      return;
    }

    setCreatingProject(true);

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: newProjectName.trim(),
        plz: newProjectPlz.trim(),
        adresse: newProjectAddress.trim() || null,
        status: 'In Arbeit'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        sonnerToast.error("Ein Projekt mit diesem Namen und PLZ existiert bereits");
      } else {
        sonnerToast.error("Projekt konnte nicht erstellt werden");
      }
      setCreatingProject(false);
      return;
    }

    sonnerToast.success("Projekt erfolgreich erstellt");
    
    // Set the project in the pending block
    if (pendingBlockIdForNewProject) {
      updateBlock(pendingBlockIdForNewProject, { projectId: data.id });
    }
    
    setShowNewProjectDialog(false);
    setNewProjectName("");
    setNewProjectPlz("");
    setNewProjectAddress("");
    setPendingBlockIdForNewProject(null);
    setCreatingProject(false);
  };

  const fetchProjects = async () => {
    // Nur die für diesen User sichtbaren Projekte laden.
    // Zentrale Quelle der Wahrheit: RPC list_accessible_project_ids_for_user.
    // Unabhängig von RLS → eindeutig konsistente Projektliste.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
      "list_accessible_project_ids_for_user",
      { p_user_id: user.id, p_only_active: true },
    );
    if (rpcErr) {
      console.error("RPC list_accessible_project_ids_for_user:", rpcErr);
      // Fallback auf RLS-gefilterten Direktzugriff
      const { data } = await supabase
        .from("projects")
        .select("id, name, status, plz")
        .not("status", "eq", "Abgeschlossen")
        .order("name");
      if (data) setProjects(data);
    } else if (rpcData) {
      // RPC liefert nur id, name, status — plz nachladen für UI
      const ids = (rpcData as any[]).map((p: any) => p.id);
      if (ids.length > 0) {
        const { data: full } = await supabase
          .from("projects")
          .select("id, name, status, plz")
          .in("id", ids)
          .order("name");
        if (full) setProjects(full);
      } else {
        setProjects([]);
      }
    }
    setLoading(false);
  };

  const fetchDisturbances = async () => {
    const { data } = await supabase
      .from("disturbances")
      .select("id, datum, kunde_name, status")
      .in("status", ["offen", "gesendet", "abgeschlossen"])
      .order("datum", { ascending: false })
      .limit(50);
    if (data) setDisturbances(data);
  };

  // Update a specific block
  const updateBlock = (blockId: string, updates: Partial<TimeBlock>) => {
    setTimeBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, ...updates } : block
    ));
  };

  // Add a new time block
  const addTimeBlock = () => {
    const lastBlock = timeBlocks[timeBlocks.length - 1];
    let suggestedStart = "";
    
    if (lastBlock.endTime) {
      const [endH, endM] = lastBlock.endTime.split(':').map(Number);
      const nextMinutes = endH * 60 + endM + 30; // 30 min after last block ends
      suggestedStart = `${String(Math.floor(nextMinutes / 60)).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`;
    }
    
    setTimeBlocks(prev => [...prev, buildBlock(suggestedStart)]);
  };

  // Remove a time block
  const removeBlock = (blockId: string) => {
    setTimeBlocks(prev => prev.filter(block => block.id !== blockId));
  };

  // Update selected employees for a block
  const updateBlockEmployees = (blockId: string, employees: string[]) => {
    setTimeBlocks(prev => prev.map(block =>
      block.id === blockId ? { ...block, selectedEmployees: employees } : block
    ));
  };

  // Calculate pause minutes for a block
  const calculateBlockPauseMinutes = (block: TimeBlock): number => {
    return block.pauseDuration || 0;
  };

  // Calculate hours for a single block
  const calculateBlockHours = (block: TimeBlock): number => {
    if (!block.startTime || !block.endTime) return 0;

    const [startH, startM] = block.startTime.split(':').map(Number);
    const [endH, endM] = block.endTime.split(':').map(Number);
    const pauseMinutes = calculateBlockPauseMinutes(block);

    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    // Overnight shift: Endzeit vor Startzeit → über Mitternacht
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    totalMinutes -= pauseMinutes;
    // Pause darf Arbeitszeit nicht übersteigen
    return Math.max(0, totalMinutes / 60);
  };

  // Calculate total hours across all blocks
  const calculateTotalHours = (): string => {
    const total = timeBlocks.reduce((sum, block) => sum + calculateBlockHours(block), 0);
    return total.toFixed(2);
  };

  // Quick-fill preset for first block
  const applyFullDayPreset = () => {
    if (timeBlocks.length > 0) {
      const selectedDateObj = new Date(selectedDate);
      const defaultTimes = getDefaultWorkTimes(selectedDateObj);
      
      if (!defaultTimes) {
        toast({ 
          variant: "destructive", 
          title: "Arbeitsfrei", 
          description: "Am Wochenende wird nicht gearbeitet"
        });
        return;
      }
      
      updateBlock(timeBlocks[0].id, {
        startTime: defaultTimes.startTime,
        endTime: defaultTimes.endTime,
        pauseStart: defaultTimes.pauseStart,
        pauseEnd: defaultTimes.pauseEnd,
      });
    }
  };

  const handleAbsenceSubmit = async () => {
    if (submittingAbsence) return;
    
    setSubmittingAbsence(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSubmittingAbsence(false);
      return;
    }

    const { count: existingCount } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("datum", absenceData.date);

    if ((existingCount ?? 0) > 0) {
      toast({ 
        variant: "destructive", 
        title: "Eintrag bereits vorhanden", 
        description: "Für diesen Tag wurden die Stunden bereits eingetragen, gehe unter Meine Stunden rein." 
      });
      setSubmittingAbsence(false);
      return;
    }

    let documentPath = null;
    if (absenceData.type === "krankenstand" && absenceData.document) {
      const fileName = `${user.id}/${Date.now()}_${absenceData.document.name}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(fileName, absenceData.document);

      if (uploadError) {
        toast({ variant: "destructive", title: "Fehler", description: `Dokument konnte nicht hochgeladen werden: ${uploadError.message}` });
        setSubmittingAbsence(false);
        return;
      }

      documentPath = fileName;
    }

    const selectedDateObj = new Date(absenceData.date);
    const automaticHours = getNormalWorkingHours(selectedDateObj);
    const defaultTimes = getDefaultWorkTimes(selectedDateObj);

    let workingHours: number;
    let entryStartTime: string;
    let entryEndTime: string;
    let entryPauseMinutes: number;

    if (absenceData.isFullDay) {
      const custom = absenceData.customHours ? parseFloat(absenceData.customHours) : NaN;
      // Validierung: muss eine endliche, nicht-negative Zahl zwischen 0 und 24 sein
      workingHours = (isFinite(custom) && custom >= 0 && custom <= 24) ? custom : automaticHours;
      entryStartTime = defaultTimes?.startTime || "07:00";
      entryEndTime = defaultTimes?.endTime || "16:00";
      entryPauseMinutes = defaultTimes?.pauseMinutes || 30;
    } else {
      // Calculate from Von/Bis
      const [sH, sM] = absenceData.absenceStartTime.split(':').map(Number);
      const [eH, eM] = absenceData.absenceEndTime.split(':').map(Number);
      const pause = Math.max(0, parseInt(absenceData.absencePauseMinutes) || 0);
      let totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
      if (totalMinutes < 0) totalMinutes += 24 * 60; // Overnight
      totalMinutes -= pause;
      workingHours = Math.max(0, totalMinutes / 60);
      entryStartTime = absenceData.absenceStartTime;
      entryEndTime = absenceData.absenceEndTime;
      entryPauseMinutes = pause;
    }

    // ZA: Check and deduct from time account
    if (absenceData.type === "za") {
      const { data: timeAccount, error: taError } = await supabase
        .from("time_accounts")
        .select("id, balance_hours")
        .eq("user_id", user.id)
        .maybeSingle();

      if (taError || !timeAccount) {
        toast({ variant: "destructive", title: "Fehler", description: "Kein Zeitkonto gefunden. Bitte wenden Sie sich an den Administrator." });
        setSubmittingAbsence(false);
        return;
      }

      if (Number(timeAccount.balance_hours) < workingHours) {
        toast({ variant: "destructive", title: "Nicht genügend ZA-Stunden", description: `Verfügbar: ${timeAccount.balance_hours}h, benötigt: ${workingHours}h` });
        setSubmittingAbsence(false);
        return;
      }

      const balanceBefore = Number(timeAccount.balance_hours);
      const balanceAfter = balanceBefore - workingHours;

      const { error: updateErr } = await supabase
        .from("time_accounts")
        .update({ balance_hours: balanceAfter, updated_at: new Date().toISOString() })
        .eq("id", timeAccount.id);

      if (updateErr) {
        toast({ variant: "destructive", title: "Fehler", description: "ZA-Stunden konnten nicht abgebucht werden" });
        setSubmittingAbsence(false);
        return;
      }

      await supabase.from("time_account_transactions").insert({
        user_id: user.id,
        changed_by: user.id,
        change_type: "za_abzug",
        hours: -workingHours,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: `Zeitausgleich am ${absenceData.date}`,
      });
    }

    const absenceLabel = absenceData.type === "urlaub" ? "Urlaub" : absenceData.type === "krankenstand" ? "Krankenstand" : absenceData.type === "weiterbildung" ? "Weiterbildung" : absenceData.type === "za" ? "Zeitausgleich" : "Feiertag";

    const { error } = await supabase.from("time_entries").insert({
      user_id: user.id,
      datum: absenceData.date,
      project_id: null,
      taetigkeit: absenceLabel,
      stunden: workingHours,
      start_time: entryStartTime,
      end_time: entryEndTime,
      pause_minutes: entryPauseMinutes,
      location_type: "baustelle",
      notizen: documentPath ? `Krankmeldung: ${documentPath}` : null,
      week_type: null,
    });

    if (!error) {
      toast({ title: "Erfolg", description: `${absenceLabel} erfasst` });
      setShowAbsenceDialog(false);
      setAbsenceData({
        date: new Date().toISOString().split('T')[0],
        type: "urlaub",
        document: null,
        customHours: "",
        isFullDay: true,
        absenceStartTime: "07:00",
        absenceEndTime: "16:00",
        absencePauseMinutes: "30",
      });
      fetchExistingDayEntries(selectedDate);
    } else {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht gespeichert werden" });
    }
    setSubmittingAbsence(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSaving(false);
      return;
    }

    // Validate all blocks
    for (let i = 0; i < timeBlocks.length; i++) {
      const block = timeBlocks[i];
      const blockNum = i + 1;

      if (!block.startTime || !block.endTime) {
        toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Start- und Endzeit erforderlich` });
        setSaving(false);
        return;
      }

      const [startH, startM] = block.startTime.split(':').map(Number);
      const [endH, endM] = block.endTime.split(':').map(Number);
      if (endH * 60 + endM <= startH * 60 + startM) {
        toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Endzeit muss nach Startzeit liegen` });
        setSaving(false);
        return;
      }

      // M-2: Pause darf nicht die Arbeitszeit übersteigen
      const blockMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      const pauseMin = block.pauseDuration || 0;
      if (pauseMin >= blockMinutes) {
        toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Pause (${pauseMin} Min.) ist länger als die Arbeitszeit (${blockMinutes} Min.)` });
        setSaving(false);
        return;
      }

      // Kein Tageslimit mehr — Mitarbeiter dürfen beliebig viel buchen.
      // (AT-AZG-Warnung bei >12h wurde entfernt auf ausdrücklichen Wunsch.)

      // Kostenstelle ist Pflicht
      if (!block.kostenstelle) {
        toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Bitte eine Kostenstelle wählen` });
        setSaving(false);
        return;
      }

      // Projekt ist nur bei Kostenstelle "Baustelle" Pflicht — bei allen
      // anderen Kostenstellen (Werkstatt, Lager, …) ist es optional.
      if (block.kostenstelle === "baustelle" && !block.projectId) {
        toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Bitte ein Projekt auswählen` });
        setSaving(false);
        return;
      }
    }

    // Check for overlaps between blocks
    const timeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    for (let i = 0; i < timeBlocks.length; i++) {
      for (let j = i + 1; j < timeBlocks.length; j++) {
        const blockA = timeBlocks[i];
        const blockB = timeBlocks[j];
        
        const aStart = timeToMinutes(blockA.startTime);
        const aEnd = timeToMinutes(blockA.endTime);
        const bStart = timeToMinutes(blockB.startTime);
        const bEnd = timeToMinutes(blockB.endTime);
        
        if (aStart < bEnd && aEnd > bStart) {
          toast({ 
            variant: "destructive", 
            title: "Zeitüberschneidung", 
            description: `Block ${i + 1} und Block ${j + 1} überschneiden sich` 
          });
          setSaving(false);
          return;
        }
      }
    }

    // Check for overlaps with existing entries
    const { data: existingEntries } = await supabase
      .from("time_entries")
      .select("id, start_time, end_time, taetigkeit")
      .eq("user_id", user.id)
      .eq("datum", selectedDate);

    if (existingEntries && existingEntries.length > 0) {
      for (const entry of existingEntries) {
        if (["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(entry.taetigkeit)) {
          toast({ 
            variant: "destructive", 
            title: "Tag bereits blockiert", 
            description: `Für diesen Tag ist bereits ${entry.taetigkeit} eingetragen.` 
          });
          setSaving(false);
          return;
        }
        
        const existingStart = timeToMinutes(entry.start_time);
        const existingEnd = timeToMinutes(entry.end_time);
        
        for (let i = 0; i < timeBlocks.length; i++) {
          const block = timeBlocks[i];
          const blockStart = timeToMinutes(block.startTime);
          const blockEnd = timeToMinutes(block.endTime);
          
          if (blockStart < existingEnd && blockEnd > existingStart) {
            toast({ 
              variant: "destructive", 
              title: "Zeitüberschneidung", 
              description: `Block ${i + 1} überschneidet mit bestehendem Eintrag (${entry.start_time.substring(0, 5)} - ${entry.end_time.substring(0, 5)})` 
            });
            setSaving(false);
            return;
          }
        }
      }
    }

    // Insert all blocks with team members via Edge Function
    let totalEntriesCreated = 0;
    let hasError = false;

    for (const block of timeBlocks) {
      const pauseMinutes = calculateBlockPauseMinutes(block);
      const blockHours = calculateBlockHours(block);

      // Determine DB location_type (regie is stored as baustelle)
      const dbLocationType = block.locationType === "regie" ? "baustelle" : block.locationType;

      // For regie: store selected disturbance IDs as a note
      const regieNotizen = block.locationType === "regie" && block.selectedDisturbanceIds.length > 0
        ? `Regie-Zuordnung: ${block.selectedDisturbanceIds.join(",")}`
        : null;

      // Wetterschicht: nur bei Baustelle sinnvoll — bei Werkstatt/Regie ignorieren
      const wetterschichtVal = (() => {
        if (block.locationType !== "baustelle") return null;
        const v = parseFloat(block.wetterschichtStunden || "");
        return isNaN(v) || v <= 0 ? null : v;
      })();

      // Prepare main entry for current user (Legacy-Spalten kfz_id/km_start/km_ende
      // bleiben NULL; detaillierte KFZ-Daten kommen in time_entry_vehicles)
      // Projekt darf bei jeder Kostenstelle mitgegeben werden (bei
      // "baustelle" Pflicht, sonst optional → NULL erlaubt). Regie bleibt
      // wie bisher ohne Projekt.
      const projectIdVal = block.locationType === "regie" ? null : (block.projectId || null);

      const mainEntry = {
        user_id: user.id,
        datum: selectedDate,
        project_id: projectIdVal,
        kostenstelle: block.kostenstelle,
        disturbance_id: null,
        taetigkeit: block.taetigkeit,
        stunden: blockHours,
        start_time: block.startTime,
        end_time: block.endTime,
        pause_minutes: pauseMinutes,
        pause_start: null,
        pause_end: null,
        location_type: dbLocationType,
        notizen: regieNotizen,
        week_type: null,
        wetterschicht_stunden: wetterschichtVal,
        kfz_id: null,
        km_start: null,
        km_ende: null,
      };

      // Prepare team entries
      const teamEntries = block.selectedEmployees.map(workerId => ({
        user_id: workerId,
        datum: selectedDate,
        project_id: projectIdVal,
        kostenstelle: block.kostenstelle,
        taetigkeit: block.taetigkeit,
        stunden: blockHours,
        start_time: block.startTime,
        end_time: block.endTime,
        pause_minutes: pauseMinutes,
        pause_start: null,
        pause_end: null,
        location_type: dbLocationType,
        notizen: regieNotizen,
        week_type: null,
        wetterschicht_stunden: wetterschichtVal,
      }));

      // Call Edge Function to create entries (bypasses RLS for team members)
      const { data: result, error: functionError } = await supabase.functions.invoke(
        "create-team-time-entries",
        {
          body: {
            mainEntry,
            teamEntries,
            createWorkerLinks: true,
          },
        }
      );

      if (functionError || !result?.success) {
        hasError = true;
        console.error("Error creating time entries:", functionError || result?.error);
        continue;
      }

      const mainId = (result as any)?.mainEntryId as string | undefined;
      const teamIds = ((result as any)?.teamEntryIds as string[] | undefined) || [];

      // Kostenstelle nachziehen: die Edge Function kennt das Feld (noch)
      // nicht, daher nach dem Insert per Update setzen. RLS begrenzt das
      // Update auf Einträge, die der User bearbeiten darf.
      const idsToPatch = [mainId, ...teamIds].filter(Boolean) as string[];
      if (idsToPatch.length > 0 && block.kostenstelle) {
        const { error: ksErr } = await (supabase.from("time_entries" as never) as any)
          .update({ kostenstelle: block.kostenstelle })
          .in("id", idsToPatch);
        if (ksErr) console.error("Kostenstelle konnte nicht gesetzt werden:", ksErr);
      }

      // KFZ-Einträge in time_entry_vehicles schreiben (nur für den
      // Haupt-User-Entry; Team-Member-Entries bekommen keine KFZ-Daten).
      if (mainId && block.kfzOpen && block.kfzEntries.length > 0) {
        const kfzRows = block.kfzEntries
          .filter(k => k.vehicleId)
          .map(k => {
            const gef = k.kmGefahren ? parseInt(k.kmGefahren, 10) : null;
            const s = k.kmStart ? parseInt(k.kmStart, 10) : null;
            const e = k.kmEnde ? parseInt(k.kmEnde, 10) : null;
            // Fahrzeugstunden: manuell gesetzter Wert, sonst die Stunden
            // des Zeitblocks (Vorbelegung).
            const manuell = k.stundenTouched ? parseFloat(k.stunden.replace(",", ".")) : NaN;
            const fahrzeugStunden = isFinite(manuell) && manuell >= 0 ? manuell : blockHours;
            return {
              time_entry_id: mainId,
              vehicle_id: k.vehicleId,
              modus: k.modus,
              km_gefahren: k.modus === "gefahren" ? gef : (s != null && e != null ? e - s : null),
              km_start: k.modus === "start_ende" ? s : null,
              km_ende: k.modus === "start_ende" ? e : null,
              stunden: fahrzeugStunden > 0 ? Number(fahrzeugStunden.toFixed(2)) : null,
            };
          });
        if (kfzRows.length > 0) {
          const { error: kfzErr } = await (supabase.from("time_entry_vehicles" as never) as any).insert(kfzRows);
          if (kfzErr) console.error("KFZ-Einträge konnten nicht gespeichert werden:", kfzErr);
        }
      }

      totalEntriesCreated += result.totalCreated || 1;
    }

    if (!hasError) {
      const teamInfo = timeBlocks.some(b => b.selectedEmployees.length > 0)
        ? ` (inkl. Team-Mitglieder)`
        : "";
      toast({ title: "Erfolg", description: `${totalEntriesCreated} Eintrag/Einträge gespeichert${teamInfo}` });
      
      // Refresh existing entries
      await fetchExistingDayEntries(selectedDate);
    } else {
      toast({ variant: "destructive", title: "Fehler", description: "Einige Einträge konnten nicht gespeichert werden" });
    }
    setSaving(false);
  };

  const isDayBlocked = existingDayEntries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit));

  if (loading) return <div className="p-4">Lädt...</div>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Zeiterfassung" />
      
      <div className="p-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <CardTitle>Zeiterfassung</CardTitle>
              </div>
              <Button 
                variant="outline" 
                onClick={() => setShowAbsenceDialog(true)} 
                className="gap-2"
              >
                <Calendar className="h-4 w-4" />
                Abwesenheit
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date picker */}
              <div className="space-y-2">
                <Label htmlFor="date">Datum</Label>
                <Input 
                  id="date" 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)} 
                  required 
                />
                {selectedDate && (
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedDate), "EEEE, dd. MMMM yyyy", { locale: de })}
                  </p>
                )}
              </div>

              {/* Weekly target info */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {getWeeklyTargetHours()}h Wochensoll
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Mo-Do: 8,5h • Fr: 5h (inkl. 0,5h Überstunde/ZA)
                  </span>
                </div>
              </div>

              {/* Existing entries info box */}
              {loadingDayEntries ? (
                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 animate-pulse" />
                  Lade Tageseinträge...
                </div>
              ) : existingDayEntries.length > 0 ? (
                <div className={`rounded-lg p-4 space-y-3 ${
                  isDayBlocked
                    ? "bg-destructive/10 border border-destructive/30"
                    : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                }`}>
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {isDayBlocked ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-destructive">Tag blockiert ({existingDayEntries[0].taetigkeit})</span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-700 dark:text-amber-300">Bereits gebuchte Zeiten</span>
                      </>
                    )}
                  </div>
                  
                  {!isDayBlocked && (
                    <div className="space-y-1.5">
                      {existingDayEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-sm bg-background/60 rounded px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {entry.start_time.substring(0, 5)} - {entry.end_time.substring(0, 5)}
                            </Badge>
                            <span className="truncate max-w-[150px]">
                              {entry.project_name ? `${entry.project_name}` : entry.taetigkeit}
                            </span>
                          </div>
                          <span className="font-medium">{Number(entry.stunden).toFixed(2)}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2 border-t border-amber-200 dark:border-amber-700">
                    <span className="text-sm font-medium">Tagessumme</span>
                    <span className="font-bold">
                      {existingDayEntries.reduce((sum, e) => sum + Number(e.stunden), 0).toFixed(2)} Stunden
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Noch keine Einträge für diesen Tag
                  </p>
                </div>
              )}

              {/* Only show form if day is not blocked */}
              {!isDayBlocked && (
                <>

                  {/* Time Blocks */}
                  <div className="space-y-4">
                    {timeBlocks.map((block, index) => (
                      <div 
                        key={block.id} 
                        className="border rounded-lg p-4 space-y-4 bg-card"
                      >
                        {/* Block header */}
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-sm flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {timeBlocks.length > 1 ? `Zeitblock ${index + 1}` : "Arbeitszeit"}
                          </h3>
                          {timeBlocks.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBlock(block.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        {/* Kostenstelle — Pflichtfeld, große Touch-Chips */}
                        <div className="space-y-2">
                          <Label>Kostenstelle *</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {kostenstellen.map((ks) => {
                              const active = block.kostenstelle === ks.wert;
                              return (
                                <button
                                  key={ks.wert}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => updateBlock(block.id, {
                                    kostenstelle: ks.wert,
                                    // location_type bleibt die grobe Einordnung:
                                    // Baustelle vs. Firma (alles andere).
                                    locationType: ks.wert === "baustelle" ? "baustelle" : "werkstatt",
                                  })}
                                  className={`flex min-h-[56px] items-center justify-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors ${
                                    active
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-muted bg-popover hover:bg-accent"
                                  }`}
                                >
                                  <span aria-hidden>{KOSTENSTELLEN_ICONS[ks.wert] || "📍"}</span>
                                  <span className="text-center leading-tight">{ks.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Projekt — Pflicht bei Kostenstelle "Baustelle", sonst optional */}
                        {block.locationType !== "regie" && (
                          <div className="space-y-2">
                            <Label>
                              Projekt{" "}
                              {block.kostenstelle === "baustelle" ? (
                                <span className="text-primary">*</span>
                              ) : (
                                <span className="text-muted-foreground font-normal">(optional)</span>
                              )}
                            </Label>
                            <Select
                              value={block.projectId || (block.kostenstelle === "baustelle" ? "" : "none")}
                              onValueChange={(value) => {
                                if (value === "new") {
                                  setPendingBlockIdForNewProject(block.id);
                                  setShowNewProjectDialog(true);
                                } else {
                                  updateBlock(block.id, { projectId: value === "none" ? "" : value });
                                }
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
                              <SelectContent>
                                {block.kostenstelle !== "baustelle" && (
                                  <SelectItem value="none">Kein Projekt</SelectItem>
                                )}
                                {projects.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.plz})</SelectItem>
                                ))}
                                <SelectItem value="new" className="text-primary font-semibold">
                                  <div className="flex items-center gap-2"><Plus className="w-4 h-4" />Neues Projekt erstellen</div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Regie: Disturbance report selection (multi-select) */}
                        {block.locationType === "regie" && disturbances.length > 0 && (
                          <div className="space-y-2">
                            <Label>Regieberichte zuordnen <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <div className="border rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
                              {disturbances.map(d => {
                                const isSelected = block.selectedDisturbanceIds.includes(d.id);
                                return (
                                  <label
                                    key={d.id}
                                    className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent text-sm ${isSelected ? 'bg-primary/10' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {
                                        const newIds = isSelected
                                          ? block.selectedDisturbanceIds.filter(id => id !== d.id)
                                          : [...block.selectedDisturbanceIds, d.id];
                                        updateBlock(block.id, { selectedDisturbanceIds: newIds });
                                      }}
                                      className="rounded border-muted"
                                    />
                                    <span>{new Date(d.datum).toLocaleDateString("de-AT")} - {d.kunde_name}</span>
                                    <Badge variant="outline" className="ml-auto text-xs">{d.status}</Badge>
                                  </label>
                                );
                              })}
                            </div>
                            {block.selectedDisturbanceIds.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {block.selectedDisturbanceIds.length} Regiebericht(e) ausgewählt (nur als Vermerk)
                              </p>
                            )}
                          </div>
                        )}

                        {/* Activity - Combobox (vorgeschlagene Werte + freie Eingabe) */}
                        {block.locationType !== "regie" ? (
                          <div className="space-y-2">
                            <Label>Tätigkeit <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                              list={`taetigkeit-options-${block.id}`}
                              value={block.taetigkeit}
                              onChange={(e) => updateBlock(block.id, { taetigkeit: e.target.value })}
                              placeholder="z.B. Montage, Aufmaß..."
                            />
                            <datalist id={`taetigkeit-options-${block.id}`}>
                              {taetigkeitOptions.map((opt) => (
                                <option key={opt} value={opt} />
                              ))}
                            </datalist>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label>Tätigkeit</Label>
                            <Input
                              list={`taetigkeit-options-${block.id}`}
                              value={block.taetigkeit}
                              onChange={(e) => updateBlock(block.id, { taetigkeit: e.target.value })}
                              placeholder="Regiearbeit"
                            />
                            <datalist id={`taetigkeit-options-${block.id}`}>
                              {taetigkeitOptions.map((opt) => (
                                <option key={opt} value={opt} />
                              ))}
                            </datalist>
                          </div>
                        )}

                        {/* KFZ + Kilometerstände — eingeklappt, erst mit + aktivierbar */}
                        {vehicles.length > 0 && (
                          <div className="rounded-md border bg-muted/20">
                            {!block.kfzOpen ? (
                              <button
                                type="button"
                                onClick={() => updateBlock(block.id, {
                                  kfzOpen: true,
                                  kfzEntries: block.kfzEntries.length > 0
                                    ? block.kfzEntries
                                    : [createEmptyKfzEntry(standardVehicleId)],
                                } as any)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                              >
                                <Plus className="h-4 w-4" /> KFZ &amp; Kilometerstand erfassen
                              </button>
                            ) : (
                              <div className="p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                  <Label className="text-sm">KFZ &amp; Kilometerstand</Label>
                                  <button
                                    type="button"
                                    onClick={() => updateBlock(block.id, { kfzOpen: false, kfzEntries: [] } as any)}
                                    className="text-xs text-muted-foreground hover:text-destructive"
                                  >
                                    Entfernen
                                  </button>
                                </div>
                                {block.kfzEntries.map((kfz, kfzIdx) => (
                                  <div key={kfz.key} className="rounded border bg-background p-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1">
                                        <Label className="text-xs">Fahrzeug</Label>
                                        <Select
                                          value={kfz.vehicleId || "none"}
                                          onValueChange={(v) => {
                                            const next = [...block.kfzEntries];
                                            next[kfzIdx] = { ...kfz, vehicleId: v === "none" ? "" : v };
                                            updateBlock(block.id, { kfzEntries: next } as any);
                                          }}
                                        >
                                          <SelectTrigger><SelectValue placeholder="Fahrzeug wählen..." /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">Kein Fahrzeug</SelectItem>
                                            {vehicles.map((v) => (
                                              <SelectItem key={v.id} value={v.id}>
                                                {v.bezeichnung}{v.kennzeichen ? ` (${v.kennzeichen})` : ""}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <button
                                        type="button"
                                        title="Fahrzeugzeile entfernen"
                                        onClick={() => {
                                          const next = block.kfzEntries.filter((_, i) => i !== kfzIdx);
                                          updateBlock(block.id, {
                                            kfzEntries: next,
                                            kfzOpen: next.length > 0,
                                          } as any);
                                        }}
                                        className="mt-5 h-9 w-9 shrink-0 rounded border text-destructive hover:bg-destructive/10"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    {/* Modus-Toggle */}
                                    <div className="flex gap-1 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = [...block.kfzEntries];
                                          next[kfzIdx] = { ...kfz, modus: "gefahren" };
                                          updateBlock(block.id, { kfzEntries: next } as any);
                                        }}
                                        className={`flex-1 px-2 py-1 rounded border ${kfz.modus === "gefahren" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                                      >
                                        Gefahrene km
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = [...block.kfzEntries];
                                          next[kfzIdx] = { ...kfz, modus: "start_ende" };
                                          updateBlock(block.id, { kfzEntries: next } as any);
                                        }}
                                        className={`flex-1 px-2 py-1 rounded border ${kfz.modus === "start_ende" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                                      >
                                        km Start / Ende
                                      </button>
                                    </div>
                                    {/* Eingabefelder je nach Modus */}
                                    {kfz.modus === "gefahren" ? (
                                      <div>
                                        <Label className="text-xs">Gefahrene km</Label>
                                        <Input
                                          type="number"
                                          inputMode="numeric"
                                          value={kfz.kmGefahren}
                                          onChange={(e) => {
                                            const next = [...block.kfzEntries];
                                            next[kfzIdx] = { ...kfz, kmGefahren: e.target.value };
                                            updateBlock(block.id, { kfzEntries: next } as any);
                                          }}
                                          placeholder="z.B. 57"
                                          disabled={!kfz.vehicleId}
                                        />
                                      </div>
                                    ) : (
                                      <>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <Label className="text-xs">km Start</Label>
                                            <Input
                                              type="number"
                                              inputMode="numeric"
                                              value={kfz.kmStart}
                                              onChange={(e) => {
                                                const next = [...block.kfzEntries];
                                                next[kfzIdx] = { ...kfz, kmStart: e.target.value };
                                                updateBlock(block.id, { kfzEntries: next } as any);
                                              }}
                                              placeholder="42130"
                                              disabled={!kfz.vehicleId}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">km Ende</Label>
                                            <Input
                                              type="number"
                                              inputMode="numeric"
                                              value={kfz.kmEnde}
                                              onChange={(e) => {
                                                const next = [...block.kfzEntries];
                                                next[kfzIdx] = { ...kfz, kmEnde: e.target.value };
                                                updateBlock(block.id, { kfzEntries: next } as any);
                                              }}
                                              placeholder="42187"
                                              disabled={!kfz.vehicleId}
                                            />
                                          </div>
                                        </div>
                                        {kfz.kmStart && kfz.kmEnde && Number(kfz.kmEnde) >= Number(kfz.kmStart) && (
                                          <p className="text-xs text-muted-foreground">Gefahren: {Number(kfz.kmEnde) - Number(kfz.kmStart)} km</p>
                                        )}
                                      </>
                                    )}
                                    {/* Fahrzeugstunden — vorbelegt mit den Stunden des Zeitblocks */}
                                    <div>
                                      <Label className="text-xs">Fahrzeugstunden</Label>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          step="0.25"
                                          min="0"
                                          max="24"
                                          inputMode="decimal"
                                          value={kfz.stundenTouched ? kfz.stunden : calculateBlockHours(block).toFixed(2)}
                                          onChange={(e) => {
                                            const next = [...block.kfzEntries];
                                            next[kfzIdx] = { ...kfz, stunden: e.target.value, stundenTouched: true };
                                            updateBlock(block.id, { kfzEntries: next } as any);
                                          }}
                                          disabled={!kfz.vehicleId}
                                        />
                                        <span className="text-xs text-muted-foreground">h</span>
                                        {kfz.stundenTouched && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const next = [...block.kfzEntries];
                                              next[kfzIdx] = { ...kfz, stunden: "", stundenTouched: false };
                                              updateBlock(block.id, { kfzEntries: next } as any);
                                            }}
                                            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                                          >
                                            Zurücksetzen
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => updateBlock(block.id, {
                                    kfzEntries: [...block.kfzEntries, createEmptyKfzEntry()],
                                  } as any)}
                                  className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground py-1.5 border border-dashed rounded"
                                >
                                  <Plus className="h-3.5 w-3.5" /> Weiteres Fahrzeug
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Start/End time — 30-Min-Schritte */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Beginn</Label>
                            <Select value={block.startTime} onValueChange={(v) => updateBlock(block.id, { startTime: v })}>
                              <SelectTrigger><SelectValue placeholder="Uhrzeit" /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 48 }, (_, i) => {
                                  const h = Math.floor(i / 2);
                                  const m = (i % 2) * 30;
                                  const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                                  return <SelectItem key={t} value={t}>{t}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Ende</Label>
                            <Select value={block.endTime} onValueChange={(v) => updateBlock(block.id, { endTime: v })}>
                              <SelectTrigger><SelectValue placeholder="Uhrzeit" /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 48 }, (_, i) => {
                                  const h = Math.floor(i / 2);
                                  const m = (i % 2) * 30;
                                  const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                                  return <SelectItem key={t} value={t}>{t}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Pause</Label>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { label: "Keine", value: 0 },
                              { label: "30 Min", value: 30 },
                              { label: "45 Min", value: 45 },
                              { label: "1 Std", value: 60 },
                            ].map(opt => (
                              <Button
                                key={opt.value}
                                type="button"
                                variant={block.pauseDuration === opt.value ? "default" : "outline"}
                                size="sm"
                                className="h-9 text-xs"
                                onClick={() => updateBlock(block.id, { pauseDuration: opt.value })}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                        {/* Regelarbeitszeit button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const dateObj = new Date(selectedDate);
                            const defaults = getDefaultWorkTimes(dateObj);
                            if (defaults) {
                              // Calculate pause duration from defaults
                              let defaultPause = 30;
                              if (defaults.pauseStart && defaults.pauseEnd) {
                                const [ps, pm] = defaults.pauseStart.split(':').map(Number);
                                const [pe, pem] = defaults.pauseEnd.split(':').map(Number);
                                defaultPause = (pe * 60 + pem) - (ps * 60 + pm);
                              } else {
                                defaultPause = 0; // Freitag: keine Pause
                              }
                              updateBlock(block.id, {
                                startTime: defaults.startTime,
                                endTime: defaults.endTime,
                                pauseDuration: defaultPause,
                              });
                            }
                          }}
                          className="w-full text-xs"
                        >
                          <Sun className="w-3 h-3 mr-1" />
                          Regelarbeitszeit einfüllen
                        </Button>

                        {/* Wetterschicht — nur bei Baustelle, rein informativ */}
                        {block.locationType === "baustelle" && (
                          <div className="flex items-center gap-2 rounded-md border border-dashed border-blue-300/50 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2">
                            <Label
                              htmlFor={`wetter-${block.id}`}
                              className="text-xs font-normal text-muted-foreground flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                            >
                              <span aria-hidden>☔</span>
                              <span className="truncate">Wetterschicht (Regenstunden)</span>
                            </Label>
                            <Input
                              id={`wetter-${block.id}`}
                              type="number"
                              step="0.25"
                              min="0"
                              max="24"
                              inputMode="decimal"
                              placeholder="0"
                              value={block.wetterschichtStunden}
                              onChange={(e) => updateBlock(block.id, { wetterschichtStunden: e.target.value })}
                              className="h-8 w-20 text-sm"
                            />
                            <span className="text-xs text-muted-foreground">h</span>
                          </div>
                        )}

                        {/* Block hours */}
                        <div className="bg-muted/50 rounded px-3 py-2 flex items-center justify-between text-sm">
                          <span>Stunden</span>
                          <span className="font-bold">{calculateBlockHours(block).toFixed(2)} h</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add another block button */}
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={addTimeBlock}
                    className="w-full gap-2 border-dashed"
                  >
                    <Plus className="w-4 h-4" />
                    Weitere Stunden hinzufügen
                  </Button>

                  {/* Total hours */}
                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex items-center justify-between">
                    <span className="font-medium">Gesamt zu buchen</span>
                    <span className="text-2xl font-bold">{calculateTotalHours()} h</span>
                  </div>

                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? "Wird gespeichert..." : `${timeBlocks.length > 1 ? 'Alle Einträge' : 'Stunden'} erfassen`}
                  </Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>

        {/* New Project Dialog */}
        <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neues Projekt erstellen</DialogTitle>
              <DialogDescription>Geben Sie die Details ein.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Projektname *</Label><Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} /></div>
              <div><Label>PLZ *</Label><Input value={newProjectPlz} onChange={(e) => setNewProjectPlz(e.target.value)} maxLength={5} /></div>
              <div><Label>Adresse</Label><Input value={newProjectAddress} onChange={(e) => setNewProjectAddress(e.target.value)} /></div>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => { 
                    setShowNewProjectDialog(false); 
                    setNewProjectName(""); 
                    setNewProjectPlz(""); 
                    setNewProjectAddress(""); 
                    setPendingBlockIdForNewProject(null);
                  }}
                  disabled={creatingProject}
                >
                  Abbrechen
                </Button>
                <Button onClick={handleCreateNewProject} disabled={creatingProject}>
                  {creatingProject ? 'Wird erstellt...' : 'Erstellen'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Absence Dialog */}
        <Dialog open={showAbsenceDialog} onOpenChange={setShowAbsenceDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit erfassen</DialogTitle>
              <DialogDescription>Erfassen Sie Urlaub, Krankenstand, ZA, Weiterbildung oder Feiertag</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="absence-date">Datum</Label>
                <Input 
                  id="absence-date" 
                  type="date" 
                  value={absenceData.date} 
                  onChange={(e) => setAbsenceData({ ...absenceData, date: e.target.value })} 
                />
              </div>
              
              <div>
                <Label>Art</Label>
                <RadioGroup 
                  value={absenceData.type} 
                  onValueChange={(value: "urlaub" | "krankenstand" | "weiterbildung" | "feiertag" | "za") => setAbsenceData({ ...absenceData, type: value })}
                  className="grid grid-cols-3 gap-2 mt-2"
                >
                  <div>
                    <RadioGroupItem value="urlaub" id="urlaub" className="peer sr-only" />
                    <Label 
                      htmlFor="urlaub" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🏖️ Urlaub
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="krankenstand" id="krankenstand" className="peer sr-only" />
                    <Label 
                      htmlFor="krankenstand" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🏥 Kranken.
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="za" id="za" className="peer sr-only" />
                    <Label 
                      htmlFor="za" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      ⏰ ZA
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="weiterbildung" id="weiterbildung" className="peer sr-only" />
                    <Label 
                      htmlFor="weiterbildung" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      📚 Weiterbild.
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="feiertag" id="feiertag" className="peer sr-only" />
                    <Label 
                      htmlFor="feiertag" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🎉 Feiertag
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Ganzer Tag toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="full-day-toggle">Ganzer Tag</Label>
                <Switch
                  id="full-day-toggle"
                  checked={absenceData.isFullDay}
                  onCheckedChange={(checked) => {
                    const dateObj = new Date(absenceData.date);
                    const defaults = getDefaultWorkTimes(dateObj);
                    setAbsenceData({
                      ...absenceData,
                      isFullDay: checked,
                      absenceStartTime: defaults?.startTime || "07:00",
                      absenceEndTime: defaults?.endTime || "16:00",
                      absencePauseMinutes: String(defaults?.pauseMinutes ?? 30),
                    });
                  }}
                />
              </div>

              {absenceData.isFullDay ? (
                /* Full day: show calculated hours with optional override */
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Berechnete Stunden für diesen Tag:</span>
                    <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                      {absenceData.customHours || getNormalWorkingHours(new Date(absenceData.date))} h
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(() => {
                      const absenceDateObj = new Date(absenceData.date);
                      const dayOfWeek = absenceDateObj.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) return "Wochenende: 0 Stunden";
                      if (dayOfWeek === 5) return "Freitag: 4,5 Stunden (07:00 - 12:00)";
                      return "Mo-Do: 8,5 Stunden (07:00 - 16:00, 30min Pause)";
                    })()}
                  </div>
                  <div className="pt-2 border-t">
                    <Label className="text-sm">Stunden anpassen (optional)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="24"
                        placeholder={String(getNormalWorkingHours(new Date(absenceData.date)))}
                        value={absenceData.customHours}
                        onChange={(e) => setAbsenceData({ ...absenceData, customHours: e.target.value })}
                        className="w-24 text-center"
                      />
                      <span className="text-sm text-muted-foreground">Stunden</span>
                      {absenceData.customHours && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setAbsenceData({ ...absenceData, customHours: "" })}
                        >
                          Zurücksetzen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Partial day: Von/Bis time inputs */
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Von</Label>
                      <Select value={absenceData.absenceStartTime} onValueChange={(v) => setAbsenceData({ ...absenceData, absenceStartTime: v })}>
                        <SelectTrigger><SelectValue placeholder="Uhrzeit" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 48 }, (_, i) => { const h = Math.floor(i / 2); const m = (i % 2) * 30; const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; return <SelectItem key={t} value={t}>{t}</SelectItem>; })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Bis</Label>
                      <Select value={absenceData.absenceEndTime} onValueChange={(v) => setAbsenceData({ ...absenceData, absenceEndTime: v })}>
                        <SelectTrigger><SelectValue placeholder="Uhrzeit" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 48 }, (_, i) => { const h = Math.floor(i / 2); const m = (i % 2) * 30; const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; return <SelectItem key={t} value={t}>{t}</SelectItem>; })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pause (Minuten)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="120"
                      value={absenceData.absencePauseMinutes}
                      onChange={(e) => setAbsenceData({ ...absenceData, absencePauseMinutes: e.target.value })}
                      className="w-24"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Berechnete Stunden:</span>
                    <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                      {(() => {
                        const [sH, sM] = absenceData.absenceStartTime.split(':').map(Number);
                        const [eH, eM] = absenceData.absenceEndTime.split(':').map(Number);
                        const pause = parseInt(absenceData.absencePauseMinutes) || 0;
                        const total = Math.max(0, ((eH * 60 + eM) - (sH * 60 + sM) - pause) / 60);
                        return total.toFixed(2);
                      })()} h
                    </Badge>
                  </div>
                </div>
              )}

              {absenceData.type === "krankenstand" && (
                <div>
                  <Label htmlFor="document">Krankmeldung (optional)</Label>
                  <Input 
                    id="document" 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setAbsenceData({ ...absenceData, document: e.target.files?.[0] || null })}
                    className="mt-2"
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowAbsenceDialog(false);
                    setAbsenceData({ date: new Date().toISOString().split('T')[0], type: "urlaub", document: null, customHours: "", isFullDay: true, absenceStartTime: "07:00", absenceEndTime: "16:00", absencePauseMinutes: "30" });
                  }}
                  disabled={submittingAbsence}
                >
                  Abbrechen
                </Button>
                <Button onClick={handleAbsenceSubmit} disabled={submittingAbsence}>
                  {submittingAbsence ? "Wird gespeichert..." : "Erfassen"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default TimeTracking;
