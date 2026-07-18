import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Shield, User as UserIcon, UserPlus, Mail, Phone, MapPin, Shirt, FileText, Clock, Trash2, Settings, Save, MessageSquare, Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import EmployeeDocumentsManager from "@/components/EmployeeDocumentsManager";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import LeaveManagement from "@/components/LeaveManagement";
import TimeAccountManagement from "@/components/TimeAccountManagement";
import { EmployeeColorSettings } from "@/components/schedule/EmployeeColorSettings";
import { InvoiceLayoutEditor } from "@/components/InvoiceLayoutEditor";
import { InvoiceNumberSettings } from "@/components/admin/InvoiceNumberSettings";
import { DocumentTextsEditor } from "@/components/admin/DocumentTextsEditor";
import { ProjectStatusSettings } from "@/components/admin/ProjectStatusSettings";
import { MahnungSettings } from "@/components/admin/MahnungSettings";
import { CustomerColorSettings } from "@/components/admin/CustomerColorSettings";
import { ConfigOptionsManager } from "@/components/admin/ConfigOptionsManager";
import { VehicleManager } from "@/components/admin/VehicleManager";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { useConfigOptions } from "@/hooks/useConfigOptions";
import { Cloud, AlertTriangle, Truck, Briefcase, HardHat } from "lucide-react";

type Profile = {
  id: string;
  vorname: string;
  nachname: string;
  is_active: boolean | null;
};

type UserRole = {
  user_id: string;
  role: string;
};

type SickNote = {
  id: string;
  datum: string;
  user_id: string;
  notizen: string | null;
  profiles: {
    vorname: string;
    nachname: string;
  };
};

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
  land: string | null;
  nationalitaet: string | null;
  familienstand: string | null;
  fuehrerschein: string | null;
  abteilung: string | null;
  notfallkontakt_name: string | null;
  notfallkontakt_telefon: string | null;
  notfallkontakt_beziehung: string | null;
  foto_url: string | null;
  kinder: Array<{ name: string; geburtsdatum: string; anmerkung?: string }> | null;
}

