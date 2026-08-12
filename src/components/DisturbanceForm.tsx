import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, User, Mail, Phone, MapPin, FileText, Package, Plus, Trash2, Save, Lock, Camera, Upload , Wrench } from "lucide-react";
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
  // Mitgefuehrt, damit sie beim Speichern nicht verloren gehen: Das Formular
  // synchronisiert per Loeschen-und-Neuanlegen. Wer sie hier nicht mitlaedt,
  // schreibt sie als NULL zurueck — Notiz und Preis der Materialzeile waren
  // nach jedem Bearbeiten des Regieberichts weg.
  notizen: string | null;
  einzelpreis: number | null;
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

  /** Maschinen-Buchungen (Kundenwunsch: „auch Maschinen buchen können").
   *  vehicleId = aus dem Maschinenstamm gewählt, sonst Freitext. */
  interface MaschinenEintrag {
    id: string;
    maschine: string;
    vehicleId: string | null;
    menge: string;
    einheit: string;
    einzelpreis: number | null;
  }
  const [maschinen, setMaschinen] = useState<MaschinenEintrag[]>([]);
  const [maschinenStamm, setMaschinenStamm] = useState<
    { id: string; bezeichnung: string; verrechnungssatz: number | null; verrechnungseinheit: string | null }[]
  >([]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("vehicles" as never) as any)
        .select("id, bezeichnung, verrechnungssatz, verrechnungseinheit")
        .eq("art", "maschine")
        .eq("aktiv", true)
        .order("bezeichnung");
      setMaschinenStamm((data as any) || []);
    })();
  }, []);

  const addMaschine = () => {
    setMaschinen((alt) => [...alt, {
      id: crypto.randomUUID(), maschine: "", vehicleId: null, menge: "", einheit: "h", einzelpreis: null,
    }]);
  };
  const removeMaschine = (id: string) => setMaschinen((alt) => alt.filter((m) => m.id !== id));
  /** Aus dem Stamm gewählt → Bezeichnung, Satz und Einheit übernehmen. */
  const waehleMaschine = (id: string, vehicleId: string) => {
    const v = maschinenStamm.find((x) => x.id === vehicleId);
    setMaschinen((alt) => alt.map((m) => m.id === id ? {
      ...m,
      vehicleId: v ? v.id : null,
      maschine: v ? v.bezeichnung : m.maschine,
      einzelpreis: v?.verrechnungssatz ?? m.einzelpreis,
      einheit: v?.verrechnungseinheit || m.einheit || "h",
    } : m));
  };
  const updateMaschine = (id: string, feld: "maschine" | "menge" | "einheit" | "einzelpreis", wert: string) => {
    setMaschinen((alt) => alt.map((m) => m.id === id ? {
      ...m,
      [feld]: feld === "einzelpreis"
        ? (wert.trim() === "" ? null : Number(wert.replace(",", ".")) || 0)
        : wert,
    } : m));
  };

  const ladeMaschinen = async (disturbanceId: string) => {
    const { data } = await (supabase.from("disturbance_maschinen" as never) as any)
      .select("id, maschine, vehicle_id, menge, einheit, einzelpreis")
      .eq("disturbance_id", disturbanceId);
    setMaschinen(((data as any) || []).map((m: any) => ({
      id: m.id, maschine: m.maschine, vehicleId: m.vehicle_id,
      menge: m.menge || "", einheit: m.einheit || "h", einzelpreis: m.einzelpreis ?? null,
    })));
  };

  const speichereMaschinen = async (disturbanceId: string, userId: string) => {
    await (supabase.from("disturbance_maschinen" as never) as any)
      .delete().eq("disturbance_id", disturbanceId);
    const gueltig = maschinen.filter((m) => m.maschine.trim());
    if (gueltig.length === 0) return;
    await (supabase.from("disturbance_maschinen" as never) as any).insert(
      gueltig.map((m) => ({
        disturbance_id: disturbanceId,
        user_id: userId,
        maschine: m.maschine.trim(),
        vehicle_id: m.vehicleId,
        menge: m.menge.trim() || null,
        einheit: m.einheit || "h",
        einzelpreis: m.einzelpreis,
      })),
    );
  };
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{id: string; name: string; customer_id: string | null}[]>([]);
  /** Fotos, die beim Speichern mit hochgeladen werden (Kundenwunsch: direkt
   *  beim Erstellen fotografieren oder aus den Dateien wählen). Die
   *  Vorschau-URL wird EINMAL beim Hinzufügen erzeugt — createObjectURL im
   *  JSX erzeugte bei jedem Tastendruck neue Blob-URLs (Review-Befund). */
  const [neueFotos, setNeueFotos] = useState<{ datei: File; url: string }[]>([]);
  const leereFotos = () => {
    setNeueFotos((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.url));
      return [];
    });
  };
  const fotoKameraRef = useRef<HTMLInputElement>(null);
  /** user_id des Berichts-Erstellers (is_main in disturbance_workers). */
  const [erstellerId, setErstellerId] = useState<string | null>(null);
  const fotoDateiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSelectedCustomerId(null);
      setSelectedProjectId(null);
      leereFotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Load existing workers, materials and machines when editing
      loadExistingWorkers(editData.id);
      loadExistingMaterials(editData.id);
      ladeMaschinen(editData.id);
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
      // Ersteller merken: Beim Bearbeiten durch den Admin dürfen die
      // Zeiteinträge NICHT auf den Admin umgebucht werden (Review-Befund —
      // der Monteur verlor seine Stunden).
      setErstellerId(data.find(w => w.is_main)?.user_id || null);
    }
  };

  const loadExistingMaterials = async (disturbanceId: string) => {
    const { data } = await supabase
      .from("disturbance_materials")
      .select("id, material, menge, einheit, notizen, einzelpreis")
      .eq("disturbance_id", disturbanceId);

    if (data) {
      setMaterials(data.map(m => ({
        id: m.id,
        material: m.material,
        menge: m.menge || "",
        einheit: (m as any).einheit || "Stk.",
        notizen: (m as any).notizen ?? null,
        einzelpreis: (m as any).einzelpreis ?? null,
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
    setMaterials([...materials, { id: crypto.randomUUID(), material: "", menge: "", einheit: "Stk.", notizen: null, einzelpreis: null }]);
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
      await speichereMaschinen(editData.id, user.id);

      // Zeiteinträge für alle Mitarbeiter synchronisieren
      // Alte Einträge für diesen Regiebericht über Edge Function löschen + neu anlegen.
      // Hauptperson = der ERSTELLER des Berichts, nicht wer gerade bearbeitet.
      const hauptId = erstellerId || user.id;
      const allWorkerIds = [hauptId, ...selectedEmployees.filter((id) => id !== hauptId)];
      const timeEntries = allWorkerIds.map(workerId => ({
        user_id: workerId,
        datum: formData.datum,
        start_time: formData.startTime,
        end_time: formData.endTime,
        pause_minutes: formData.pauseMinutes,
        stunden,
        taetigkeit: `Regiearbeit: ${formData.beschreibung.trim().substring(0, 100)}`,
        location_type: "baustelle",
        // Regiestunden laufen aufs gewählte Projekt (Kundenwunsch) — das
        // Projekt weist sie über disturbance_id getrennt als Regie aus.
        project_id: selectedProjectId || null,
        disturbance_id: editData.id,
        notizen: `Regie-Zuordnung: ${editData.id}`,
      }));

      const teRes = await supabase.functions.invoke("create-team-time-entries", {
        body: { entries: timeEntries, deleteDisturbanceId: editData.id },
      });
      warnIfTimeEntriesFailed(teRes);

      if (neueFotos.length > 0) {
        await ladeFotosHoch(editData.id, user.id);
      }
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

      // Gebuchte Maschinen (Kreissäge, Plattensäge, Handwerkzeug …)
      await speichereMaschinen(newDisturbance.id, user.id);

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
        // Regiestunden laufen aufs gewählte Projekt (Kundenwunsch) — das
        // Projekt weist sie über disturbance_id getrennt als Regie aus.
        project_id: selectedProjectId || null,
        disturbance_id: newDisturbance.id,
        notizen: `Regie-Zuordnung: ${newDisturbance.id}`,
      }));

      const teRes = await supabase.functions.invoke("create-team-time-entries", {
        body: { entries: timeEntries },
      });
      warnIfTimeEntriesFailed(teRes);

      // Beim Erstellen mitgegebene Fotos jetzt hochladen (Kundenwunsch).
      if (neueFotos.length > 0) {
        await ladeFotosHoch(newDisturbance.id, user.id);
      }

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

  /**
   * Ausgewählte Fotos zum gespeicherten Bericht hochladen — derselbe Weg wie
   * auf der Detailseite (Bucket disturbance-photos + Tabelle disturbance_photos).
   * Fehler brechen das Speichern NICHT ab; der Bericht ist wichtiger.
   */
  const ladeFotosHoch = async (disturbanceId: string, userId: string) => {
    let ok = 0;
    for (const { datei } of neueFotos) {
      if (!datei.type.startsWith("image/")) continue;
      if (datei.size > 10 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Foto zu groß", description: `${datei.name} ist größer als 10 MB und wurde übersprungen.` });
        continue;
      }
      const pfad = `${disturbanceId}/${Date.now()}_${datei.name}`;
      const { error: upErr } = await supabase.storage.from("disturbance-photos").upload(pfad, datei);
      if (upErr) continue;
      const { error: dbErr } = await supabase.from("disturbance_photos").insert({
        disturbance_id: disturbanceId,
        user_id: userId,
        file_path: pfad,
        file_name: datei.name,
      });
      if (dbErr) {
        await supabase.storage.from("disturbance-photos").remove([pfad]);
        continue;
      }
      ok++;
    }
    if (neueFotos.length > 0 && ok < neueFotos.length) {
      toast({ variant: "destructive", title: "Nicht alle Fotos hochgeladen", description: `${ok} von ${neueFotos.length} Fotos gespeichert — Rest bitte auf der Berichtsseite nachholen.` });
    }
    leereFotos();
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
          notizen: m.notizen ?? null,
          einzelpreis: m.einzelpreis ?? null,
        }))
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Am Handy fast bildschirmfüllend — der Regiebericht wird
          draußen am Bau ausgefüllt (Kundenwunsch: fürs Handy ausgelegt). */}
      <DialogContent className="max-w-lg h-[96dvh] max-h-[96dvh] w-[calc(100vw-0.75rem)] sm:h-auto sm:max-h-[90vh] sm:w-auto p-4 sm:p-6 flex flex-col overflow-hidden">
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
          {/* 1. Projekt zuerst (Kundenwunsch): Wahl des Projekts füllt den
              Kunden automatisch. Ohne Projekt wird der Kunde darunter direkt
              gewählt oder neu angelegt. Bestimmt auch den Projektordner. */}
          <div className="space-y-2">
            <Label className="font-medium">Projekt (füllt den Kunden automatisch)</Label>
            <Select value={selectedProjectId || "none"} onValueChange={async (v) => {
              const projId = v === "none" ? null : v;
              setSelectedProjectId(projId);
              if (!projId) {
                // Automatisch übernommenen Kunden wieder freigeben, damit die
                // Auswahl unten nicht mit dem alten Projektkunden vorbelegt bleibt.
                setSelectedCustomerId(null);
                setFormData(prev => ({
                  ...prev,
                  kundeName: "", kundeEmail: "", kundeAdresse: "",
                  kundePlz: "", kundeOrt: "", kundeTelefon: "",
                }));
              }
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

          {/* 2. Kunde — kommt aus dem Projekt; ohne Projekt hier wählen oder
              neu anlegen („+ Neuer Kunde" steht im Dropdown ganz oben). */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 font-medium">
              <User className="h-4 w-4" />
              Kunde *
            </Label>
            {selectedProjectId && formData.kundeName ? null : (
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
              placeholder="Kunde auswählen oder neu anlegen"
              className="h-11 w-full"
            />
            )}
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
                Oben ein Projekt wählen — der Kunde wird automatisch eingesetzt.
                Ohne Projekt: Kunde hier auswählen oder „+ Neuer Kunde" anlegen.
              </p>
            )}
            {selectedProjectId && formData.kundeName && (
              <p className="text-xs text-muted-foreground">
                Kunde kommt aus dem Projekt. Zum Ändern oben „Kein Projekt" wählen.
              </p>
            )}
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

          {/* Fotos — direkt beim Erfassen aufnehmen oder aus den Dateien
              wählen (Kundenwunsch). Hochgeladen wird beim Speichern; danach
              sind sie auf der Berichtsseite unter „Fotos" zu sehen. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Fotos (optional)
                {neueFotos.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">({neueFotos.length})</span>
                )}
              </h3>
              <div className="flex gap-2">
                <Button type="button" className="h-11" onClick={() => fotoKameraRef.current?.click()} disabled={isLocked}>
                  <Camera className="h-4 w-4 mr-1" /> Foto
                </Button>
                <Button type="button" variant="outline" className="h-11 w-11 p-0" aria-label="Fotos aus Dateien wählen"
                  onClick={() => fotoDateiRef.current?.click()} disabled={isLocked}>
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <input ref={fotoKameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const neue = Array.from(e.target.files || []).map((d) => ({ datei: d, url: URL.createObjectURL(d) })); setNeueFotos((prev) => [...prev, ...neue]); e.target.value = ""; }} />
            <input ref={fotoDateiRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { const neue = Array.from(e.target.files || []).map((d) => ({ datei: d, url: URL.createObjectURL(d) })); setNeueFotos((prev) => [...prev, ...neue]); e.target.value = ""; }} />
            {neueFotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {neueFotos.map((f, i) => (
                  <div key={f.url} className="relative aspect-square">
                    <img src={f.url} alt={f.datei.name} className="h-full w-full rounded-md object-cover" />
                    <Button type="button" variant="destructive" size="icon" aria-label="Foto entfernen"
                      className="absolute bottom-1 right-1 h-9 w-9 opacity-90"
                      onClick={() => setNeueFotos((prev) => {
                        URL.revokeObjectURL(f.url);
                        return prev.filter((_, j) => j !== i);
                      })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Die Fotos werden beim Speichern zum Bericht hochgeladen.</p>
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

          {/* Maschinen (Kundenwunsch): Kreissäge, Plattensäge, Handwerkzeug …
              Auswahl aus dem Maschinen-Manager übernimmt den Verrechnungssatz;
              nicht angelegtes Gerät geht als Freitext. */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Maschinen / Werkzeug (optional)
              </h3>
              <Button type="button" variant="outline" className="h-11" onClick={addMaschine}>
                <Plus className="h-4 w-4 mr-1" />
                Maschine
              </Button>
            </div>

            {maschinen.length > 0 && (
              <div className="space-y-3">
                {maschinen.map((ma) => (
                  <div key={ma.id} className="rounded-lg border bg-muted/20 p-2 space-y-2">
                    {maschinenStamm.length > 0 && (
                      <Select
                        value={ma.vehicleId || "frei"}
                        onValueChange={(v) => v === "frei"
                          ? setMaschinen((alt2) => alt2.map((x) => x.id === ma.id ? { ...x, vehicleId: null } : x))
                          : waehleMaschine(ma.id, v)}
                      >
                        <SelectTrigger className="h-11" aria-label="Maschine wählen">
                          <SelectValue placeholder="Aus dem Maschinen-Manager wählen…" />
                        </SelectTrigger>
                        <SelectContent>
                          {maschinenStamm.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.bezeichnung}
                              {v.verrechnungssatz != null ? ` — € ${Number(v.verrechnungssatz).toFixed(2)}/${v.verrechnungseinheit || "h"}` : ""}
                            </SelectItem>
                          ))}
                          <SelectItem value="frei">Freie Eingabe …</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      placeholder="Maschine / Werkzeug (z. B. Kreissäge)"
                      value={ma.maschine}
                      onChange={(e) => updateMaschine(ma.id, "maschine", e.target.value)}
                      className="h-11 w-full"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Menge"
                        inputMode="decimal"
                        value={ma.menge}
                        onChange={(e) => updateMaschine(ma.id, "menge", e.target.value)}
                        className="h-11 w-24"
                      />
                      <Select value={ma.einheit} onValueChange={(v) => updateMaschine(ma.id, "einheit", v)}>
                        <SelectTrigger className="h-11 w-28" aria-label="Einheit"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="h">Stunden</SelectItem>
                          <SelectItem value="Tag">Tage</SelectItem>
                          <SelectItem value="Einsatz">Einsatz</SelectItem>
                          <SelectItem value="Stk.">Stück</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="relative flex-1">
                        <Input
                          placeholder="Satz"
                          inputMode="decimal"
                          value={ma.einzelpreis ?? ""}
                          onChange={(e) => updateMaschine(ma.id, "einzelpreis", e.target.value)}
                          className="h-11 pr-7"
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Maschine entfernen"
                        onClick={() => removeMaschine(ma.id)}
                        className="h-11 w-11 shrink-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                    {ma.menge.trim() && ma.einzelpreis != null && (
                      <p className="text-right text-xs text-muted-foreground">
                        Gesamt: € {((Number(ma.menge.replace(",", ".")) || 0) * ma.einzelpreis).toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {maschinenStamm.length === 0 && maschinen.length > 0 && (
              <p className="text-xs text-amber-600">
                Noch keine Maschinen angelegt — im KFZ- und Maschinen-Manager anlegen, dann
                erscheinen sie hier mit ihrem Verrechnungssatz zur Auswahl.
              </p>
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
