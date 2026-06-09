import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BOARD_COLORS } from "./scheduleTypes";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableProjects: { id: string; name: string; geplanter_start?: string | null; geplantes_ende?: string | null }[];
  onSave: (projectId: string, color: string, startDate: string, endDate: string, beschreibung: string) => Promise<void>;
}

export function AddProjectToBoardDialog({ open, onOpenChange, availableProjects, onSave }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState("existing");
  const [projectId, setProjectId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [color, setColor] = useState(BOARD_COLORS[0]);
  const [customColor, setCustomColor] = useState("");
  const [saving, setSaving] = useState(false);

  // New project fields
  const [newName, setNewName] = useState("");
  const [newAdresse, setNewAdresse] = useState("");
  const [newPlz, setNewPlz] = useState("");
  const [newOrt, setNewOrt] = useState("");

  useEffect(() => {
    if (open) {
      setTab("existing");
      setProjectId("");
      setStartDate("");
      setEndDate("");
      setBeschreibung("");
      setColor(BOARD_COLORS[0]);
      setCustomColor("");
      setNewName("");
      setNewAdresse("");
      setNewPlz("");
      setNewOrt("");
    }
  }, [open]);

  useEffect(() => {
    if (projectId) {
      const proj = availableProjects.find(p => p.id === projectId);
      if (proj?.geplanter_start) setStartDate(proj.geplanter_start);
      if (proj?.geplantes_ende) setEndDate(proj.geplantes_ende);
    }
  }, [projectId, availableProjects]);

  const handleSaveExisting = async () => {
    if (!projectId) { toast({ variant: "destructive", title: "Bitte ein Projekt wählen" }); return; }
    if (!startDate || !endDate) { toast({ variant: "destructive", title: "Start und Ende erforderlich" }); return; }
    setSaving(true);
    try {
      await onSave(projectId, color, startDate, endDate, beschreibung);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNew = async () => {
    if (!newName.trim()) { toast({ variant: "destructive", title: "Projektname erforderlich" }); return; }
    if (!startDate || !endDate) { toast({ variant: "destructive", title: "Start und Ende erforderlich" }); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create the project first
      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          name: newName.trim(),
          adresse: newAdresse.trim() || null,
          plz: newPlz.trim() || null,
          ort: newOrt.trim() || null,
          status: "In Arbeit",
          geplanter_start: startDate,
          geplantes_ende: endDate,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: error.message });
        return;
      }

      if (project) {
        await onSave(project.id, color, startDate, endDate, beschreibung);
        toast({ title: "Projekt erstellt", description: newName.trim() });
      }
    } finally {
      setSaving(false);
    }
  };

  const colorPicker = (
    <div>
      <Label>Farbe</Label>
      <div className="flex flex-wrap gap-2 mt-2">
        {BOARD_COLORS.map(c => (
          <button
            key={c}
            type="button"
            className="w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center"
            style={{ backgroundColor: c, borderColor: color === c ? "#333" : "transparent" }}
            onClick={() => { setColor(c); setCustomColor(""); }}
          >
            {color === c && <Check className="h-4 w-4 text-gray-700" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Input
          type="color"
          value={customColor || color}
          onChange={e => { setCustomColor(e.target.value); setColor(e.target.value); }}
          className="w-10 h-8 p-0.5 cursor-pointer"
        />
        <span className="text-xs text-muted-foreground">Eigene Farbe</span>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Projekt hinzufügen</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">Bestehendes</TabsTrigger>
            <TabsTrigger value="new" className="flex-1">Neues</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-4 mt-4">
            <div>
              <Label>Projektname *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Suche ..." /></SelectTrigger>
                <SelectContent>
                  {availableProjects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start *</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div><Label>Ende *</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Projektbeschreibung ..." rows={2} />
            </div>
            {colorPicker}
          </TabsContent>

          <TabsContent value="new" className="space-y-4 mt-4">
            <div>
              <Label>Projektname *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Neues Projekt" />
            </div>
            <AddressAutocomplete
              label="Adresse"
              value={newAdresse}
              onChange={setNewAdresse}
              onSelect={(addr) => {
                setNewAdresse(addr.street);
                setNewPlz(addr.plz);
                setNewOrt(addr.ort);
              }}
              placeholder="Straße und Nr."
            />
            <div className="grid grid-cols-3 gap-3">
              <div><Label>PLZ</Label><Input value={newPlz} onChange={e => setNewPlz(e.target.value)} placeholder="PLZ" /></div>
              <div className="col-span-2"><Label>Ort</Label><Input value={newOrt} onChange={e => setNewOrt(e.target.value)} placeholder="Ort" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start *</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div><Label>Ende *</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Projektbeschreibung ..." rows={2} />
            </div>
            {colorPicker}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={tab === "existing" ? handleSaveExisting : handleSaveNew}
            disabled={saving}
          >
            {saving ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