export default function Admin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "benutzer";

  // Scroll zur Anchor-Sektion wenn Hash gesetzt (z.B. #nummernkreise)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => clearTimeout(timer);
  }, []);
  const { toast } = useToast();
  
  // User roles states
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteSending, setInviteSending] = useState(false);

  // Normalisiert auf E.164 (+43…). Akzeptiert 0660…, 0043…, +43…, auch mit Leerzeichen.
  const normalizeAtPhone = (raw: string): string | null => {
    let p = raw.replace(/[\s\-()/.]/g, "");
    if (p.startsWith("0043")) p = "+43" + p.slice(4);
    else if (p.startsWith("00")) p = "+" + p.slice(2);
    else if (p.startsWith("0")) p = "+43" + p.slice(1);
    else if (!p.startsWith("+")) p = "+43" + p;
    return /^\+43\d{9,13}$/.test(p) ? p : null;
  };

  const handleSendInvitation = async () => {
    const phone = normalizeAtPhone(invitePhone);
    if (!phone) {
      toast({ variant: "destructive", title: "Ungültige Nummer", description: "Bitte eine gültige österreichische Mobilnummer eingeben, z.B. +43 660 1234567." });
      return;
    }
    setInviteSending(true);
    const { data, error } = await supabase.functions.invoke("send-invitation", { body: { telefonnummer: phone } });
    setInviteSending(false);
    if (error || (data && (data as any).success === false)) {
      toast({ variant: "destructive", title: "SMS nicht gesendet", description: (data as any)?.error || error?.message || "Bitte später erneut versuchen." });
      return;
    }
    toast({ title: "Einladung gesendet", description: `SMS mit Registrierungs-Link an ${phone} verschickt.` });
    setInvitePhone("");
  };
  
  // Config options
  const { options: familienstandOptions } = useConfigOptions("familienstand");

  // Employee management states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showSizesDialog, setShowSizesDialog] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>({});
  const [activeEmployeeTab, setActiveEmployeeTab] = useState<'stammdaten' | 'dokumente' | 'stunden'>('stammdaten');
  
  // Default Betreff
  const [defaultBetreffRechnung, setDefaultBetreffRechnung] = useState("");
  const [defaultBetreffAngebot, setDefaultBetreffAngebot] = useState("");

  // Sick notes states
  const [sickNotes, setSickNotes] = useState<SickNote[]>([]);

  // Pending activation role selection
  const [pendingRoles, setPendingRoles] = useState<Record<string, "administrator" | "mitarbeiter">>({});

  // Delete user dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);

  // App settings states
  const [regiereportEmail, setRegiereportEmail] = useState("");
  // Lohnnebenkosten-Faktor für die Projekt-Nachkalkulation (Bruttolohn × Faktor)
  const [lnkFaktor, setLnkFaktor] = useState("1.8");
  const [bankKontoinhaber, setBankKontoinhaber] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [bankBic, setBankBic] = useState("");
  const [firmenUid, setFirmenUid] = useState("");
  const [einheitenStr, setEinheitenStr] = useState("Stk.,m²,lfm,Std.,Pauschal,kg,Liter,Tube,Sack,Karton,Palette,Rolle,Dose,Eimer");
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const fetchAppSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["disturbance_report_email", "bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid", "einheiten", "default_betreff_rechnung", "default_betreff_angebot", "lohnnebenkosten_faktor"]);

      if (error) {
        console.error("Error fetching app settings:", error);
      } else if (data) {
        data.forEach((row: any) => {
          if (row.key === "disturbance_report_email") setRegiereportEmail(row.value);
          if (row.key === "bank_kontoinhaber") setBankKontoinhaber(row.value);
          if (row.key === "bank_iban") setBankIban(row.value);
          if (row.key === "bank_bic") setBankBic(row.value);
          if (row.key === "firmen_uid") setFirmenUid(row.value);
          if (row.key === "einheiten") setEinheitenStr(row.value);
          if (row.key === "default_betreff_rechnung") setDefaultBetreffRechnung(row.value);
          if (row.key === "default_betreff_angebot") setDefaultBetreffAngebot(row.value);
          if (row.key === "lohnnebenkosten_faktor") setLnkFaktor(row.value || "1.8");
        });
      }
    } catch (err) {
      console.error("Error fetching app settings:", err);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const saveRegiereportEmail = async () => {
    if (!regiereportEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      toast({
        variant: "destructive",
        title: "Ungültige E-Mail",
        description: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      });
      return;
    }

    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ 
          key: "disturbance_report_email", 
          value: regiereportEmail,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Gespeichert",
        description: "E-Mail-Adresse wurde aktualisiert.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: err.message || "Einstellung konnte nicht gespeichert werden.",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    checkAdminAccess();
    fetchUsers();
    fetchEmployees();
    fetchSickNotes();
    fetchAppSettings();
  }, [fetchAppSettings]);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || roleData.role !== "administrator") {
      navigate("/");
    }
  };

  const fetchUsers = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);

    const { data: profilesData } = await (supabase.from("profiles" as never) as any)
      .select("id, vorname, nachname, is_active")
      .eq("hidden", false)
      .order("nachname");

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (profilesData) {
      setProfiles(profilesData);
    }

    if (rolesData) {
      const rolesMap: Record<string, string> = {};
      rolesData.forEach((role: UserRole) => {
        rolesMap[role.user_id] = role.role;
      });
      setUserRoles(rolesMap);
    }

    if (!silent) setLoading(false);
  };

  const scrollToRegisteredUser = (userId: string) => {
    // Wait a tick so the list can re-render after state updates
    window.setTimeout(() => {
      const el = document.getElementById(`registered-user-${userId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
        window.setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
        }, 1600);
      }
    }, 50);
  };

  const handleActivateUser = async (userId: string, activate: boolean) => {
    if (activate) {
      const role = pendingRoles[userId] || "mitarbeiter";
      const { data, error } = await supabase.rpc("activate_user", {
        _user_id: userId,
        _role: role,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Fehler",
          description: error.message || "Aktivierung fehlgeschlagen.",
        });
        return;
      }
    } else {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", userId);

      if (error) {
        toast({
          variant: "destructive",
          title: "Fehler",
          description: error.message,
        });
        return;
      }
    }

    // Optimistic UI update
    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, is_active: activate } : p))
    );

    toast({
      title: activate ? "Benutzer aktiviert" : "Benutzer deaktiviert",
      description: activate
        ? `Der Benutzer wurde als ${pendingRoles[userId] || "Mitarbeiter"} freigeschaltet.`
        : "Der Benutzer kann sich nicht mehr anmelden.",
    });

    // Refresh in background to stay in sync
    fetchUsers({ silent: true });

    // If activated, jump to the user in the "Registrierte Benutzer" list
    if (activate) scrollToRegisteredUser(userId);
  };

  const fetchEmployees = async () => {
    const [{ data, error }, { data: hiddenProfs }] = await Promise.all([
      supabase.from("employees").select("*").order("nachname"),
      (supabase.from("profiles" as never) as any).select("id").eq("hidden", true),
    ]);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      const hiddenIds = new Set(((hiddenProfs as any[]) || []).map((p: any) => p.id));
      const visible = ((data || []) as Employee[]).filter((e) => !e.user_id || !hiddenIds.has(e.user_id));
      setEmployees(visible);
    }
  };

  const fetchSickNotes = async () => {
    const { data: timeEntriesData, error } = await supabase
      .from("time_entries")
      .select("id, datum, user_id, notizen")
      .eq("taetigkeit", "Krankenstand")
      .not("notizen", "is", null)
      .like("notizen", "Krankmeldung:%")
      .order("datum", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching sick notes:", error);
      return;
    }

    if (!timeEntriesData || timeEntriesData.length === 0) {
      setSickNotes([]);
      return;
    }

    // Get unique user IDs
    const userIds = [...new Set(timeEntriesData.map(entry => entry.user_id))];
    
    // Fetch profiles for these users
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, vorname, nachname")
      .in("id", userIds);

    if (!profilesData) {
      setSickNotes([]);
      return;
    }

    // Map profiles to time entries
    const profilesMap = new Map(profilesData.map(p => [p.id, p]));
    const sickNotesWithProfiles = timeEntriesData
      .filter(entry => profilesMap.has(entry.user_id))
      .map(entry => ({
        ...entry,
        profiles: {
          vorname: profilesMap.get(entry.user_id)!.vorname,
          nachname: profilesMap.get(entry.user_id)!.nachname,
        }
      }));

    setSickNotes(sickNotesWithProfiles);
  };

  const handleDeleteSickNote = async (noteId: string, documentPath: string | null) => {
    if (!confirm("Möchten Sie diese Krankmeldung wirklich löschen?")) {
      return;
    }

    try {
      // Delete the document from storage if it exists
      if (documentPath) {
        const sanitizedPath = documentPath
          .replace("Krankmeldung: ", "")
          .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(sign|public)\/employee-documents\//, "")
          .replace(/^employee-documents\//, "")
          .replace(/^\/+/, "")
          .trim();

        const { error: storageError } = await supabase.storage
          .from("employee-documents")
          .remove([sanitizedPath]);

        if (storageError) {
          console.error("Storage deletion error:", storageError);
        }
      }

      // Delete the time entry
      const { error: dbError } = await supabase
        .from("time_entries")
        .delete()
        .eq("id", noteId);

      if (dbError) throw dbError;

      toast({
        title: "Gelöscht",
        description: "Krankmeldung wurde erfolgreich gelöscht.",
      });

      fetchSickNotes();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message || "Krankmeldung konnte nicht gelöscht werden",
      });
    }
  };

  const handleRoleChange = async (userId: string, newRole: "administrator" | "mitarbeiter") => {
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("user_id", userId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message,
      });
    } else {
      toast({
        title: "Erfolg",
        description: "Rolle wurde geändert.",
      });
      setUserRoles((prev) => ({ ...prev, [userId]: newRole }));
    }
  };

  const ensureEmployeeForUser = async (userId: string) => {
    // 1) Try to find existing employee linked to this user
    const { data: existing, error: findErr } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (findErr) {
      toast({ variant: 'destructive', title: 'Fehler', description: findErr.message });
      return null;
    }
    if (existing) return existing as Employee;

    // 2) If not found, try to attach an existing employee record by name (user_id currently null)
    const profile = profiles.find(p => p.id === userId);
    if (!profile) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Profil nicht gefunden' });
      return null;
    }

    const { data: byName, error: byNameErr } = await supabase
      .from('employees')
      .select('*')
      .is('user_id', null)
      .eq('vorname', profile.vorname)
      .eq('nachname', profile.nachname);

    if (byNameErr) {
      toast({ variant: 'destructive', title: 'Fehler', description: byNameErr.message });
      return null;
    }

    if (byName && byName.length === 1) {
      const candidate = byName[0] as Employee;
      const { data: updated, error: attachErr } = await supabase
        .from('employees')
        .update({ user_id: userId })
        .eq('id', candidate.id)
        .select()
        .single();

      if (attachErr) {
        toast({ variant: 'destructive', title: 'Fehler', description: attachErr.message });
        return null;
      }

      toast({ title: 'Verbunden', description: 'Bestehender Mitarbeiterdatensatz wurde verknüpft.' });
      fetchEmployees();
      return updated as Employee;
    }

    // 3) Otherwise create a fresh employee record linked to the user
    const insertPayload = {
      user_id: userId,
      vorname: profile.vorname || '',
      nachname: profile.nachname || '',
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('employees')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      toast({ variant: 'destructive', title: 'Fehler', description: insertErr.message });
      return null;
    }

    fetchEmployees();
    return inserted as Employee;
  };

  const openEmployeeEditorForUser = async (userId: string, tab: 'stammdaten' | 'dokumente' = 'stammdaten') => {
    setActiveEmployeeTab(tab);
    const emp = await ensureEmployeeForUser(userId);
    if (emp) setSelectedEmployee(emp);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    try {
      const { error } = await supabase
        .from("employees")
        .update(formData)
        .eq("id", selectedEmployee.id);

      if (error) throw error;

      // Namen auch auf profiles spiegeln (die "Registrierte Benutzer"-Liste
      // liest aus profiles, sonst ändert sich der angezeigte Name nicht).
      const nameChanged =
        selectedEmployee.user_id && (
          formData.vorname !== selectedEmployee.vorname ||
          formData.nachname !== selectedEmployee.nachname
        );
      if (nameChanged) {
        const { error: profErr } = await supabase
          .from("profiles")
          .update({
            vorname: formData.vorname,
            nachname: formData.nachname,
          })
          .eq("id", selectedEmployee.user_id);
        if (profErr) console.error("Profile name sync failed:", profErr);
      }

      toast({ title: "Gespeichert", description: "Änderungen übernommen." });
      fetchEmployees();
      if (nameChanged) fetchUsers({ silent: true });
      setSelectedEmployee(null);
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (selectedEmployee) {
      setFormData(selectedEmployee);
    }
  }, [selectedEmployee]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lädt...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold">Admin-Bereich</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="flex w-full overflow-x-auto mb-6">
            <TabsTrigger value="benutzer" className="flex-shrink-0">Benutzer & Mitarbeiter</TabsTrigger>
            <TabsTrigger value="einstellungen" className="flex-shrink-0">Einstellungen</TabsTrigger>
            <TabsTrigger value="rechnung" className="flex-shrink-0">Rechnungs-Layout</TabsTrigger>
            <TabsTrigger value="farben" className="flex-shrink-0">Farben & Plantafel</TabsTrigger>
            <TabsTrigger value="konfiguration" className="flex-shrink-0">Konfiguration</TabsTrigger>
            <TabsTrigger value="berechtigungen" className="flex-shrink-0">Berechtigungen</TabsTrigger>
          </TabsList>

          {/* ===== TAB 1: BENUTZER & MITARBEITER ===== */}
          <TabsContent value="benutzer" className="space-y-6">
            {/* ===== MITARBEITER PER SMS EINLADEN (prominent, ganz oben) ===== */}
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Mitarbeiter per SMS einladen
                </CardTitle>
                <CardDescription>
                  Sende eine SMS mit dem Registrierungs-Link. Der Mitarbeiter registriert sich selbst
                  und erscheint danach unter „Wartende Aktivierungen" zur Freischaltung.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      inputMode="tel"
                      placeholder="+43 660 1234567"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSendInvitation(); }}
                      disabled={inviteSending}
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={handleSendInvitation} disabled={inviteSending || !invitePhone.trim()} className="gap-2">
                    <Send className="h-4 w-4" />
                    {inviteSending ? "Wird gesendet…" : "Einladung senden"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ===== WARTENDE AKTIVIERUNGEN ===== */}
            {profiles.filter(p => !p.is_active).length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  Wartende Aktivierungen
                  <span className="bg-destructive text-destructive-foreground text-sm px-2 py-1 rounded-full">
                    {profiles.filter(p => !p.is_active).length}
                  </span>
                </h2>

                <Card className="mb-6 border-destructive/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-destructive" />
                      Neue Registrierungen
                    </CardTitle>
                    <CardDescription>
                      Diese Benutzer haben sich registriert und warten auf Freischaltung
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {profiles.filter(p => !p.is_active).map((profile) => (
                        <div key={profile.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-destructive/10 text-destructive">
                                {profile.vorname[0]}
                                {profile.nachname[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {profile.vorname} {profile.nachname}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Wartet auf Freischaltung
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={pendingRoles[profile.id] || "mitarbeiter"}
                              onValueChange={(val) => setPendingRoles(prev => ({...prev, [profile.id]: val as "administrator" | "mitarbeiter"}))}
                            >
                              <SelectTrigger className="w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mitarbeiter">Mitarbeiter</SelectItem>
                                <SelectItem value="vorarbeiter">Vorarbeiter</SelectItem>
                                <SelectItem value="administrator">Administrator</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button onClick={() => handleActivateUser(profile.id, true)}>
                              Freischalten
                            </Button>
                            <Button
                              variant="outline"
                              className="text-destructive border-destructive/40 hover:bg-destructive/10"
                              onClick={() => {
                                setUserToDelete(profile);
                                setDeleteConfirmOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Ablehnen
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* ===== BENUTZERROLLEN SEKTION ===== */}
            <section>
              <h2 className="text-2xl font-bold mb-4">Benutzerrollen & Einladungen</h2>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Administratoren
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-primary">
                      {profiles.filter(p => userRoles[p.id] === "administrator").length}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-accent" />
                      Benutzerverwaltung
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-accent">
                      {profiles.filter(p => userRoles[p.id] === "mitarbeiter").length}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Users List */}
              <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Registrierte Benutzer</CardTitle>
                <CardDescription>
                  Rollen verwalten und Mitarbeiterdaten/Dokumente bearbeiten
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => setShowSizesDialog(true)}>
                <Shirt className="w-4 h-4 mr-2" />
                Arbeitskleidung/Schuhe Größen
              </Button>
            </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {profiles.filter(p => p.is_active).map((profile) => (
                      <div
                        key={profile.id}
                        id={`registered-user-${profile.id}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-lg border bg-card transition-shadow"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {profile.vorname[0]}
                              {profile.nachname[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {profile.vorname} {profile.nachname}
                            </p>
                            {(() => {
                              const role = userRoles[profile.id];
                              const cfg = role === "administrator"
                                ? { label: "Administrator", cls: "bg-primary/10 text-primary border-primary/20" }
                                : role === "vorarbeiter"
                                ? { label: "Vorarbeiter", cls: "bg-blue-100 text-blue-800 border-blue-200" }
                                : { label: "Mitarbeiter", cls: "bg-muted text-muted-foreground border-border" };
                              return (
                                <span className={`inline-flex items-center px-2 py-0.5 mt-0.5 text-xs font-medium rounded border ${cfg.cls}`}>
                                  {cfg.label}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <Select
                            value={userRoles[profile.id]}
                            onValueChange={(val) => handleRoleChange(profile.id, val as "administrator" | "mitarbeiter")}
                          >
                            <SelectTrigger className="w-full sm:w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="administrator">Administrator</SelectItem>
                              <SelectItem value="vorarbeiter">Vorarbeiter</SelectItem>
                              <SelectItem value="mitarbeiter">Mitarbeiter</SelectItem>
                            </SelectContent>
                          </Select>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => openEmployeeEditorForUser(profile.id, 'stammdaten')}
                            >
                              Bearbeiten
                            </Button>
                            <Button onClick={() => openEmployeeEditorForUser(profile.id, 'dokumente')}>
                              <FileText className="w-4 h-4 mr-2" />
                              Dokumente
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setUserToDelete(profile);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              Deaktivieren
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Sick Notes Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Neue Krankmeldungen
                  </CardTitle>
                  <CardDescription>
                    Zuletzt hochgeladene Krankmeldungen der Mitarbeiter
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {sickNotes.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Keine Krankmeldungen vorhanden
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {sickNotes.map((note) => {
                        const documentPath = note.notizen?.replace("Krankmeldung: ", "");

                        return (
                          <div key={note.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarFallback>
                                  {note.profiles.vorname[0]}
                                  {note.profiles.nachname[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">
                                  {note.profiles.vorname} {note.profiles.nachname}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(note.datum), "dd.MM.yyyy")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {documentPath && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    if (!documentPath) return;

                                    const rawPath = documentPath.trim();

                                    // Falls alter Eintrag bereits eine komplette URL enthält
                                    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
                                      window.open(rawPath, "_blank");
                                      return;
                                    }

                                    // Pfad bereinigen (entfernt evtl. Bucket-Präfixe oder führende Slashes)
                                    const sanitizedPath = rawPath
                                      .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(sign|public)\/employee-documents\//, "")
                                      .replace(/^employee-documents\//, "")
                                      .replace(/^\/+/, "");

                                    const { data, error } = await supabase.storage
                                      .from("employee-documents")
                                      .createSignedUrl(sanitizedPath, 300);

                                    if (error) {
                                      console.error("Signed URL error:", error, { rawPath, sanitizedPath });
                                      toast({
                                        variant: "destructive",
                                        title: "Fehler",
                                        description: "Dokument konnte nicht geöffnet werden"
                                      });
                                      return;
                                    }

                                    if (data?.signedUrl) {
                                      window.open(data.signedUrl, "_blank");
                                    } else {
                                      toast({
                                        variant: "destructive",
                                        title: "Fehler",
                                        description: "Dokument konnte nicht geöffnet werden"
                                      });
                                    }
                                  }}
                                >
                                  Ansehen
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteSickNote(note.id, documentPath)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ===== URLAUBSVERWALTUNG ===== */}
            <LeaveManagement profiles={profiles.filter(p => p.is_active)} />
          </TabsContent>

          {/* ===== TAB 2: EINSTELLUNGEN ===== */}
          <TabsContent value="einstellungen" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Einstellungen
                </CardTitle>
                <CardDescription>
                  E-Mail-Adressen für automatische Benachrichtigungen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="disturbance-email">Regiebericht E-Mail-Empfänger</Label>
                  <div className="flex gap-2">
                    <Input
                      id="disturbance-email"
                      type="email"
                      placeholder="office@example.com"
                      value={regiereportEmail}
                      onChange={(e) => setRegiereportEmail(e.target.value)}
                      disabled={loadingSettings}
                      className="flex-1"
                    />
                    <Button
                      onClick={saveRegiereportEmail}
                      disabled={savingSettings || loadingSettings}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {savingSettings ? "Speichert..." : "Speichern"}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Diese E-Mail-Adresse erhält alle Regieberichte als Kopie.
                  </p>
                </div>

                {/* Lohnnebenkosten-Faktor für die Nachkalkulation */}
                <div className="border-t pt-4 space-y-2">
                  <Label htmlFor="lnk-faktor">Lohnnebenkosten-Faktor (Nachkalkulation)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="lnk-faktor"
                      type="number"
                      min={1}
                      max={3}
                      step={0.05}
                      value={lnkFaktor}
                      onChange={(e) => setLnkFaktor(e.target.value)}
                      disabled={loadingSettings}
                      className="w-32"
                    />
                    <Button
                      onClick={async () => {
                        const f = parseFloat(String(lnkFaktor).replace(",", "."));
                        if (!Number.isFinite(f) || f < 1 || f > 3) {
                          toast({ variant: "destructive", title: "Ungültiger Faktor", description: "Bitte einen Wert zwischen 1,0 und 3,0 eingeben (üblich: 1,7–2,0)." });
                          return;
                        }
                        const { error } = await supabase.from("app_settings").upsert(
                          { key: "lohnnebenkosten_faktor", value: String(f), updated_at: new Date().toISOString() },
                          { onConflict: "key" },
                        );
                        if (error) toast({ variant: "destructive", title: "Fehler", description: error.message });
                        else toast({ title: "Gespeichert", description: `Lohnkosten in der Nachkalkulation = Stundenlohn × ${String(f).replace(".", ",")}` });
                      }}
                      disabled={loadingSettings}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Speichern
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Die Projekt-Nachkalkulation rechnet Lohnkosten als Bruttostundenlohn × diesen Faktor
                    (Lohnnebenkosten, Urlaub/Krankenstand, unproduktive Zeiten). Üblich im Handwerk: 1,7–2,0.
                  </p>
                </div>

                {/* Firmen-UID */}
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-medium text-sm">Firmen-UID</h4>
                  <p className="text-sm text-muted-foreground">
                    Die UID-Nummer wird auf allen Rechnungs-PDFs angezeigt (Pflicht bei Rechnungen über €400).
                  </p>
                  <div className="flex gap-3 items-end">
                    <div className="space-y-1 flex-1 max-w-xs">
                      <Label>UID-Nummer</Label>
                      <Input value={firmenUid} onChange={(e) => setFirmenUid(e.target.value)} disabled={loadingSettings} placeholder="ATU12345678" />
                    </div>
                    <Button
                      onClick={async () => {
                        setSavingSettings(true);
                        try {
                          const { error } = await supabase.from("app_settings").upsert([
                            { key: "firmen_uid", value: firmenUid, updated_at: new Date().toISOString() },
                          ], { onConflict: "key" });
                          if (error) throw error;
                          toast({ title: "UID-Nummer gespeichert" });
                        } catch (err: any) {
                          toast({ variant: "destructive", title: "Fehler", description: err.message });
                        } finally {
                          setSavingSettings(false);
                        }
                      }}
                      disabled={savingSettings || loadingSettings}
                      size="sm"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Speichern
                    </Button>
                  </div>
                </div>

                {/* Default Betreff */}
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-medium text-sm">Standard-Betreff</h4>
                  <p className="text-sm text-muted-foreground">
                    Wird automatisch in jede neue Rechnung bzw. jedes neue Angebot als Betreff eingetragen.
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <Label>Betreff für Rechnungen</Label>
                      <Input value={defaultBetreffRechnung} onChange={(e) => setDefaultBetreffRechnung(e.target.value)} disabled={loadingSettings} placeholder="z.B. Montagearbeiten laut Auftrag" />
                    </div>
                    <div className="space-y-1">
                      <Label>Betreff für Angebote</Label>
                      <Input value={defaultBetreffAngebot} onChange={(e) => setDefaultBetreffAngebot(e.target.value)} disabled={loadingSettings} placeholder="z.B. Angebot für Montagearbeiten" />
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      setSavingSettings(true);
                      try {
                        const { error } = await supabase.from("app_settings").upsert([
                          { key: "default_betreff_rechnung", value: defaultBetreffRechnung, updated_at: new Date().toISOString() },
                          { key: "default_betreff_angebot", value: defaultBetreffAngebot, updated_at: new Date().toISOString() },
                        ], { onConflict: "key" });
                        if (error) throw error;
                        toast({ title: "Standard-Betreff gespeichert" });
                      } catch (err: any) {
                        toast({ variant: "destructive", title: "Fehler", description: err.message });
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    disabled={savingSettings || loadingSettings}
                    size="sm"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Speichern
                  </Button>
                </div>

                {/* Bankverbindung */}
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-medium text-sm">Bankverbindung</h4>
                  <p className="text-sm text-muted-foreground">
                    Wird auf allen PDFs (Rechnungen, Angebote, Regieberichte) und im QR-Code verwendet.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Kontoinhaber</Label>
                      <Input value={bankKontoinhaber} onChange={(e) => setBankKontoinhaber(e.target.value)} disabled={loadingSettings} />
                    </div>
                    <div className="space-y-1">
                      <Label>IBAN</Label>
                      <Input value={bankIban} onChange={(e) => setBankIban(e.target.value)} disabled={loadingSettings} placeholder="AT..." />
                    </div>
                    <div className="space-y-1">
                      <Label>BIC</Label>
                      <Input value={bankBic} onChange={(e) => setBankBic(e.target.value)} disabled={loadingSettings} placeholder="z.B. STSPAT2GXXX" />
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      setSavingSettings(true);
                      try {
                        const { error } = await supabase.from("app_settings").upsert([
                          { key: "bank_kontoinhaber", value: bankKontoinhaber, updated_at: new Date().toISOString() },
                          { key: "bank_iban", value: bankIban, updated_at: new Date().toISOString() },
                          { key: "bank_bic", value: bankBic, updated_at: new Date().toISOString() },
                        ], { onConflict: "key" });
                        if (error) throw error;
                        await fetchAppSettings();
                        toast({ title: "Bankverbindung gespeichert" });
                      } catch (err: any) {
                        toast({ variant: "destructive", title: "Fehler beim Speichern", description: err.message });
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    disabled={savingSettings || loadingSettings}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Bankverbindung speichern
                  </Button>
                </div>

                {/* Einheiten */}
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-medium text-sm">Mengeneinheiten</h4>
                  <p className="text-sm text-muted-foreground">
                    Verfügbare Einheiten für Materialien, Rechnungen, Angebote, Lieferscheine und Regieberichte.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {einheitenStr.split(",").map(e => e.trim()).filter(Boolean).map((e, i) => (
                      <Badge key={i} variant="secondary" className="text-sm px-2.5 py-1 gap-1">
                        {e}
                        <button
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const updated = einheitenStr.split(",").map(x => x.trim()).filter(x => x && x !== e).join(",");
                            setEinheitenStr(updated);
                          }}
                        >×</button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Neue Einheit hinzufügen..."
                      className="max-w-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val && !einheitenStr.split(",").map(x => x.trim()).includes(val)) {
                            setEinheitenStr(prev => prev ? `${prev},${val}` : val);
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                    />
                    <Button
                      onClick={async () => {
                        setSavingSettings(true);
                        try {
                          const { error } = await supabase.from("app_settings").upsert([
                            { key: "einheiten", value: einheitenStr.trim(), updated_at: new Date().toISOString() },
                          ], { onConflict: "key" });
                          if (error) throw error;
                          toast({ title: "Einheiten gespeichert" });
                        } catch (err: any) {
                          toast({ variant: "destructive", title: "Fehler", description: err.message });
                        } finally {
                          setSavingSettings(false);
                        }
                      }}
                      disabled={savingSettings || loadingSettings}
                      size="sm"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Speichern
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ===== NUMMERNKREISE ===== */}
            <div id="nummernkreise" className="scroll-mt-4">
              <InvoiceNumberSettings />
            </div>

            {/* ===== MAHNUNGEN ===== */}
            <div id="mahnungen" className="scroll-mt-4">
              <MahnungSettings />
            </div>
          </TabsContent>

          {/* ===== TAB 3: RECHNUNGS-LAYOUT ===== */}
          <TabsContent value="rechnung" className="space-y-6">
            <DocumentTextsEditor />
            <InvoiceLayoutEditor />
          </TabsContent>

          {/* ===== TAB 4: FARBEN & PLANTAFEL ===== */}
          <TabsContent value="farben" className="space-y-6">
            <ProjectStatusSettings />
            <CustomerColorSettings />
            <EmployeeColorSettings />
          </TabsContent>

          {/* ===== TAB 5: KONFIGURATION ===== */}
          <TabsContent value="konfiguration" className="space-y-6">
            <ConfigOptionsManager kategorie="wetter" title="Wetter-Optionen" description="Wetteroptionen für Bautagesberichte" icon={<Cloud className="h-5 w-5" />} showFarbe />
            <ConfigOptionsManager kategorie="prioritaet" title="Prioritäten" description="Prioritätsstufen für Projekte" icon={<AlertTriangle className="h-5 w-5" />} showFarbe />
            <ConfigOptionsManager kategorie="taetigkeit" title="Tätigkeiten (Zeiterfassung)" description="Auswahlliste für das Tätigkeits-Feld bei Stundenbuchungen" icon={<Clock className="h-5 w-5" />} />
            <ConfigOptionsManager kategorie="firma_intern" title="Firma intern (Ersttermin)" description="Auswahl interner Firmen/Bereiche bei Ersttermin-Protokollen" icon={<Briefcase className="h-5 w-5" />} />
            <ConfigOptionsManager kategorie="firma_extern" title="Firma extern (Ersttermin)" description="Auswahl externer Firmen/Subunternehmer bei Ersttermin-Protokollen" icon={<HardHat className="h-5 w-5" />} />
            <ConfigOptionsManager kategorie="kunde_herkunft" title="Kunde — Herkunft" description="Über welche Quelle ist der Kunde zu uns gekommen (Empfehlung, Google, Messe …)" icon={<UserPlus className="h-5 w-5" />} />
            <VehicleManager />
          </TabsContent>

          {/* ===== TAB 6: BERECHTIGUNGEN ===== */}
          <TabsContent value="berechtigungen" className="space-y-6">
            <PermissionMatrix />
          </TabsContent>

        </Tabs>
      </main>

      {/* Employee Detail Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedEmployee?.vorname} {selectedEmployee?.nachname}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeEmployeeTab} onValueChange={(val) => setActiveEmployeeTab(val as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="stammdaten">
                <UserIcon className="w-4 h-4 mr-2" />
                Stammdaten
              </TabsTrigger>
              <TabsTrigger value="dokumente">
                <FileText className="w-4 h-4 mr-2" />
                Dokumente
              </TabsTrigger>
              <TabsTrigger value="stunden">
                <Clock className="w-4 h-4 mr-2" />
                Stunden
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Stammdaten */}
            <TabsContent value="stammdaten">
              <ScrollArea className="h-[500px] pr-4">
                <form onSubmit={handleSaveEmployee} className="space-y-6">
                  {/* Foto */}
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-full border bg-muted/30 overflow-hidden flex items-center justify-center">
                      {formData.foto_url ? (
                        <img src={formData.foto_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-10 h-10 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>Mitarbeiter-Foto</Label>
                      <input
                        id="emp-foto-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedEmployee) return;
                          const ext = file.name.split(".").pop() || "jpg";
                          const path = `${selectedEmployee.id}/avatar.${ext}`;
                          const { error: upErr } = await supabase.storage
                            .from("employee-documents")
                            .upload(path, file, { upsert: true, contentType: file.type });
                          if (upErr) {
                            toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: upErr.message });
                            return;
                          }
                          const { data: urlData } = await supabase.storage
                            .from("employee-documents").createSignedUrl(path, 60 * 60 * 24 * 365);
                          const url = urlData?.signedUrl || "";
                          setFormData({ ...formData, foto_url: url });
                          toast({ title: "Foto hochgeladen" });
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById("emp-foto-upload")?.click()}
                        >
                          {formData.foto_url ? "Foto ersetzen" : "Foto hochladen"}
                        </Button>
                        {formData.foto_url && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFormData({ ...formData, foto_url: null })}
                          >
                            Entfernen
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Persönliche Daten</h3>
                    <div className="grid grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <AddressAutocomplete
                          label="Adresse"
                          value={formData.adresse || ""}
                          onChange={(v) => setFormData({ ...formData, adresse: v })}
                          onSelect={(addr) => setFormData({
                            ...formData,
                            adresse: addr.street,
                            plz: addr.plz,
                            ort: addr.ort,
                          })}
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Position</Label>
                        <Input
                          value={formData.position || ""}
                          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Beschäftigungsart</Label>
                        <Select
                          value={formData.beschaeftigung_art || ""}
                          onValueChange={(val) => setFormData({ ...formData, beschaeftigung_art: val })}
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
                        <Label>Stundenlohn (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.stundenlohn || ""}
                          onChange={(e) => setFormData({ ...formData, stundenlohn: parseFloat(e.target.value) || null })}
                        />
                      </div>
                      <div>
                        <Label>SV-Nummer</Label>
                        <Input
                          value={formData.sv_nummer || ""}
                          onChange={(e) => setFormData({ ...formData, sv_nummer: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Erweiterte Daten</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nationalität</Label>
                        <Input
                          value={formData.nationalitaet || ""}
                          onChange={(e) => setFormData({ ...formData, nationalitaet: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Familienstand</Label>
                        <Select
                          value={formData.familienstand || ""}
                          onValueChange={(val) => setFormData({ ...formData, familienstand: val })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            {familienstandOptions.map((o) => (
                              <SelectItem key={o.wert} value={o.wert}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Führerschein</Label>
                        <Input
                          value={formData.fuehrerschein || ""}
                          onChange={(e) => setFormData({ ...formData, fuehrerschein: e.target.value })}
                          placeholder="z.B. B, C, CE"
                        />
                      </div>
                      <div>
                        <Label>Abteilung</Label>
                        <Input
                          value={formData.abteilung || ""}
                          onChange={(e) => setFormData({ ...formData, abteilung: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Notfallkontakt</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Notfallkontakt Name</Label>
                        <Input
                          value={formData.notfallkontakt_name || ""}
                          onChange={(e) => setFormData({ ...formData, notfallkontakt_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Notfallkontakt Telefon</Label>
                        <Input
                          type="tel"
                          value={formData.notfallkontakt_telefon || ""}
                          onChange={(e) => setFormData({ ...formData, notfallkontakt_telefon: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Notfallkontakt Beziehung</Label>
                        <Input
                          value={formData.notfallkontakt_beziehung || ""}
                          onChange={(e) => setFormData({ ...formData, notfallkontakt_beziehung: e.target.value })}
                          placeholder="z.B. Ehepartner, Eltern"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Kinder-Section (Array aus JSONB) */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Kinder</h3>
                    <div className="space-y-2">
                      {((formData.kinder || []) as Array<{ name: string; geburtsdatum: string; anmerkung?: string }>).map((k, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_140px_1fr_32px] gap-2 items-end">
                          <div>
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={k.name}
                              onChange={(e) => {
                                const arr = [...(formData.kinder || [])];
                                arr[idx] = { ...arr[idx], name: e.target.value };
                                setFormData({ ...formData, kinder: arr as any });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Geburtsdatum</Label>
                            <Input
                              type="date"
                              value={k.geburtsdatum}
                              onChange={(e) => {
                                const arr = [...(formData.kinder || [])];
                                arr[idx] = { ...arr[idx], geburtsdatum: e.target.value };
                                setFormData({ ...formData, kinder: arr as any });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Anmerkung (optional)</Label>
                            <Input
                              value={k.anmerkung || ""}
                              onChange={(e) => {
                                const arr = [...(formData.kinder || [])];
                                arr[idx] = { ...arr[idx], anmerkung: e.target.value };
                                setFormData({ ...formData, kinder: arr as any });
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive"
                            onClick={() => {
                              const arr = [...(formData.kinder || [])];
                              arr.splice(idx, 1);
                              setFormData({ ...formData, kinder: arr as any });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const arr = [...(formData.kinder || []), { name: "", geburtsdatum: "", anmerkung: "" }];
                          setFormData({ ...formData, kinder: arr as any });
                        }}
                      >
                        + Kind hinzufügen
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Bankverbindung</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>IBAN</Label>
                        <Input
                          value={formData.iban || ""}
                          onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>BIC</Label>
                        <Input
                          value={formData.bic || ""}
                          onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Kleidungsgröße</Label>
                        <Input
                          value={formData.kleidungsgroesse || ""}
                          onChange={(e) => setFormData({ ...formData, kleidungsgroesse: e.target.value })}
                          placeholder="z.B. L, XL, XXL"
                        />
                      </div>
                      <div>
                        <Label>Schuhgröße</Label>
                        <Input
                          value={formData.schuhgroesse || ""}
                          onChange={(e) => setFormData({ ...formData, schuhgroesse: e.target.value })}
                          placeholder="z.B. 42, 43, 44"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Notizen</h3>
                    <Textarea
                      value={formData.notizen || ""}
                      onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                      rows={4}
                      placeholder="Interne Notizen zum Mitarbeiter..."
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setSelectedEmployee(null)}>
                      Abbrechen
                    </Button>
                    <Button type="submit">Speichern</Button>
                  </div>
                </form>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: Dokumente */}
            <TabsContent value="dokumente">
              <ScrollArea className="h-[500px]">
                {selectedEmployee && (
                  <EmployeeDocumentsManager 
                    employeeId={selectedEmployee.id}
                    userId={selectedEmployee.user_id || undefined}
                  />
                )}
              </ScrollArea>
            </TabsContent>

            {/* Tab 3: Stunden */}
            <TabsContent value="stunden">
              <ScrollArea className="h-[500px]">
                <div className="p-4">
                  <Button
                    onClick={() => {
                      if (selectedEmployee) {
                        navigate(`/hours-report?employeeId=${selectedEmployee.id}`);
                      }
                    }}
                    className="w-full"
                  >
                    Zur Stundenauswertung
                  </Button>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Sizes Overview Dialog */}
      <Dialog open={showSizesDialog} onOpenChange={setShowSizesDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="w-5 h-5" />
              Arbeitskleidung & Schuhgrößen
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {employees
                .filter(emp => emp.kleidungsgroesse || emp.schuhgroesse)
                .sort((a, b) => a.nachname.localeCompare(b.nachname))
                .map((emp) => (
                  <div
                    key={emp.id}
                    className="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setShowSizesDialog(false);
                      setSelectedEmployee(emp);
                    }}
                  >
                    <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="col-span-2">
                        <p className="font-medium">
                          {emp.vorname} {emp.nachname}
                        </p>
                        <p className="text-sm text-muted-foreground">{emp.position || "Mitarbeiter"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Kleidung</p>
                        <p className="font-semibold text-lg">
                          {emp.kleidungsgroesse || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Schuhe</p>
                        <p className="font-semibold text-lg">
                          {emp.schuhgroesse || "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              
              {employees.filter(emp => emp.kleidungsgroesse || emp.schuhgroesse).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Shirt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Noch keine Größenangaben vorhanden</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog - Step 1: Deaktivieren oder Löschen? */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Benutzer deaktivieren</DialogTitle>
            <DialogDescription>
              Möchten Sie {userToDelete?.vorname} {userToDelete?.nachname} nur deaktivieren oder komplett löschen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (userToDelete) {
                  handleActivateUser(userToDelete.id, false);
                }
                setDeleteDialogOpen(false);
                setUserToDelete(null);
              }}
            >
              Nur deaktivieren
            </Button>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmOpen(true);
              }}
            >
              Benutzer löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog - Step 2: Bestätigung */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sind Sie sicher?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie {userToDelete?.vorname} {userToDelete?.nachname} wirklich löschen?
              <br /><br />
              <strong>Hinweis:</strong> Alle Arbeitszeiterfassungen und Dokumente bleiben vorerst gespeichert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteConfirmOpen(false);
              setUserToDelete(null);
            }}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!userToDelete) return;

                try {
                  // Zeiteinträge: Namen in Notizen sichern bevor user_id null wird
                  const userName = `${userToDelete.vorname} ${userToDelete.nachname}`;
                  const { data: existingEntries } = await supabase.from("time_entries")
                    .select("id, notizen").eq("user_id", userToDelete.id);
                  if (existingEntries?.length) {
                    for (const entry of existingEntries) {
                      const note = entry.notizen ? `${entry.notizen} | Mitarbeiter: ${userName}` : `Mitarbeiter: ${userName}`;
                      await supabase.from("time_entries").update({ notizen: note }).eq("id", entry.id);
                    }
                  }

                  // Edge Function räumt employees, user_roles, profiles UND auth.users auf
                  const { data: dData, error: dErr } = await supabase.functions.invoke("delete-user", {
                    body: { user_id: userToDelete.id },
                  });
                  if (dErr) {
                    let detail = dErr.message;
                    try {
                      const ctx: any = (dErr as any).context;
                      if (ctx && typeof ctx.clone === "function") {
                        const body = await ctx.clone().text();
                        try { detail = JSON.parse(body)?.error || body || detail; }
                        catch { detail = body || detail; }
                      }
                    } catch { /* ignore */ }
                    throw new Error(detail);
                  }
                  if (dData?.error) throw new Error(dData.error);

                  toast({
                    title: "Benutzer gelöscht",
                    description: `${userName} wurde erfolgreich gelöscht.`,
                  });

                  fetchUsers({ silent: true });
                  fetchEmployees();
                } catch (error: any) {
                  toast({
                    variant: "destructive",
                    title: "Fehler",
                    description: error.message || "Benutzer konnte nicht gelöscht werden",
                  });
                }

                setDeleteConfirmOpen(false);
                setUserToDelete(null);
              }}
            >
              Ja, löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
