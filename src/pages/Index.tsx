import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock, FolderKanban, BarChart3, LogOut, FileText, ArrowRight, Info,
  User as UserIcon, Receipt, BookUser, Package, Bell, LayoutGrid, FileDown,
  Calculator, Plus, TrendingUp, CalendarRange, HardHat, Shield, Banknote, Truck,
  type LucideIcon,
} from "lucide-react";
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
import { usePermissions } from "@/hooks/usePermissions";
import { MeineEinteilung } from "@/components/MeineEinteilung";
import { KBButton, KBSearchRow, KBSectionHeader } from "@/components/kingbill";

/** Bereichs-Spalte im KingBill-Startmasken-Stil:
 *  halbtransparenter grauer Icon-Kopf + Button-Zeilen direkt auf dem Blauverlauf. */
function KBBereich({ icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <KBSectionHeader icon={icon} title={title} />
      {children}
    </section>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const { canView, isAdmin, loading: permsLoading } = usePermissions();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [mustChangePw, setMustChangePw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [offenePostenCount, setOffenePostenCount] = useState(0);
  const { handleRestartInstallGuide } = useOnboarding();

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

    // Fetch pending users count for admin notification
    if (roleData?.role === "administrator") {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false);
      setPendingUsersCount(count || 0);
    }

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
        setUserName("");
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

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Offene Posten (offene + überfällige Rechnungen) für den Finanzen-Badge
  useEffect(() => {
    if (permsLoading || !user || isActivated !== true || !canView("rechnungen")) return;
    let cancelled = false;
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("typ", ["rechnung", "anzahlungsrechnung", "schlussrechnung"])
      .in("status", ["offen", "teilbezahlt"])
      .then(({ count }) => {
        if (!cancelled) setOffenePostenCount(count || 0);
      });
    return () => {
      cancelled = true;
    };
  }, [permsLoading, user, isActivated, canView]);

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
      <div className="kb-page min-h-screen flex items-center justify-center">
        <p>Lädt...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (isActivated === false) {
    return (
      <div className="kb-page min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full kb-panel">
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
    <div className="kb-page min-h-screen">
      {/* Erzwungener Passwortwechsel beim ersten Login (vom Admin angelegte Konten) */}
      {mustChangePw && <ChangePasswordDialog forced onSuccess={() => setMustChangePw(false)} />}

      {/* Header — blaue KingBill-Titelleiste mit Systemleisten-Buttons wie im Original */}
      <header className="kb-toolbar sticky top-0 z-50">
        <button type="button" className="kb-btn shrink-0" onClick={handleLogout} title="Abmelden">
          <LogOut className="h-4 w-4 text-kb-blue-dark" />
          <span className="hidden md:inline">Beenden</span>
        </button>
        {isAdmin && (
          <button type="button" className="kb-btn shrink-0 hidden sm:inline-flex" onClick={() => navigate("/admin")}>
            <Shield className="h-4 w-4 text-kb-blue-dark" />
            <span className="hidden md:inline">Einstellungen ändern</span>
          </button>
        )}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 sm:mx-auto">
          <div className="shrink-0 rounded bg-white/95 px-1.5 py-1 shadow-sm">
            <img
              src="/groismaier-logo-transparent.png"
              alt="Holzbau Groismaier"
              className="h-8 sm:h-9 w-auto"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm sm:text-base font-bold leading-tight truncate text-white [text-shadow:0_1px_2px_rgba(0,40,90,0.55)]">
              Holzbau Groismaier
            </span>
            <span className="text-xs sm:text-sm text-white/85 truncate">Hallo {userName || "Benutzer"}</span>
          </div>
        </div>
        <div className="ml-auto shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="kb-btn">
                <UserIcon className="h-4 w-4 text-kb-blue-dark" />
                <span className="hidden sm:inline">Menü</span>
              </button>
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

      {/* Main Content — KingBill-Startmaske */}
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">

        {/* Meine Einteilung — für Mitarbeiter und Vorarbeiter prominent oben */}
        {user && !isAdmin && (
          <div className="mb-4 sm:mb-6">
            <MeineEinteilung userId={user.id} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 items-start">

          {/* ── Dokumente ─────────────────────────────────────── */}
          {canView("rechnungen") && (
            <KBBereich icon={FileText} title="Dokumente">
              <KBButton
                className="w-full"
                icon={Plus}
                iconClassName="text-kb-green"
                label="Neues Angebot"
                onClick={() => navigate("/invoices/new?typ=angebot")}
              />
              <KBSearchRow
                buttonLabel="Angebot suchen"
                onSearch={(q) => navigate(`/invoices?tab=angebot${q ? `&q=${encodeURIComponent(q)}` : ""}`)}
              />
              <div className="my-1 h-px bg-white/70" />
              <KBButton
                className="w-full"
                icon={Plus}
                iconClassName="text-kb-green"
                label="Neue Rechnung"
                onClick={() => navigate("/invoices/new?typ=rechnung")}
              />
              <KBSearchRow
                buttonLabel="Rechnung suchen"
                onSearch={(q) => navigate(`/invoices?tab=rechnung${q ? `&q=${encodeURIComponent(q)}` : ""}`)}
              />
              <div className="my-1 h-px bg-white/70" />
              <KBButton
                className="w-full"
                icon={FileText}
                label="Dokumentenliste"
                title="Alle Belege: Angebote, Aufträge, Lieferscheine, Rechnungen"
                onClick={() => navigate("/invoices")}
              />
            </KBBereich>
          )}

          {/* ── Kunden ────────────────────────────────────────── */}
          {canView("kunden") && (
            <KBBereich icon={BookUser} title="Kunden">
              {/*
                „+ Neuer Kunde" steht bewusst als ERSTE Zeile im Bereich — genau
                wie „+ Neues Angebot" bei den Dokumenten. Kundenwunsch: das
                Anlegen soll überall ganz oben und sofort sichtbar sein.
              */}
              <KBButton
                className="w-full"
                icon={Plus}
                iconClassName="text-kb-green"
                label="Neuer Kunde"
                onClick={() => navigate("/customers?neu=1")}
              />
              <KBSearchRow
                buttonLabel="Kunde suchen"
                onSearch={(q) => navigate(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`)}
              />
              <KBButton className="w-full" icon={BookUser} label="Kundenliste" onClick={() => navigate("/customers")} />
            </KBBereich>
          )}

          {/* ── Artikel ───────────────────────────────────────── */}
          {canView("materialien") && (
            <KBBereich icon={Package} title="Artikel">
              {/* „+ Neuer Artikel" ganz oben — gleiche Reihenfolge wie bei Dokumenten/Kunden. */}
              <KBButton
                className="w-full"
                icon={Plus}
                iconClassName="text-kb-green"
                label="Neuer Artikel"
                onClick={() => navigate("/materials?neu=1")}
              />
              <KBSearchRow
                buttonLabel="Artikel suchen"
                onSearch={(q) => navigate(`/materials${q ? `?q=${encodeURIComponent(q)}` : ""}`)}
              />
              <KBButton className="w-full" icon={Package} label="Artikelliste" onClick={() => navigate("/materials")} />
            </KBBereich>
          )}

          {/* ── Finanzen ──────────────────────────────────────── */}
          {canView("rechnungen") && (
            <KBBereich icon={Banknote} title="Finanzen">
              <KBButton
                className="w-full"
                icon={Receipt}
                label="Offene Posten"
                badge={offenePostenCount}
                onClick={() => navigate("/offene-posten")}
              />
            </KBBereich>
          )}

          {/* ── Kalkulation ───────────────────────────────────── */}
          {canView("materialien") && (
            <KBBereich icon={Calculator} title="Kalkulation">
              <KBButton
                className="w-full"
                icon={Plus}
                iconClassName="text-kb-green"
                label="Neue Kalkulation"
                onClick={() => navigate("/auftragskalkulation?neu=1")}
              />
              <KBButton
                className="w-full"
                icon={Calculator}
                label="Kalkulationsliste"
                onClick={() => navigate("/auftragskalkulation")}
              />
            </KBBereich>
          )}

          {/* ── Auswertung ────────────────────────────────────── */}
          {(canView("nachkalkulation") || canView("plantafel") || canView("stundenauswertung")) && (
            <KBBereich icon={BarChart3} title="Auswertung">
              {canView("nachkalkulation") && (
                <KBButton
                  className="w-full"
                  icon={TrendingUp}
                  label="Nachkalkulation"
                  onClick={() => navigate("/nachkalkulation")}
                />
              )}
              {/* „Auslastung" auf Kundenwunsch vorerst entfernt (Jahresansicht
                  bleibt über Plantafel → Jahr erreichbar) */}
              {canView("stundenauswertung") && (
                <KBButton
                  className="w-full"
                  icon={BarChart3}
                  label="Stundenauswertung"
                  onClick={() => navigate("/hours-report")}
                />
              )}
            </KBBereich>
          )}

          {/* ── Betrieb — für alle sichtbar ───────────────────── */}
          <KBBereich icon={HardHat} title="Betrieb">
            <KBButton className="w-full" icon={Clock} label="Zeiterfassung" onClick={() => navigate("/time-tracking")} />
            {canView("plantafel") && (
              <KBButton className="w-full" icon={LayoutGrid} label="Plantafel" onClick={() => navigate("/schedule")} />
            )}
            {canView("regieberichte") && (
              <KBButton className="w-full" icon={FileText} label="Regieberichte" onClick={() => navigate("/disturbances")} />
            )}
            {canView("eingangsrechnungen") && (
              <KBButton
                className="w-full"
                icon={FileDown}
                label="Eingangsrechnungen"
                onClick={() => navigate("/eingangsrechnungen")}
              />
            )}
            <KBButton className="w-full" icon={FolderKanban} label="Projekte" onClick={() => navigate("/projects")} />
            {canView("fahrzeuge") && (
              <KBButton className="w-full" icon={Truck} label="Fahrzeuge" onClick={() => navigate("/fahrzeuge")} />
            )}
            <KBButton className="w-full" icon={BarChart3} label="Meine Stunden" onClick={() => navigate("/my-hours")} />
            {!isAdmin && (
              <KBButton className="w-full" icon={FileText} label="Meine Dokumente" onClick={() => navigate("/my-documents")} />
            )}
          </KBBereich>

          {/* ── Verwaltung ────────────────────────────────────── */}
          {(canView("admin") || isAdmin) && (
            <KBBereich icon={Shield} title="Verwaltung">
              {canView("admin") && (
                <KBButton
                  className="w-full"
                  icon={Shield}
                  label="Admin-Bereich"
                  badge={pendingUsersCount}
                  onClick={() => navigate("/admin")}
                />
              )}
              {isAdmin && (
                <KBButton className="w-full" icon={HardHat} label="Mitarbeiter" onClick={() => navigate("/employees")} />
              )}
            </KBBereich>
          )}
        </div>
      </main>
    </div>
  );
}
