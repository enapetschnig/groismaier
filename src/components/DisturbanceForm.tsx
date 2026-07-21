import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, User, Mail, Phone, MapPin, FileText, Package, Plus, Trash2, Save, Lock } from "lucide-react";
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
    status?: string;
    project_id?: string | null;
    customer_id?: string | null;
  } | null;
  /** Wenn gesetzt: Projekt beim Öffnen des Formulars vorselektieren (Quick-Action aus ProjectOverview) */
  prefillProjectId?: string | null;
};

export const DisturbanceForm = ({ open, onOpenChange, onSuccess, editData, prefillProjectId }: DisturbanceFormProps) => {
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isLocked = editData?.status === "abgeschlossen";

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
      // Bestehende Projekt-/Kundenzuordnung übernehmen — sonst würde ein
      // "Aktualisieren" die Zuordnung auf null zurücksetzen.
      setSelectedProjectId(editData.project_id ?? null);
      setSelectedCustomerId(editData.customer_id ?? null);
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

  /**
   * Die Stunden werden zusätzlich in die Zeiterfassung gebucht. Schlägt das
   * fehl (z. B. weil für den Zeitblock schon ein Eintrag existiert), darf das
   * den Regiebericht NICHT kippen — der Chef muss es aber erfahren, sonst
   * fehlen die Stunden unbemerkt.
   */
  const warnIfTimeEntriesFailed = (res: { data?: any; error?: any }) => {
    const failed = !!res?.error || res?.data?.success === false;
    if (!failed) return;
    const msg: string = res?.data?.error || res?.error?.message || "";
    const duplicate = msg.includes("unique") || msg.includes("duplicate");
    toast({
      title: "Stunden nicht gebucht",
      description: duplicate
        ? "Für diesen Zeitraum gibt es bereits einen Zeiteintrag — die Regiestunden wurden NICHT zusätzlich gebucht."
        : "Die Regiestunden konnten nicht automatisch in die Zeiterfassung übernommen werden.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Abgeschlossene Regieberichte sind gesperrt (Wieder-Öffnen nur für Admin).
    if (editData?.status === "abgeschlossen") {
      toast({
        variant: "destructive",
        title: "Abgeschlossen",
        description: "Dieser Regiebericht ist abgeschlossen und kann nicht mehr bearbeitet werden.",
      });
      return;
    }

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

      const teRes = await supabase.functions.invoke("create-team-time-entries", {
        body: { entries: timeEntries, deleteDisturbanceId: editData.id },
      });
      warnIfTimeEntriesFailed(teRes);

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

      const teRes = await supabase.functions.invoke("create-team-time-entries", {
        body: { entries: timeEntries },
      });
      warnIfTimeEntriesFailed(teRes);

      toast({
        title: "Gespeichert",
        description: "Regiebericht als Entwurf gespeichert. Die Unterschrift kann jederzeit später geholt werden.",
      });

      setSaving(false);
      onOpenChange(false);

      // Bewusst OHNE Unterschrifts-Dialog: Speichern und Unterschreiben sind
      // getrennte Schritte. Auf der Detailseite gibt es den Button
      // „Zur Unterschrift".
      navigate(`/disturbances/${newDisturbance.id}`);
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
            Erfassen Sie einen Service-Einsatz beim Kunden. Speichern geht jederzeit —
            die Unterschrift wird später mit einem eigenen Button geholt.
          </DialogDescription>
        </DialogHeader>

        {isLocked && (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex-shrink-0">
            <Lock className="h-4 w-4 shrink-0" />
            Dieser Regiebericht ist abgeschlossen und kann nicht mehr geändert werden.
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-1">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          {/* 1. Kunde — steht ganz oben, weil er am Bau zuerst gewählt wird */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 font-medium">
              <User className="h-4 w-4" />
              Kunde *
            </Label>
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
              className="h-11 w-full"
            />
            {formData.kundeName ? (
              <div className="rounded-lg border p-3 bg-muted/30 space-y-1 text-sm">
                <div className="font-medium">{formData.kundeName}</div>
                {formData.kundeAdresse && <div className="text-muted-foreground">{formData.kundeAdresse}</div>}
                {(formData.kundePlz || formData.kundeOrt) && <div className="text-muted-foreground">{formData.kundePlz} {formData.kundeOrt}</div>}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {formData.kundeEmail && <span className="text-muted-foreground flex items-center gap-1 break-all"><Mail className="h-3 w-3 shrink-0" />{formData.kundeEmail}</span>}
                  {formData.kundeTelefon && <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{formData.kundeTelefon}</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Kunde oben auswählen oder im Dropdown „Neuer Kunde" anlegen.
              </p>
            )}
          </div>

          {/* 2. Projekt-Zuordnung (bestimmt den Projektordner für das PDF) */}
          <div className="space-y-2">
            <Label>Projekt (optional — Bericht landet im Projektordner)</Label>
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
              <SelectTrigger className="h-11"><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Projekt</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Datum & Uhrzeit */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Datum & Uhrzeit
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="col-span-2">
                <Label htmlFor="datum">Datum</Label>
                <Input
                  id="datum"
                  type="date"
                  className="h-11"
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
                  className="h-11"
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
                  className="h-11"
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
                  inputMode="numeric"
                  className="h-11"
                  value={formData.pauseMinutes}
                  onChange={(e) => setFormData({ ...formData, pauseMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-end">
                <div className="bg-muted rounded-md px-3 h-11 w-full flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">Stunden:&nbsp;</span>
                  <span className="font-bold text-primary">{calculateHours().toFixed(2)}</span>
                </div>
              </div>
            </div>
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
                  <DictateButton className="h-11 px-3" value={formData.beschreibung} onResult={(t) => setFormData({ ...formData, beschreibung: t })} />
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
                  <DictateButton className="h-11 px-3" value={formData.notizen} onResult={(t) => setFormData({ ...formData, notizen: t })} />
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
              <Button type="button" variant="outline" className="h-11" onClick={addMaterial}>
                <Plus className="h-4 w-4 mr-1" />
                Material
              </Button>
            </div>
            
            {materials.length > 0 && (
              <div className="space-y-3" data-materials-list>
                {materials.map((mat) => (
                  <div key={mat.id} className="rounded-lg border p-2 space-y-2 bg-muted/20">
                    <Input
                      placeholder="Material / Bezeichnung"
                      value={mat.material}
                      onChange={(e) => updateMaterial(mat.id, "material", e.target.value)}
                      className="h-11 w-full"
                    />
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="Menge"
                        value={mat.menge}
                        onChange={(e) => updateMaterial(mat.id, "menge", e.target.value)}
                        className="h-11 flex-1 min-w-0"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                      />
                      <Select value={mat.einheit} onValueChange={(v) => updateMaterial(mat.id, "einheit", v)}>
                        <SelectTrigger className="h-11 w-24 shrink-0"><SelectValue /></SelectTrigger>
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
                        aria-label="Material entfernen"
                        onClick={() => removeMaterial(mat.id)}
                        className="h-11 w-11 shrink-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
        </div>

        {/* Sticky Actions — Speichern ist ein EIGENER Schritt, die Unterschrift
            wird erst später auf der Detailseite geholt. */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end pt-3 border-t bg-background flex-shrink-0">
          <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            className="h-12 sm:h-10 text-base sm:text-sm"
            onClick={(e) => {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }}
            disabled={saving || isLocked}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Speichern…" : editData ? "Änderungen speichern" : "Speichern (ohne Unterschrift)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
