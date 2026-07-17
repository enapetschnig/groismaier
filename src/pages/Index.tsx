import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, FolderKanban, Users, BarChart3, LogOut, FileText, ArrowRight, Info, User as UserIcon, Receipt, BookUser, Package, Bell, LayoutGrid, FileDown, Calculator, Plus, TrendingUp, CalendarRange, Wallet, HardHat } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOnboarding } from "@/contexts/OnboardingContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { usePermissions, type FeatureKey } from "@/hooks/usePermissions";
import { MeineEinteilung } from "@/components/MeineEinteilung";
import { GeschaeftsbereichTile } from "@/components/dashboard/GeschaeftsbereichTile";

// Diese Feature-Keys werden zentral in usePermissions ergänzt
const NACHKALKULATION_FEATURE = "nachkalkulation" as string as FeatureKey;
const FINANZPLANUNG_FEATURE = "finanzplanung" as string as FeatureKey;

type Project = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
};

type RecentTimeEntry = {
  id: string;
  datum: string;
  stunden: number;
  taetigkeit: string;
  disturbance_id: string | null;
  projects: { name: string } | null;
  profiles?: {
    vorname: string;
    nachname: string;
  } | null;
};

export default function Index() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canView, isAdmin, loading: permsLoading } = usePermissions();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [mustChangePw, setMustChangePw] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentEntries, setRecentEntries] = useState<RecentTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const { handleRestartInstallGuide } = useOnboarding();

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, updated_at")
      .not("status", "eq", "Abgeschlossen")
      .order("updated_at", { ascending: false })
      .limit(5);

    if (data) {
      setProjects(data);
    }
  };

  const fetchRecentEntries = async (userId: string, role: string | null) => {
    // For admins, fetch all entries. For employees, only their own
    let query = supabase
      .from("time_entries")
      .select("id, datum, stunden, taetigkeit, disturbance_id, projects(name)")
      .order("datum", { ascending: false })
      .limit(5);

    if (role === "mitarbeiter") {
      query = query.eq("user_id", userId);
    }

    const { data } = await query;

    if (data) {
      setRecentEntries(data as any);
    }
  };

  const loadForUser = async (userId: string) => {
    // 1) Activation + name
    const profileReq = supabase
      .from("profiles")
      .select("vorname, nachname, is_active, must_change_password")
      .eq("id", userId)
      .maybeSingle();

    // 2) Role
    const roleReq = supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const [{ data: profileData }, { data: roleData }] = await Promise.all([profileReq, roleReq]);

    // Check activation status
    setIsActivated(profileData?.is_active === true);
    setMustChangePw((profileData as any)?.must_change_password === true);

    if (profileData) {
      setUserName(`${profileData.vorname} ${profileData.nachname}`.trim());
    } else {
      // Fallback: User-Metadaten verwenden
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata) {
        setUserName(`${user.user_metadata.vorname || ''} ${user.user_metadata.nachname || ''}`.trim() || 'Neuer Benutzer');
      }
    }

    const role = roleData?.role ?? null;
    setUserRole(role);

    // Fetch pending users count for admin notification
    if (role === "administrator") {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false);
      setPendingUsersCount(count || 0);
    }

    await Promise.all([
      fetchProjects(),
      fetchRecentEntries(userId, role),
    ]);

    setLoading(false);
  };

  useEffect(() => {
    let isMounted = true;

    const handleSession = async (nextSession: Session | null) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setIsActivated(null);
        setUserRole(null);
        setUserName("");
        setProjects([]);
        setRecentEntries([]);
        setLoading(false);
        navigate("/auth");
        return;
      }

      // Block any UI until activation is verified
      setLoading(true);
      setIsActivated(null);

      await loadForUser(nextSession.user.id);
    };

    // Listen for auth changes FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Never run async supabase calls inside this callback.
      window.setTimeout(() => {
        void handleSession(nextSession);
      }, 0);
    });

    // THEN check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      window.setTimeout(() => {
        void handleSession(session);
      }, 0);
    });

    // Realtime subscription for projects
    const projectsChannel = supabase
      .channel("dashboard-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        fetchProjects();
      })
      .subscribe();

    // Realtime subscription for time entries
    const entriesChannel = supabase
      .channel("dashboard-entries")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: user ? `user_id=eq.${user.id}` : undefined,
        },
        () => {
          if (user) fetchRecentEntries(user.id, userRole);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(entriesChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/auth");
  };

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lädt...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (isActivated === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <img src="/groismaier-logo.png" alt="Holzbau Groismaier" className="h-24 mx-auto mb-4" />
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Registrierung erfolgreich</CardTitle>
            <CardDescription className="text-base mt-2">
              Dein Konto wurde erstellt und wartet auf Freischaltung durch einen Administrator.
              Du wirst benachrichtigt, sobald dein Zugang aktiviert wurde.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Abmelden
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Erzwungener Passwortwechsel beim ersten Login (vom Admin angelegte Konten) */}
      {mustChangePw && <ChangePasswordDialog forced onSuccess={() => setMustChangePw(false)} />}
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <img
                src="/groismaier-logo-transparent.png"
                alt="Holzbau Groismaier"
                className="h-9 sm:h-11 w-auto shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-sm sm:text-base font-bold leading-tight truncate">Holzbau Groismaier</span>
                <span className="text-xs sm:text-sm text-muted-foreground truncate">Hallo {userName || "Benutzer"}</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserIcon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Menü</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Mein Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={handleRestartInstallGuide}>
                  <Info className="mr-2 h-4 w-4" />
                  <span>App zum Startbildschirm hinzufügen</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />

                <ChangePasswordDialog />
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Abmelden</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Pending Users Notification for Admins */}
      {isAdmin && pendingUsersCount > 0 && (
        <div
          className="bg-amber-50 border-b border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => navigate("/admin")}
        >
          <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-amber-900 text-sm sm:text-base">
                  {pendingUsersCount === 1
                    ? "1 neuer Benutzer wartet auf Freischaltung"
                    : `${pendingUsersCount} neue Benutzer warten auf Freischaltung`}
                </p>
                <p className="text-xs text-amber-700">Tippe hier, um zum Admin-Bereich zu gelangen</p>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-600 shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
            {isAdmin ? "Admin Dashboard" : "Mein Dashboard"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isAdmin 
              ? "Verwaltung aller Projekte und Mitarbeiter" 
              : "Zeiterfassung und Projektdokumentation"}
          </p>
        </div>

        {/* Meine Einteilung — für Mitarbeiter und Vorarbeiter prominent oben */}
        {user && !isAdmin && (
          <div className="mb-6 sm:mb-8">
            <MeineEinteilung userId={user.id} />
          </div>
        )}

        {/* Schnellaktionen — KingBill-Stil, nur wenn Rechnungen sichtbar */}
        {canView('rechnungen') && (
          <section className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Schnellaktionen</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <Button size="lg" className="h-14 sm:h-16 text-base justify-start gap-3" onClick={() => navigate("/invoices/new?typ=rechnung")}>
                <Plus className="h-5 w-5 shrink-0" />
                Neue Rechnung
              </Button>
              <Button size="lg" variant="secondary" className="h-14 sm:h-16 text-base justify-start gap-3" onClick={() => navigate("/invoices/new?typ=angebot")}>
                <Plus className="h-5 w-5 shrink-0" />
                Neues Angebot
              </Button>
              {canView('kunden') && (
                <Button size="lg" variant="outline" className="h-14 sm:h-16 text-base justify-start gap-3" onClick={() => navigate("/customers")}>
                  <Plus className="h-5 w-5 shrink-0" />
                  Neuer Kunde
                </Button>
              )}
            </div>
          </section>
        )}

        {/* Geschäftsbereiche — nummerierte Kacheln laut Kundenskizze */}
        {(canView('materialien') || canView('rechnungen') || canView(NACHKALKULATION_FEATURE) || canView('plantafel') || canView(FINANZPLANUNG_FEATURE)) && (
          <section className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Geschäftsbereiche</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
              {canView('materialien') && (
                <GeschaeftsbereichTile
                  nummer={1}
                  title="Kalkulation"
                  description="Aufbauten, Holzberechnung, Arbeitszeit & Lohnlackierung"
                  icon={Calculator}
                  buttonLabel="Kalkulieren"
                  onClick={() => navigate("/auftragskalkulation")}
                />
              )}
              {canView('rechnungen') && (
                <GeschaeftsbereichTile
                  nummer={2}
                  title="Angebote & Rechnungen"
                  description="Angebot → Auftrag → Lieferschein → Rechnung"
                  icon={Receipt}
                  buttonLabel="Öffnen"
                  onClick={() => navigate("/invoices")}
                />
              )}
              {canView(NACHKALKULATION_FEATURE) && (
                <GeschaeftsbereichTile
                  nummer={3}
                  title="Nachkalkulation & Firmenzahlen"
                  description="Soll-Ist-Vergleich & betriebliche Kennzahlen"
                  icon={TrendingUp}
                  buttonLabel="Öffnen"
                  onClick={() => navigate("/nachkalkulation")}
                />
              )}
              {canView('plantafel') && (
                <GeschaeftsbereichTile
                  nummer={4}
                  title="Auslastung (Jahresübersicht)"
                  description="Jahresplanung & Auslastung der Mannschaft"
                  icon={CalendarRange}
                  buttonLabel="Öffnen"
                  onClick={() => navigate("/schedule?view=year")}
                />
              )}
              {canView(FINANZPLANUNG_FEATURE) && (
                <GeschaeftsbereichTile
                  nummer={5}
                  title="Finanzplanung"
                  description="Liquidität, Budget & Zahlungsplanung"
                  icon={Wallet}
                  buttonLabel="Öffnen"
                  onClick={() => navigate("/finanzplanung")}
                />
              )}
            </div>
          </section>
        )}

        {/* Stammdaten */}
        <section className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Stammdaten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">

            {/* Kunden */}
            {canView('kunden') && (
              <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/customers")}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><BookUser className="h-6 w-6 text-primary" /></div>
                  <CardTitle className="text-lg sm:text-xl">Kunden</CardTitle>
                  <CardDescription className="text-sm">Kundendatenbank verwalten</CardDescription>
                </CardHeader>
                <CardContent><Button className="w-full" size="sm" variant="outline">Kunden öffnen</Button></CardContent>
              </Card>
            )}

            {/* Materialien & Preise */}
            {canView('materialien') && (
              <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/materials")}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><Package className="h-6 w-6 text-primary" /></div>
                  <CardTitle className="text-lg sm:text-xl">Materialien & Preise</CardTitle>
                  <CardDescription className="text-sm">Materialstamm, Preise & Kalkulation (EK → Aufschlag → VK)</CardDescription>
                </CardHeader>
                <CardContent><Button className="w-full" size="sm" variant="outline">Öffnen</Button></CardContent>
              </Card>
            )}

            {/* Mitarbeiter — nur Admin */}
            {isAdmin && (
              <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/employees")}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><HardHat className="h-6 w-6 text-primary" /></div>
                  <CardTitle className="text-lg sm:text-xl">Mitarbeiter</CardTitle>
                  <CardDescription className="text-sm">Mitarbeiterdaten & Dokumente verwalten</CardDescription>
                </CardHeader>
                <CardContent><Button className="w-full" size="sm" variant="outline">Mitarbeiter öffnen</Button></CardContent>
              </Card>
            )}

            {/* Projekte - Für alle */}
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/projects")}>
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center"><FolderKanban className="h-6 w-6 text-accent" /></div>
                <CardTitle className="text-lg sm:text-xl">Projekte</CardTitle>
                <CardDescription className="text-sm">{isAdmin ? "Bauvorhaben & Dokumentation" : "Pläne, Bilder, Berichte, etc. hochladen"}</CardDescription>
              </CardHeader>
              <CardContent><Button className="w-full" size="sm" variant="secondary">Projekte öffnen</Button></CardContent>
            </Card>
          </div>
        </section>

        {/* Täglicher Betrieb */}
        <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Täglicher Betrieb</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">

          {/* Eingangsrechnungen — Belege hochladen (insb. für Handy-Nutzung) */}
          {canView('eingangsrechnungen') && (
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/eingangsrechnungen")}>
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-sky-500/10 flex items-center justify-center"><FileDown className="h-6 w-6 text-sky-600" /></div>
                <CardTitle className="text-lg sm:text-xl">Eingangsrechnungen</CardTitle>
                <CardDescription className="text-sm">Belege & Lieferanten-Rechnungen hochladen</CardDescription>
              </CardHeader>
              <CardContent><Button className="bg-sky-600 hover:bg-sky-700 w-full" size="sm">Hochladen</Button></CardContent>
            </Card>
          )}

          {/* 2. Zeiterfassung - Für alle */}
          <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/time-tracking")}>
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><Clock className="h-6 w-6 text-primary" /></div>
              <CardTitle className="text-lg sm:text-xl">Zeiterfassung</CardTitle>
              <CardDescription className="text-sm">Stunden auf Projekte buchen</CardDescription>
            </CardHeader>
            <CardContent><Button className="w-full" size="sm">Stunden erfassen</Button></CardContent>
          </Card>

          {/* 4. Plantafel */}
          {canView('plantafel') && (
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/schedule")}>
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><LayoutGrid className="h-6 w-6 text-primary" /></div>
                <CardTitle className="text-lg sm:text-xl">Plantafel</CardTitle>
                <CardDescription className="text-sm">Einsatzplanung & Mitarbeiter-Zuordnung</CardDescription>
              </CardHeader>
              <CardContent><Button className="w-full" size="sm">Plantafel öffnen</Button></CardContent>
            </Card>
          )}

          {/* 4b. Regieberichte */}
          {canView('regieberichte') && (
          <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/disturbances")}>
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center"><FileText className="h-6 w-6 text-yellow-600" /></div>
              <CardTitle className="text-lg sm:text-xl">Regieberichte</CardTitle>
              <CardDescription className="text-sm">Regieberichte erfassen & verwalten</CardDescription>
            </CardHeader>
            <CardContent><Button className="bg-yellow-600 hover:bg-yellow-700 w-full" size="sm">Regieberichte öffnen</Button></CardContent>
          </Card>
          )}

          {/* 6. Admin-Bereich */}
          {canView('admin') && (
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/admin")}>
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-6 w-6 text-primary" /></div>
                <CardTitle className="text-lg sm:text-xl">Admin-Bereich</CardTitle>
                <CardDescription className="text-sm">Benutzerverwaltung, Stunden & Verwaltung</CardDescription>
              </CardHeader>
              <CardContent><Button className="w-full" size="sm" variant="outline">Verwalten</Button></CardContent>
            </Card>
          )}


          {/* 8. Meine Stunden - Für alle */}
          <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/my-hours")}>
            <CardHeader className="space-y-2 pb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart3 className="h-6 w-6 text-primary" /></div>
              <CardTitle className="text-lg sm:text-xl">Meine Stunden</CardTitle>
              <CardDescription className="text-sm">{isAdmin ? "Eigene gebuchte Zeiten" : "Übersicht gebuchter Zeiten"}</CardDescription>
            </CardHeader>
            <CardContent><Button className="w-full" size="sm" variant="outline">Anzeigen</Button></CardContent>
          </Card>

          {/* Meine Dokumente - Für Mitarbeiter */}
          {!isAdmin && (
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/my-documents")}>
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center"><FileText className="h-6 w-6 text-accent" /></div>
                <CardTitle className="text-lg sm:text-xl">Meine Dokumente</CardTitle>
                <CardDescription className="text-sm">Lohnzettel & Krankmeldungen</CardDescription>
              </CardHeader>
              <CardContent><Button className="w-full" size="sm" variant="outline">Dokumente öffnen</Button></CardContent>
            </Card>
          )}

          {/* Stundenauswertung */}
          {canView('stundenauswertung') && (
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate("/hours-report")}>
              <CardHeader className="space-y-2 pb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart3 className="h-6 w-6 text-primary" /></div>
                <CardTitle className="text-lg sm:text-xl">Stundenauswertung</CardTitle>
                <CardDescription className="text-sm">Auswertung der Projektstunden</CardDescription>
              </CardHeader>
              <CardContent><Button className="w-full" size="sm">Auswerten</Button></CardContent>
            </Card>
          )}
        </div>

        {/* Recent Time Entries */}
        {recentEntries.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">
              {isAdmin ? 'Letzte Projektbuchungen (Alle Mitarbeiter)' : 'Meine letzten Buchungen'}
            </h2>
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <Card 
                  key={entry.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    if (entry.disturbance_id) {
                      navigate(`/disturbances/${entry.disturbance_id}`);
                    } else {
                      navigate("/my-hours");
                    }
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {entry.projects?.name || (entry.disturbance_id ? "Regiebericht" : "Unbekanntes Projekt")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{entry.taetigkeit}</p>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        <p className="font-bold">{entry.stunden} h</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-3" 
              onClick={() => navigate("/my-hours")}
            >
              Alle Stunden anzeigen
            </Button>
          </div>
        )}

        {!isAdmin && (
          <Card className="mt-6 bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">Schnellhilfe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>✓ <strong>Zeiterfassung:</strong> Täglich Stunden auf Projekte buchen</p>
              <p>✓ <strong>Projekte:</strong> Fotos, Regieberichte & Dokumente hochladen</p>
              <p>✓ <strong>Meine Stunden:</strong> Übersicht aller gebuchten Zeiten</p>
            </CardContent>
          </Card>
        )}

        {/* Projects Overview */}
        {projects.length > 0 && (
          <div className="mt-6 sm:mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold">Aktive Projekte</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
                Alle anzeigen
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            
            <div className="grid gap-3 sm:gap-4">
              {projects.map((project) => (
                <Card 
                  key={project.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate("/projects")}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FolderKanban className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm sm:text-base truncate">{project.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Aktualisiert: {new Date(project.updated_at).toLocaleDateString("de-DE")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

    </div>
  );
}
