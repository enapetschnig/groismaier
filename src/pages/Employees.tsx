import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, User, FileText, Clock, Mail, Phone, MapPin, FileSpreadsheet, Shirt, Trash2, EyeOff, Eye } from "lucide-react";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { format } from "date-fns";
import { parseDecimal, formatForInput } from "@/lib/num";
import EmployeeDocumentsManager from "@/components/EmployeeDocumentsManager";

interface Employee {
  id: string;
  user_id: string | null;
  vorname: string;
  nachname: string;
  geburtsdatum: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  sv_nummer: string | null;
  eintritt_datum: string | null;
  austritt_datum: string | null;
  position: string | null;
  beschaeftigung_art: string | null;
  stundenlohn: number | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  kleidungsgroesse: string | null;
  schuhgroesse: string | null;
  notizen: string | null;
  /** Aktiv-Kennzeichen (Migration 20260413300000). Inaktive Mitarbeiter
   *  verschwinden aus allen „WHERE aktiv = true"-Auswahllisten. */
  aktiv: boolean | null;
  /** Standard-Fahrzeug (Migration 20260719100000, nicht in types.ts) */
  standard_vehicle_id?: string | null;
}

/** Aktive Fahrzeuge für die Standard-Fahrzeug-Auswahl. */
interface VehicleOption {
  id: string;
  bezeichnung: string;
  kennzeichen: string | null;
}

/** Benutzerkonto (profiles) für die Verknüpfung employees.user_id. */
interface ProfileOption {
  id: string;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
}

/** Sentinel für „kein Standard-Fahrzeug" — Radix-Select erlaubt kein value="". */
const NO_VEHICLE = "__none__";
/** Sentinel für „kein Benutzerkonto verknüpft". */
const NO_USER = "__nouser__";

