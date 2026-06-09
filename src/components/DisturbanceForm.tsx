import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, User, Mail, Phone, MapPin, FileText, Package, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton } from "@/components/DictateButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";
import { format } from "date-fns";
import { MultiEmployeeSelect } from "@/components/MultiEmployeeSelect";
import { CustomerSelect } from "@/components/CustomerSelect";

type MaterialEntry = {
  id: string;
  material: string;
  menge: string;
  einheit: string;
};

type DisturbanceFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editData?: {
    id: string;
    datum: string;
    start_time: string;
    end_time: string;
    pause_minutes: number;
    kunde_name: string;
    kunde_email: string | null;
    kunde_adresse: string | null;
    kunde_plz: string | null;
    kunde_ort: string | null;
    kunde_telefon: string | null;
    beschreibung: string;
    notizen: string | null;
  } | null;
  /** Wenn gesetzt: Projekt beim Öffnen des Formulars vorselektieren (Quick-Action aus ProjectOverview) */
  prefillProjectId?: string | null;
};

export const DisturbanceForm = ({ open, onOpenChange, onSuccess, editData, prefillProjectId }: DisturbanceFormProps) => {
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    datum: format(new Date(), "yyyy-MM-dd"),
    startTime: "08:00",
    endTime: "10:00",
    pauseMinutes: 0,
    kundeName: "",
    kundeEmail: "",
    kundeAdresse: "",
    kundePlz: "",
    kundeOrt: "",
    kundeTelefon: "",
    beschreibung: "",
    notizen: "",
  });

  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{id: string; name: string; customer_id: string | null}[]>([]);

  useEffect(() => {
    if (!open) {
      setSelectedCustomerId(null);
      setSelectedProjectId(null);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      supabase.from("projects").select("id, name, customer_id").not("status", "eq", "Abgeschlossen").order("name")
        .then(({ data }) => {
          if (data) {
            setProjects(data);
            // Prefill-Projekt aus Quick-Action (ProjectOverview): Kunde auto-füllen
            if (prefillProjectId && !editData) {
              setSelectedProjectId(prefillProjectId);
              const p = data.find((x) => x.id === prefillProjectId);
              if (p?.customer_id) {
                supabase.from("customers")
                  .select("id, name, adresse, plz, ort, email, telefon")
                  .eq("id", p.customer_id).single()
                  .then(({ data: cust }) => {
                    if (cust) {
                      setSelectedCustomerId(cust.id);
                      setFormData((prev) => ({
                        ...prev,
                        kundeName: cust.name,
                        kundeEmail: cust.email || "",
                        kundeAdresse: cust.adresse || "",
                        kundePlz: cust.plz || "",
                        kundeOrt: cust.ort || "",
                        kundeTelefon: cust.telefon || "",
                      }));
                    }
                  });
              }
            }
          }
        });
    }
  }, [open, prefillProjectId, editData]);

  useEffect(() => {
    if (editData) {
      setFormData({
        datum: editData.datum,
        startTime: editData.start_time.slice(0, 5),
        endTime: editData.end_time.slice(0, 5),
        pauseMinutes: editData.pause_minutes,
        kundeName: editData.kunde_name,
        kundeEmail: editData.kunde_email || "",
        kundeAdresse: editData.kunde_adresse || "",
        kundePlz: editData.kunde_plz || "",
        kundeOrt: editData.kunde_ort || "",
        kundeTelefon: editData.kunde_telefon || "",
        beschreibung: editData.beschreibung,
        notizen: editData.notizen || "",
      });
      // Load existing workers and materials when editing
      loadExistingWorkers(editData.id);
      loadExistingMaterials(editData.id);
    } else {
      // Reset form for new entry
      setFormData({
        datum: format(new Date(), "yyyy-MM-dd"),
        startTime: "08:00",
        endTime: "10:00",
        pauseMinutes: 0,
        kundeName: "",
        kundeEmail: "",
        kundeAdresse: "",
        kundePlz: "",
        kundeOrt: "",
        kundeTelefon: "",
        beschreibung: "",
        notizen: "",
      });
      setSelectedEmployees([]);
      setMaterials([]);
    }
  }, [editData, open]);

  const loadExistingWorkers = async (disturbanceId: string) => {
    const { data } = await supabase
      .from("disturbance_workers")
      .select("user_id, is_main")
      .eq("disturbance_id", disturbanceId);
    
    if (data) {
      // Only load non-main workers (main is the creator)
      const additionalWorkers = data.filter(w => !w.is_main).map(w => w.user_id);
      setSelectedEmployees(additionalWorkers);
    }
  };

  const loadExistingMaterials = async (disturbanceId: string) => {
    const { data } = await supabase
      .from("disturbance_materials")
      .select("id, material, menge, einheit")
      .eq("disturbance_id", disturbanceId);

    if (data) {
      setMaterials(data.map(m => ({
        id: m.id,
        material: m.material,
        menge: m.menge || "",
        einheit: (m as any).einheit || "Stk.",
      })));
    }
  };

  const calculateHours = (): number => {
    const [startH, startM] = formData.startTime.split(":").map(Number);
    const [endH, endM] = formData.endTime.split(":").map(Number);
    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - formData.pauseMinutes;
    return Math.max(0, totalMinutes / 60);
  };

  const addMaterial = () => {
    setMaterials([...materials, { id: crypto.randomUUID(), material: "", menge: "", einheit: "Stk." }]);
    // Auto-scroll to new material after render
    setTimeout(() => {
      const container = document.querySelector('[data-materials-list]');
      if (container) container.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const updateMaterial = (id: string, field: "material" | "menge" | "einheit", value: string) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, [field]: value } : m));
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

    // Validation
    if (!formData.kundeName.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Kundenname ist erforderlich" });
      setSaving(false);
      return;
    }

    if (!formData.beschreibung.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Arbeitsbeschreibung ist erforderlich" });
      setSaving(false);
      return;
    }

    const [startH, startM] = formData.startTime.split(":").map(Number);
    const [endH, endM] = formData.endTime.split(":").map(Number);
    if (endH * 60 + endM <= startH * 60 + startM) {
      toast({ variant: "destructive", title: "Fehler", description: "Endzeit muss nach Startzeit liegen" });
      setSaving(false);
      return;
    }

    const stunden = calculateHours();

    const disturbanceData = {
      user_id: user.id,
      datum: formData.datum,
      start_time: formData.startTime,
      end_time: formData.endTime,
      pause_minutes: formData.pauseMinutes,
      stunden,
      kunde_name: formData.kundeName.trim(),
      kunde_email: formData.kundeEmail.trim() || null,
      kunde_adresse: formData.kundeAdresse.trim() || null,
      kunde_plz: formData.kundePlz.trim() || null,
      kunde_ort: formData.kundeOrt.trim() || null,
      kunde_telefon: formData.kundeTelefon.trim() || null,
      beschreibung: formData.beschreibung.trim(),
      notizen: formData.notizen.trim() || null,
      project_id: selectedProjectId || null,
      customer_id: selectedCustomerId || null,
    };

    if (editData) {
      // Update existing
      const { error } = await supabase
        .from("disturbances")
        .update(disturbanceData)
        .eq("id", editData.id);

      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Regiebericht konnte nicht aktualisiert werden" });
        setSaving(false);
        return;
      }

      // Update workers
      await updateDisturbanceWorkers(editData.id, user.id, selectedEmployees);

      // Update materials
      await updateMaterials(editData.id, user.id);

      // Zeiteinträge für alle Mitarbeiter synchronisieren
      // Alte Einträge für diesen Regiebericht über Edge Function löschen + neu anlegen
      const allWorkerIds = [user.id, ...selectedEmployees];
      const timeEntries = allWorkerIds.map(workerId => ({
        user_id: workerId,
        datum: formData.datum,
        start_time: formData.startTime,
        end_time: formData.endTime,
        pause_minutes: formData.pauseMinutes,
        stunden,
        taetigkeit: `Regiearbeit: ${formData.beschreibung.trim().substring(0, 100)}`,
        location_type: "baustelle",
        project_id: null,
        disturbance_id: editData.id,
        notizen: `Regie-Zuordnung: ${editData.id}`,
      }));

      await supabase.functions.invoke("create-team-time-entries", {
        body: { entries: timeEntries, deleteDisturbanceId: editData.id },
      });

      toast({ title: "Erfolg", description: "Regiebericht wurde aktualisiert" });
    } else {
      // Create new disturbance
      const { data: newDisturbance, error } = await supabase
        .from("disturbances")
        .insert(disturbanceData)
        .select()
        .single();

      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Regiebericht konnte nicht erstellt werden" });
        setSaving(false);
        return;
      }

      // Add main worker entry
      await supabase.from("disturbance_workers").insert({
        disturbance_id: newDisturbance.id,
        user_id: user.id,
        is_main: true,
      });

      // Add worker entries for additional workers
      for (const workerId of selectedEmployees) {
        await supabase.from("disturbance_workers").insert({
          disturbance_id: newDisturbance.id,
          user_id: workerId,
          is_main: false,
        });
      }

      // Create materials
      const validMaterials = materials.filter(m => m.material.trim());
      if (validMaterials.length > 0) {
        await supabase.from("disturbance_materials").insert(
          validMaterials.map(m => ({
            disturbance_id: newDisturbance.id,
            user_id: user.id,
            material: m.material.trim(),
            menge: m.menge.trim() || null,
            einheit: m.einheit || "Stk.",
          }))
        );
      }

      // Automatisch Zeiteinträge für alle beteiligten Mitarbeiter anlegen
      // Nutzt Edge Function (Service Role) damit auch für andere User inserted werden kann
      const allWorkerIds = [user.id, ...selectedEmployees];
      const timeEntries = allWorkerIds.map(workerId => ({
        user_id: workerId,
        datum: formData.datum,
        start_time: formData.startTime,
        end_time: formData.endTime,
        pause_minutes: formData.pauseMinutes,
        stunden,
        taetigkeit: `Regiearbeit: ${formData.beschreibung.trim().substring(0, 100)}`,
        location_type: "baustelle",
        project_id: null,
        disturbance_id: newDisturbance.id,
        notizen: `Regie-Zuordnung: ${newDisturbance.id}`,
      }));

      await supabase.functions.invoke("create-team-time-entries", {
        body: { entries: timeEntries },
      });

      toast({ title: "Erfolg", description: "Regiebericht wurde erfasst" });

      setSaving(false);
      onOpenChange(false);

      // Navigate to detail page with signature dialog open
      navigate(`/disturbances/${newDisturbance.id}?openSignature=true`);
      return;
    }

    setSaving(false);
    onSuccess();
  };

  const updateDisturbanceWorkers = async (disturbanceId: string, mainUserId: string, newWorkerIds: string[]) => {
    // Get current workers
    const { data: currentWorkers } = await supabase
      .from("disturbance_workers")
      .select("user_id, is_main")
      .eq("disturbance_id", disturbanceId);

    const currentNonMainIds = (currentWorkers || [])
      .filter(w => !w.is_main)
      .map(w => w.user_id);

    // Workers to add
    const toAdd = newWorkerIds.filter(id => !currentNonMainIds.includes(id));
    
    // Workers to remove
    const toRemove = currentNonMainIds.filter(id => !newWorkerIds.includes(id));

    // Remove workers
    for (const workerId of toRemove) {
      await supabase
        .from("disturbance_workers")
        .delete()
        .eq("disturbance_id", disturbanceId)
        .eq("user_id", workerId);
    }

    // Add new workers
    for (const workerId of toAdd) {
      await supabase.from("disturbance_workers").insert({
        disturbance_id: disturbanceId,
        user_id: workerId,
        is_main: false,
      });
    }
  };

  const updateMaterials = async (disturbanceId: string, userId: string) => {
    // Delete existing materials
    await supabase
      .from("disturbance_materials")
      .delete()
      .eq("disturbance_id", disturbanceId);

    // Add new materials
    const validMaterials = materials.filter(m => m.material.trim());
    if (validMaterials.length > 0) {
      await supabase.from("disturbance_materials").insert(
        validMaterials.map(m => ({
          disturbance_id: disturbanceId,
          user_id: userId,
          material: m.material.trim(),
          menge: m.menge.trim() || null,
          einheit: m.einheit || "Stk.",
        }))
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {editData ? "Regiebericht bearbeiten" : "Neuen Regiebericht erfassen"}
          </DialogTitle>
          <DialogDescription>
            Erfassen Sie einen Service-Einsatz beim Kunden.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Date and Time Section */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Datum & Uhrzeit
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="datum">Datum</Label>
                <Input
                  id="datum"
                  type="date"
                  value={formData.datum}
                  onChange={(e) => setFormData({ ...formData, datum: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="startTime">Startzeit</Label>
                <Input
                  id="startTime"
                  type="time"
                  step={900}
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="endTime">Endzeit</Label>
                <Input
                  id="endTime"
                  type="time"
                  step={900}
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="pauseMinutes">Pause (Minuten)</Label>
                <Input
                  id="pauseMinutes"
                  type="number"
                  min="0"
                  value={formData.pauseMinutes}
                  onChange={(e) => setFormData({ ...formData, pauseMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-end">
                <div className="bg-muted rounded-md px-3 py-2 w-full text-center">
                  <span className="text-sm text-muted-foreground">Stunden: </span>
                  <span className="font-bold text-primary">{calculateHours().toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Projekt-Zuordnung */}
          <div className="space-y-2">
            <Label>Projekt (optional)</Label>
            <Select value={selectedProjectId || "none"} onValueChange={async (v) => {
              const projId = v === "none" ? null : v;
              setSelectedProjectId(projId);
              if (projId) {
                const project = projects.find(p => p.id === projId);
                if (project?.customer_id) {
                  const { data: cust } = await supabase.from("customers")
                    .select("id, name, adresse, plz, ort, email, telefon")
                    .eq("id", project.customer_id).single();
                  if (cust) {
                    setSelectedCustomerId(cust.id);
                    setFormData(prev => ({
                      ...prev,
                      kundeName: cust.name,
                      kundeEmail: cust.email || "",
                      kundeAdresse: cust.adresse || "",
                      kundePlz: cust.plz || "",
                      kundeOrt: cust.ort || "",
                      kundeTelefon: cust.telefon || "",
                    }));
                  }
                }
              }
            }}>
              <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Projekt</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Kundendaten
              </h3>
              <div className="w-[260px]">
                <CustomerSelect
                  value={selectedCustomerId}
                  onChange={(id, customer) => {
                    setSelectedCustomerId(id);
                    if (customer) {
                      setFormData(prev => ({
                        ...prev,
                        kundeName: customer.name,
                        kundeEmail: customer.email || "",
                        kundeAdresse: customer.adresse || "",
                        kundePlz: customer.plz || "",
                        kundeOrt: customer.ort || "",
                        kundeTelefon: customer.telefon || "",
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        kundeName: "",
                        kundeEmail: "",
                        kundeAdresse: "",
                        kundePlz: "",
                        kundeOrt: "",
                        kundeTelefon: "",
                      }));
                    }
                  }}
                  placeholder="Kunde auswählen"
                />
              </div>
            </div>
            {formData.kundeName ? (
              <div className="rounded-lg border p-3 bg-muted/30 space-y-1 text-sm">
                <div className="font-medium">{formData.kundeName}</div>
                {formData.kundeAdresse && <div className="text-muted-foreground">{formData.kundeAdresse}</div>}
                {(formData.kundePlz || formData.kundeOrt) && <div className="text-muted-foreground">{formData.kundePlz} {formData.kundeOrt}</div>}
                <div className="flex gap-4">
                  {formData.kundeEmail && <span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{formData.kundeEmail}</span>}
                  {formData.kundeTelefon && <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{formData.kundeTelefon}</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Bitte wählen Sie oben einen Kunden aus oder erstellen Sie einen neuen.</p>
            )}
          </div>

          {/* Multi-Employee Selection */}
          <MultiEmployeeSelect
            selectedEmployees={selectedEmployees}
            onSelectionChange={setSelectedEmployees}
            date={formData.datum}
            startTime={formData.startTime}
            endTime={formData.endTime}
          />

          {/* Work Description Section */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Arbeitsdetails
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="beschreibung">Durchgeführte Arbeit *</Label>
                  <DictateButton value={formData.beschreibung} onResult={(t) => setFormData({ ...formData, beschreibung: t })} />
                </div>
                <Textarea
                  id="beschreibung"
                  value={formData.beschreibung}
                  onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                  placeholder="Beschreiben Sie die durchgeführten Arbeiten..."
                  rows={4}
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notizen">Notizen (optional)</Label>
                  <DictateButton value={formData.notizen} onResult={(t) => setFormData({ ...formData, notizen: t })} />
                </div>
                <Textarea
                  id="notizen"
                  value={formData.notizen}
                  onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                  placeholder="Zusätzliche Bemerkungen..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Materials Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Verwendetes Material (optional)
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                <Plus className="h-4 w-4 mr-1" />
                Material
              </Button>
            </div>
            
            {materials.length > 0 && (
              <div className="space-y-2" data-materials-list>
                {materials.map((mat) => (
                  <div key={mat.id} className="flex gap-2 items-start">
                    <Input
                      placeholder="Material"
                      value={mat.material}
                      onChange={(e) => updateMaterial(mat.id, "material", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Menge"
                      value={mat.menge}
                      onChange={(e) => updateMaterial(mat.id, "menge", e.target.value)}
                      className="w-20"
                      type="number"
                      step="0.1"
                    />
                    <Select value={mat.einheit} onValueChange={(v) => updateMaterial(mat.id, "einheit", v)}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {einheiten.map(e => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMaterial(mat.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
        </div>

        {/* Sticky Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t bg-background flex-shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={(e) => { 
            e.preventDefault();
            const form = document.querySelector('form');
            if (form) form.requestSubmit();
          }} disabled={saving}>
            {saving ? "Speichern..." : editData ? "Aktualisieren" : "Regiebericht erfassen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
