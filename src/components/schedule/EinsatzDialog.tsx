import { useState, useEffect, useMemo } from "react";
import { Trash2, Search } from "lucide-react";
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
  editEinsatz?: EinsatzData | null;
  prefillUserId?: string;
  prefillStartDate?: string;
  prefillEndDate?: string;
  onSave: (data: {
    name: string;
    project_id: string;
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

export function EinsatzDialog({
  open,
  onOpenChange,
  projects,
  editEinsatz,
  prefillStartDate,
  prefillEndDate,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
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

  useEffect(() => {
    if (!open) return;

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
      setStartDate(prefillStartDate ?? "");
      setEndDate(prefillEndDate ?? prefillStartDate ?? "");
      setGanztaegig(true);
      setStartTime("07:00");
      setEndTime("16:00");
      setBeschreibung("");
    }
    setProjectSearch("");
  }, [open, editEinsatz, prefillStartDate, prefillEndDate]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  async function handleSave() {
    if (saving) return; // Doppelklick-Schutz
    if (!projectId || !startDate || !endDate) return;

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
        adresse,
        start_date: startDate,
        end_date: endDate,
        ganztaegig,
        start_time: ganztaegig ? "" : startTime,
        end_time: ganztaegig ? "" : endTime,
        beschreibung,
        ...(editEinsatz ? { id: editEinsatz.id } : {}),
      });
      onOpenChange(false);
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
      <DialogContent className="sm:max-w-[480px]">
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
                <SelectTrigger>
                  <SelectValue placeholder="Projekt auswahlen..." />
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
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Ende <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Ganztaegig toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                Ganztaegig
              </Label>
              <Switch checked={ganztaegig} onCheckedChange={setGanztaegig} />
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
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Kommt bald
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {isEditing && onDelete ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Loschen..." : "Loschen"}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={!projectId || !startDate || !endDate || saving}
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