export default function Employees() {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<Employee>>({});
  const [newEmployee, setNewEmployee] = useState({ vorname: "", nachname: "", email: "" });
  const [showSizesDialog, setShowSizesDialog] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  /** Inaktive (ausgetretene) Mitarbeiter ein-/ausblenden. */
  const [showInactive, setShowInactive] = useState(false);
  /** Mitarbeiter, für den die Löschabfrage offen ist. */
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Roh-Text des Stundenlohn-Feldes (damit „25,“ beim Tippen nicht zerfällt). */
  const [stundenlohnText, setStundenlohnText] = useState("");

  useEffect(() => {
    checkAdminAccess();
    fetchEmployees();
    fetchVehicles();
    fetchProfileOptions();
  }, []);

  // Benutzerkonten für die Verknüpfung „Mitarbeiter ↔ Login".
  // Ohne diese Verknüpfung greifen alle user_id-basierten Funktionen nicht
  // (u. a. das Standard-Fahrzeug in der Zeiterfassung).
  const fetchProfileOptions = async () => {
    const { data } = await (supabase.from("profiles" as never) as any)
      .select("id, vorname, nachname, email")
      .eq("hidden", false)
      .order("nachname");
    setProfileOptions(((data as ProfileOption[]) || []));
  };

  // Aktive Fahrzeuge für das Feld „Standard-Fahrzeug".
  // vehicles ist nicht in types.ts erfasst → untypisierter Client.
  const fetchVehicles = async () => {
    const { data } = await (supabase.from("vehicles" as never) as any)
      .select("id, bezeichnung, kennzeichen")
      .eq("aktiv", true)
      .order("bezeichnung");
    setVehicles(((data as VehicleOption[]) || []));
  };

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (data?.role !== "administrator") {
      toast({ title: "Keine Berechtigung", description: "Nur Administratoren können auf diese Seite zugreifen", variant: "destructive" });
      navigate("/");
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    const [{ data, error }, { data: hiddenProfs }] = await Promise.all([
      supabase.from("employees").select("*").order("nachname"),
      (supabase.from("profiles" as never) as any).select("id").eq("hidden", true),
    ]);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      const hiddenIds = new Set(((hiddenProfs as any[]) || []).map((p: any) => p.id));
      setEmployees((data || []).filter((e: any) => !e.user_id || !hiddenIds.has(e.user_id)));
    }
    setLoading(false);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data, error } = await supabase
        .from("employees")
        .insert({
          vorname: newEmployee.vorname,
          nachname: newEmployee.nachname,
          email: newEmployee.email || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Erfolg", description: "Mitarbeiter wurde angelegt" });
      setShowCreateDialog(false);
      setNewEmployee({ vorname: "", nachname: "", email: "" });
      fetchEmployees();
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    try {
      // `as any`: formData enthält standard_vehicle_id, das (noch) nicht in
      // src/integrations/supabase/types.ts steht (Migration 20260719100000).
      const { error } = await supabase
        .from("employees")
        .update(formData as any)
        .eq("id", selectedEmployee.id);

      if (error) throw error;

      toast({ title: "Erfolg", description: "Änderungen gespeichert" });
      fetchEmployees();
      setSelectedEmployee(null);
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  /**
   * Mitarbeiter löschen — aber nur, wenn wirklich nichts daran hängt.
   *
   * Stundenbuchungen sind der häufigste Grund, warum ein Datensatz bleiben
   * muss (Nachkalkulation, Lohnverrechnung, Aufbewahrungspflicht). Deshalb
   * wird VOR dem Löschen geprüft und im Zweifel „inaktiv setzen" angeboten,
   * statt den Anwender in einen rohen Postgres-Fehler laufen zu lassen.
   */
  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    setDeleting(true);
    try {
      // 1) Stundenbuchungen? (time_entries hängen am Login, nicht am Mitarbeiter)
      if (employeeToDelete.user_id) {
        const { count } = await supabase
          .from("time_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", employeeToDelete.user_id);
        if ((count ?? 0) > 0) {
          toast({
            title: "Löschen nicht möglich",
            description:
              `Für ${employeeToDelete.vorname} ${employeeToDelete.nachname} sind ${count} Stundenbuchungen erfasst. ` +
              "Diese werden für Nachkalkulation und Lohnverrechnung gebraucht. " +
              "Setze den Mitarbeiter stattdessen auf „Inaktiv“ — er verschwindet dann aus allen Auswahllisten.",
            variant: "destructive",
          });
          setDeleting(false);
          setEmployeeToDelete(null);
          return;
        }
      }

      // 2) Verknüpftes Benutzerkonto? Dann gehört das Löschen in den Admin-Bereich,
      //    weil auch profiles/user_roles/auth.users aufgeräumt werden müssen.
      if (employeeToDelete.user_id) {
        toast({
          title: "Löschen nicht möglich",
          description:
            "Diesem Mitarbeiter ist ein Benutzerkonto (Login) zugeordnet. " +
            "Bitte im Admin-Bereich unter „Registrierte Benutzer“ löschen — " +
            "dort werden Zugang, Rollen und Mitarbeiterdaten gemeinsam entfernt.",
          variant: "destructive",
        });
        setDeleting(false);
        setEmployeeToDelete(null);
        return;
      }

      const { error } = await supabase.from("employees").delete().eq("id", employeeToDelete.id);
      if (error) {
        // 23503 = foreign_key_violation → irgendwo wird der Mitarbeiter noch referenziert
        const fk = error.code === "23503";
        toast({
          title: "Löschen nicht möglich",
          description: fk
            ? "Der Mitarbeiter ist noch mit Projekten, Berichten oder Plantafel-Einträgen verknüpft. " +
              "Setze ihn stattdessen auf „Inaktiv“."
            : error.message,
          variant: "destructive",
        });
        setDeleting(false);
        setEmployeeToDelete(null);
        return;
      }

      toast({ title: "Gelöscht", description: `${employeeToDelete.vorname} ${employeeToDelete.nachname} wurde entfernt.` });
      setEmployeeToDelete(null);
      setSelectedEmployee(null);
      fetchEmployees();
    } finally {
      setDeleting(false);
    }
  };

  /** Aktiv/Inaktiv sofort umschalten (ohne den ganzen Datensatz zu speichern). */
  const toggleAktiv = async (emp: Employee, aktiv: boolean) => {
    const { error } = await supabase.from("employees").update({ aktiv }).eq("id", emp.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    setFormData((prev) => ({ ...prev, aktiv }));
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, aktiv } : e)));
    toast({
      title: aktiv ? "Mitarbeiter aktiv" : "Mitarbeiter inaktiv",
      description: aktiv
        ? "Er erscheint wieder in Zeiterfassung, Plantafel und Auswahllisten."
        : "Er verschwindet aus Zeiterfassung, Plantafel und Auswahllisten — die Daten bleiben erhalten.",
    });
  };

  useEffect(() => {
    if (selectedEmployee) {
      setFormData(selectedEmployee);
      setStundenlohnText(formatForInput(selectedEmployee.stundenlohn));
    }
  }, [selectedEmployee]);

  /** Sichtbare Mitarbeiter — inaktive nur auf Wunsch. */
  const visibleEmployees = employees.filter((e) => showInactive || e.aktiv !== false);
  const inactiveCount = employees.filter((e) => e.aktiv === false).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Lade Mitarbeiter...</p>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      {/* KingBill-Werkzeugleiste statt eigenem Kopf — „Zurück" ist Pflicht,
          weil die App keine Sidebar hat. */}
      <KBToolbar onBack={zurueck} title="Mitarbeiter">
        <KBToolbarButton
          icon={Plus}
          iconClassName="text-kb-green"
          label="Neuer Mitarbeiter"
          onClick={() => setShowCreateDialog(true)}
        />
        <KBToolbarButton
          icon={Shirt}
          label="Größen"
          title="Arbeitskleidung- & Schuhgrößen-Übersicht"
          onClick={() => setShowSizesDialog(true)}
        />
        {inactiveCount > 0 && (
          <KBToolbarButton
            icon={showInactive ? EyeOff : Eye}
            /* Kurzes Label: lange Beschriftungen sprengen die Toolbar auf 390 px. */
            label={showInactive ? "Nur aktive" : `Inaktive (${inactiveCount})`}
            title="Ausgetretene bzw. inaktiv gesetzte Mitarbeiter ein-/ausblenden"
            onClick={() => setShowInactive((v) => !v)}
          />
        )}
      </KBToolbar>

      <div className="container mx-auto p-3 sm:p-4">
      {employees.length === 0 && (
        <div className="kb-panel p-8 text-center">
          <User className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="mb-1 text-lg font-semibold">Noch keine Mitarbeiter</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Lege deine Mitarbeiter an, um Stundenlohn, Standard-Fahrzeug und Dokumente zu pflegen.
          </p>
          <Button className="h-11" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Mitarbeiter anlegen
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleEmployees.map((emp) => (
          <Card
            key={emp.id}
            className={`cursor-pointer transition-shadow hover:shadow-lg ${
              emp.aktiv === false ? "opacity-60" : ""
            }`}
            onClick={() => setSelectedEmployee(emp)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Avatar>
                  <AvatarFallback>
                    {emp.vorname[0]}
                    {emp.nachname[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate">
                  {emp.vorname} {emp.nachname}
                </span>
                {emp.aktiv === false && (
                  <span className="ml-auto shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Inaktiv
                  </span>
                )}
              </CardTitle>
              <CardDescription>{emp.position || "Mitarbeiter"}</CardDescription>
            </CardHeader>

            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  {emp.email || "Keine E-Mail"}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {emp.telefon || "Keine Telefonnummer"}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  {emp.plz} {emp.ort || "Kein Ort"}
                </div>
                {emp.eintritt_datum && (
                  <div className="text-muted-foreground mt-2">
                    Seit: {format(new Date(emp.eintritt_datum), "dd.MM.yyyy")}
                  </div>
                )}
                {/* Für den Chef auf einen Blick: Lohn, Standard-Fahrzeug und
                    ob überhaupt ein Login verknüpft ist. */}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {emp.stundenlohn != null && (
                    <span className="rounded bg-muted px-2 py-0.5">
                      € {Number(emp.stundenlohn).toFixed(2)}/h
                    </span>
                  )}
                  {emp.standard_vehicle_id && (
                    <span className="rounded bg-muted px-2 py-0.5">
                      🚚 {vehicles.find((v) => v.id === emp.standard_vehicle_id)?.bezeichnung || "Fahrzeug"}
                    </span>
                  )}
                  {!emp.user_id && (
                    <span
                      className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      title="Ohne Benutzerkonto greifen Zeiterfassung, Standard-Fahrzeug und Stundenauswertung nicht."
                    >
                      kein Login verknüpft
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail-Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedEmployee?.vorname} {selectedEmployee?.nachname}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="stammdaten">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="stammdaten">
                <User className="w-4 h-4 mr-2" />
                Stammdaten
              </TabsTrigger>
              <TabsTrigger value="dokumente">
                <FileText className="w-4 h-4 mr-2" />
                Dokumente
              </TabsTrigger>
              <TabsTrigger value="stunden">
                <Clock className="w-4 h-4 mr-2" />
                Überstunden
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Stammdaten */}
            <TabsContent value="stammdaten">
              <ScrollArea className="h-[62vh] sm:h-[500px] pr-4">
                <form onSubmit={handleSaveEmployee} className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Persönliche Daten</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Vorname *</Label>
                        <Input
                          value={formData.vorname || ""}
                          onChange={(e) => setFormData({ ...formData, vorname: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label>Nachname *</Label>
                        <Input
                          value={formData.nachname || ""}
                          onChange={(e) => setFormData({ ...formData, nachname: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label>Geburtsdatum</Label>
                        <Input
                          type="date"
                          value={formData.geburtsdatum || ""}
                          onChange={(e) => setFormData({ ...formData, geburtsdatum: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Kontaktdaten</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Label>Adresse</Label>
                        <Input
                          value={formData.adresse || ""}
                          onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                          placeholder="Straße und Hausnummer"
                        />
                      </div>
                      <div>
                        <Label>PLZ</Label>
                        <Input
                          value={formData.plz || ""}
                          onChange={(e) => setFormData({ ...formData, plz: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Ort</Label>
                        <Input
                          value={formData.ort || ""}
                          onChange={(e) => setFormData({ ...formData, ort: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Telefon</Label>
                        <Input
                          type="tel"
                          value={formData.telefon || ""}
                          onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>E-Mail</Label>
                        <Input
                          type="email"
                          value={formData.email || ""}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Beschäftigung</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>SV-Nummer</Label>
                        <Input
                          value={formData.sv_nummer || ""}
                          onChange={(e) => setFormData({ ...formData, sv_nummer: e.target.value })}
                          placeholder="1234 010180"
                        />
                      </div>
                      <div>
                        <Label>Position</Label>
                        <Input
                          value={formData.position || ""}
                          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                          placeholder="z.B. Zimmermann"
                        />
                      </div>
                      <div>
                        <Label>Eintrittsdatum</Label>
                        <Input
                          type="date"
                          value={formData.eintritt_datum || ""}
                          onChange={(e) => setFormData({ ...formData, eintritt_datum: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Austrittsdatum</Label>
                        <Input
                          type="date"
                          value={formData.austritt_datum || ""}
                          onChange={(e) => setFormData({ ...formData, austritt_datum: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Beschäftigungsart</Label>
                        <Select
                          value={formData.beschaeftigung_art || ""}
                          onValueChange={(v) => setFormData({ ...formData, beschaeftigung_art: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vollzeit">Vollzeit</SelectItem>
                            <SelectItem value="teilzeit">Teilzeit</SelectItem>
                            <SelectItem value="geringfuegig">Geringfügig</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="emp-stundenlohn">Stundenlohn (€)</Label>
                        {/* type="text" + parseDecimal: „25,50" muss 25,50 bleiben
                            und darf nicht als 2550 in der Datenbank landen. */}
                        <Input
                          id="emp-stundenlohn"
                          type="text"
                          inputMode="decimal"
                          placeholder="z.B. 25,50"
                          value={stundenlohnText}
                          onChange={(e) => {
                            setStundenlohnText(e.target.value);
                            setFormData({ ...formData, stundenlohn: parseDecimal(e.target.value) });
                          }}
                          onBlur={() => setStundenlohnText(formatForInput(parseDecimal(stundenlohnText)))}
                        />
                      </div>
                      <div>
                        <Label>Standard-Fahrzeug</Label>
                        <Select
                          value={formData.standard_vehicle_id || NO_VEHICLE}
                          onValueChange={(v) =>
                            setFormData({ ...formData, standard_vehicle_id: v === NO_VEHICLE ? null : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_VEHICLE}>—</SelectItem>
                            {vehicles.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.bezeichnung}{v.kennzeichen ? ` (${v.kennzeichen})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Verknüpfung zum Login. Ohne sie greifen Standard-Fahrzeug,
                          Stundenauswertung & Zeiterfassung für diesen Mitarbeiter nicht. */}
                      <div className="sm:col-span-2">
                        <Label>Benutzerkonto (Login)</Label>
                        <Select
                          value={formData.user_id || NO_USER}
                          onValueChange={(v) =>
                            setFormData({ ...formData, user_id: v === NO_USER ? null : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Kein Benutzerkonto" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_USER}>Kein Benutzerkonto</SelectItem>
                            {profileOptions
                              .filter(
                                (p) =>
                                  p.id === formData.user_id ||
                                  !employees.some((e) => e.user_id === p.id)
                              )
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {`${p.vorname || ""} ${p.nachname || ""}`.trim() || p.email || p.id}
                                  {p.email ? ` — ${p.email}` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Nötig, damit Zeiterfassung, Standard-Fahrzeug und Stundenauswertung
                          diesem Mitarbeiter zugeordnet werden.
                        </p>
                      </div>

                      {/* Aktiv/Inaktiv — der Weg für ausgetretene Mitarbeiter.
                          Löschen ist meist gar nicht erlaubt (Stundenbuchungen),
                          inaktiv setzen nimmt ihn aber überall aus den Listen. */}
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
                          <div className="min-w-0">
                            <Label htmlFor="emp-aktiv" className="cursor-pointer">
                              Mitarbeiter aktiv
                            </Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formData.aktiv === false
                                ? "Inaktiv — erscheint nicht in Zeiterfassung, Plantafel und Auswahllisten."
                                : "Aktiv — erscheint überall zur Auswahl."}
                            </p>
                          </div>
                          <Switch
                            id="emp-aktiv"
                            className="shrink-0"
                            checked={formData.aktiv !== false}
                            onCheckedChange={(v) => selectedEmployee && toggleAktiv(selectedEmployee, v)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Bankverbindung</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Label>IBAN</Label>
                        <Input
                          value={formData.iban || ""}
                          onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                          placeholder="AT12 3456 7890 1234 5678"
                        />
                      </div>
                      <div>
                        <Label>BIC</Label>
                        <Input
                          value={formData.bic || ""}
                          onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                          placeholder="BKAUATWW"
                        />
                      </div>
                      <div>
                        <Label>Bank</Label>
                        <Input
                          value={formData.bank_name || ""}
                          onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Arbeitskleidung</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Kleidungsgröße</Label>
                        <Select
                          value={formData.kleidungsgroesse || ""}
                          onValueChange={(v) => setFormData({ ...formData, kleidungsgroesse: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            {["S", "M", "L", "XL", "XXL", "XXXL"].map((size) => (
                              <SelectItem key={size} value={size}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Schuhgröße</Label>
                        <Select
                          value={formData.schuhgroesse || ""}
                          onValueChange={(v) => setFormData({ ...formData, schuhgroesse: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 17 }, (_, i) => 36 + i).map((size) => (
                              <SelectItem key={size} value={size.toString()}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label>Notizen</Label>
                    <Textarea
                      value={formData.notizen || ""}
                      onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                      rows={4}
                      placeholder="Sonstige Anmerkungen..."
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="mr-auto h-11 text-destructive hover:bg-destructive/10"
                      onClick={() => selectedEmployee && setEmployeeToDelete(selectedEmployee)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Löschen
                    </Button>
                    <Button type="button" variant="outline" className="h-11" onClick={() => setSelectedEmployee(null)}>
                      Abbrechen
                    </Button>
                    <Button type="submit" className="h-11">Speichern</Button>
                  </div>
                </form>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: Dokumente */}
            <TabsContent value="dokumente">
              {selectedEmployee && (
                <EmployeeDocumentsManager
                  employeeId={selectedEmployee.id}
                  userId={selectedEmployee.user_id || selectedEmployee.id}
                />
              )}
            </TabsContent>

            {/* Tab 3: Überstunden */}
            <TabsContent value="stunden">
              <div className="space-y-4 p-4">
                <p className="text-sm text-muted-foreground">
                  Zur vollständigen Stundenauswertung wechseln Sie bitte zur Stundenauswertung-Seite.
                </p>
                <Button
                  onClick={() => {
                    if (selectedEmployee?.user_id) {
                      navigate(`/hours-report?employee=${selectedEmployee.user_id}`);
                      setSelectedEmployee(null);
                    } else {
                      toast({
                        title: "Keine User-ID",
                        description: "Dieser Mitarbeiter hat noch keinen Benutzer-Account",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="w-full"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Zur Stundenauswertung
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Create-Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuer Mitarbeiter</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEmployee} className="space-y-4">
            <div>
              <Label>Vorname *</Label>
              <Input
                value={newEmployee.vorname}
                onChange={(e) => setNewEmployee({ ...newEmployee, vorname: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Nachname *</Label>
              <Input
                value={newEmployee.nachname}
                onChange={(e) => setNewEmployee({ ...newEmployee, nachname: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>E-Mail (optional)</Label>
              <Input
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full">
              Mitarbeiter anlegen
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Größen-Übersicht Dialog */}
      <Dialog open={showSizesDialog} onOpenChange={setShowSizesDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="w-5 h-5" />
              Arbeitskleidung & Schuhgrößen - Übersicht
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[600px]">
            <div className="rounded-md border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Position</th>
                    <th className="px-4 py-3 text-center font-semibold">Kleidungsgröße</th>
                    <th className="px-4 py-3 text-center font-semibold">Schuhgröße</th>
                  </tr>
                </thead>
                <tbody>
                  {[...visibleEmployees]
                    .sort((a, b) => a.nachname.localeCompare(b.nachname))
                    .map((emp, idx) => (
                      <tr 
                        key={emp.id} 
                        className={`border-t hover:bg-muted/30 cursor-pointer transition-colors ${
                          idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                        }`}
                        onClick={() => {
                          setShowSizesDialog(false);
                          setSelectedEmployee(emp);
                        }}
                      >
                        <td className="px-4 py-3 font-medium">
                          {emp.vorname} {emp.nachname}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {emp.position || "Mitarbeiter"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.kleidungsgroesse ? (
                            <span className="inline-flex items-center justify-center w-12 h-8 rounded-md bg-primary/10 text-primary font-semibold">
                              {emp.kleidungsgroesse}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.schuhgroesse ? (
                            <span className="inline-flex items-center justify-center w-12 h-8 rounded-md bg-secondary/50 text-secondary-foreground font-semibold">
                              {emp.schuhgroesse}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {employees.filter(e => !e.kleidungsgroesse && !e.schuhgroesse).length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  ℹ️ {employees.filter(e => !e.kleidungsgroesse && !e.schuhgroesse).length} Mitarbeiter 
                  haben noch keine Größenangaben. Klicke auf einen Mitarbeiter um die Daten zu ergänzen.
                </p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Löschen-Bestätigung */}
      <AlertDialog open={!!employeeToDelete} onOpenChange={(o) => !o && setEmployeeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitarbeiter löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {employeeToDelete?.vorname} {employeeToDelete?.nachname} wird endgültig entfernt.
              <br />
              <br />
              Gelöscht wird nur, wenn keine Stundenbuchungen und kein Benutzerkonto daran hängen.
              Für ausgetretene Mitarbeiter ist der Schalter <strong>„Mitarbeiter aktiv"</strong> der
              richtige Weg — die Daten bleiben dann für Nachkalkulation und Lohnverrechnung erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteEmployee();
              }}
            >
              {deleting ? "Löscht..." : "Ja, löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
