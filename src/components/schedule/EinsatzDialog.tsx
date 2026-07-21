import { useState, useEffect, useMemo } from "react";
import { Trash2, Search, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Profile } from "./scheduleTypes";

interface EinsatzData {
  id: string;
  name: string | null;
  project_id: string;
  adresse: string | null;
  start_date: string;
  end_date: string;
  ganztaegig: boolean;
  start_time: string | null;
  end_time: string | null;
  beschreibung: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  /** Auswahlliste für „Mitarbeiter" — ohne die konnte man einen Einsatz
   *  nur durch Klick in die richtige Zeile anlegen (am Handy unmöglich). */
  profiles?: Profile[];
  editEinsatz?: EinsatzData | null;
  prefillUserId?: string;
  /** > 1 Einträge = Mehrfachanlage (Zeilen-Drag über mehrere Mitarbeiter). */
  prefillUserIds?: string[];
  prefillStartDate?: string;
  prefillEndDate?: string;
  onSave: (data: {
    name: string;
    project_id: string;
    user_id: string;
    adresse: string;
    start_date: string;
    end_date: string;
    ganztaegig: boolean;
    start_time: string;
    end_time: string;
    beschreibung: string;
    id?: string;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

/** Heute als yyyy-MM-dd (lokal, nicht UTC). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function EinsatzDialog({
  open,
  onOpenChange,
  projects,
  profiles = [],
  editEinsatz,
  prefillUserId,
  prefillUserIds = [],
  prefillStartDate,
  prefillEndDate,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ganztaegig, setGanztaegig] = useState(true);
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("16:00");
  const [beschreibung, setBeschreibung] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const { toast } = useToast();

  const isEditing = !!editEinsatz;
  // Mehrfachanlage: mehrere Mitarbeiter wurden im Raster markiert.
  const isMulti = !isEditing && prefillUserIds.length > 1;

  useEffect(() => {
    if (!open) return;

    setUserId(prefillUserId ?? "");
    if (editEinsatz) {
      setName(editEinsatz.name ?? "");
      setProjectId(editEinsatz.project_id);
      setAdresse(editEinsatz.adresse ?? "");
      setStartDate(editEinsatz.start_date);
      setEndDate(editEinsatz.end_date);
      setGanztaegig(editEinsatz.ganztaegig);
      setStartTime(editEinsatz.start_time ?? "07:00");
      setEndTime(editEinsatz.end_time ?? "16:00");
      setBeschreibung(editEinsatz.beschreibung ?? "");
    } else {
      setName("");
      setProjectId("");
      setAdresse("");
      setStartDate(prefillStartDate ?? todayISO());
      setEndDate(prefillEndDate ?? prefillStartDate ?? todayISO());
      setGanztaegig(true);
      setStartTime("07:00");
      setEndTime("16:00");
      setBeschreibung("");
    }
    setProjectSearch("");
  }, [open, editEinsatz, prefillUserId, prefillStartDate, prefillEndDate]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const multiNames = useMemo(
    () =>
      prefillUserIds
        .map((id) => profiles.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => `${p!.vorname} ${p!.nachname}`),
    [prefillUserIds, profiles],
  );

  // Warnung (kein Verbot): Einsatz liegt ganz in der Vergangenheit.
  const isPast = !!endDate && endDate < todayISO();

  async function handleSave() {
    if (saving) return; // Doppelklick-Schutz
    if (!projectId || !startDate || !endDate) return;
    if (!isMulti && !userId) {
      toast({ variant: "destructive", title: "Mitarbeiter fehlt", description: "Bitte einen Mitarbeiter auswählen." });
      return;
    }

    // Datum-Validierung
    if (endDate < startDate) {
      toast({ variant: "destructive", title: "Ungültiges Datum", description: "Das Ende-Datum muss gleich oder nach dem Start-Datum liegen." });
      return;
    }

    // Zeit-Validierung bei nicht-ganztägig
    if (!ganztaegig && startDate === endDate && endTime <= startTime) {
      toast({ variant: "destructive", title: "Ungültige Zeit", description: "Die Endzeit muss nach der Startzeit liegen." });
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name,
        project_id: projectId,
        user_id: userId,
        adresse,
        start_date: startDate,
        end_date: endDate,
        ganztaegig,
        start_time: ganztaegig ? "" : startTime,
        end_time: ganztaegig ? "" : endTime,
        beschreibung,
        ...(editEinsatz ? { id: editEinsatz.id } : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editEinsatz || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(editEinsatz.id);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {isEditing ? "Einsatz bearbeiten" : "Neuer Einsatz"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="einsatz">
          <TabsList className="w-full">
            <TabsTrigger value="einsatz" className="flex-1">
              Einsatz
            </TabsTrigger>
            <TabsTrigger value="abwesenheit" className="flex-1">
              Abwesenheit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="einsatz" className="space-y-4 mt-4">
            {/* Mitarbeiter */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Mitarbeiter <span className="text-red-500">*</span>
              </Label>
              {isMulti ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {multiNames.length} Mitarbeiter: {multiNames.join(", ")}
                </div>
              ) : (
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger aria-label="Mitarbeiter">
                    <SelectValue placeholder="Mitarbeiter auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.vorname} {p.nachname}
                      </SelectItem>
                    ))}
                    {profiles.length === 0 && (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Keine Mitarbeiter vorhanden
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Einsatzname
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional..."
              />
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Projekt <span className="text-red-500">*</span>
              </Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger aria-label="Projekt">
                  <SelectValue placeholder="Projekt auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-1.5">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Suchen..."
                        className="pl-7 h-7 text-xs"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      Kein Projekt gefunden
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Einsatzadresse
              </Label>
              <Input
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="Optional..."
              />
            </div>

            {/* Start / Ende */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Start <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  aria-label="Start"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // Ende mitziehen, damit nie ein negativer Zeitraum entsteht
                    if (endDate && e.target.value > endDate) setEndDate(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Ende <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  aria-label="Ende"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {isPast && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Dieser Einsatz liegt in der Vergangenheit — Nachtragen ist möglich.</span>
              </div>
            )}

            {/* Ganztaegig toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                Ganztägig
              </Label>
              <Switch checked={ganztaegig} onCheckedChange={setGanztaegig} aria-label="Ganztägig" />
            </div>

            {/* Time inputs when not ganztaegig */}
            {!ganztaegig && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Start-Zeit
                  </Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    End-Zeit
                  </Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Einsatzbeschreibung
              </Label>
              <Textarea
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
                placeholder="Optional..."
                rows={2}
                className="resize-none"
              />
            </div>
          </TabsContent>

          <TabsContent value="abwesenheit" className="mt-4">
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <span>Urlaub und Krankenstand werden im Urlaubsantrag erfasst.</span>
              <span className="text-xs">
                Genehmigte Abwesenheiten erscheinen automatisch orange auf der Plantafel.
              </span>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          {isEditing && onDelete ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5 min-h-[44px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Löschen..." : "Löschen"}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              className="min-h-[44px]"
              disabled={!projectId || !startDate || !endDate || (!isMulti && !userId) || saving}
              onClick={handleSave}
            >
              {saving ? "Speichern..." : isEditing ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
