import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock, FolderKanban, BarChart3, LogOut, FileText, ArrowRight, Download, Camera,
  User as UserIcon, Receipt, BookUser, Package, Bell, LayoutGrid, FileDown,
  Calculator, Plus, TrendingUp, CalendarRange, HardHat, Shield, Banknote, Truck,
  Wallet,
  type LucideIcon,
  KeyRound,
  Mail,
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
import { QuickFotoDialog } from "@/components/QuickFotoDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { MeineEinteilung } from "@/components/MeineEinteilung";
import { AufgabenWidget } from "@/components/aufgaben/AufgabenWidget";
import { AenderungswunschKnopf } from "@/components/aenderungswunsch/AenderungswunschKnopf";
import { NeuerungenBanner } from "@/components/neuerungen/NeuerungenBanner";
import { KBButton, KBSectionHeader } from "@/components/kingbill";
import { ListTodo } from "lucide-react";

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
  const [fotoDialogOffen, setFotoDialogOffen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  /** Fahrzeuge, deren Pickerl innerhalb der eingestellten Vorlaufzeit fällig wird. */
  const [pickerlFaellig, setPickerlFaellig] = useState<
    { id: string; bezeichnung: string; kennzeichen: string | null; faellig: string; tage: number }[]
  >([]);
  const [offenePostenCount, setOffenePostenCount] = useState(0);
  /** Nicht abgerechnete Lieferscheine / Regieberichte (Kundenwunsch
   *  24.08.2026: "damit ich da schon sehen kann, dass noch etwas nicht
   *  abgerechnet ist"). */
  const [lieferscheineOffen, setLieferscheineOffen] = useState(0);
  const [regieOffen, setRegieOffen] = useState(0);
  const { handleRestartInstallGuide } = useOnboarding();
  // Läuft die Seite schon als installierte App? Dann braucht es keinen
  // Installieren-Knopf in der Kopfzeile. (iOS setzt navigator.standalone.)
  const laeuftAlsApp =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;

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

    const [{ data: profileData, error: profileError }, { data: roleData }] = await Promise.all([profileReq, roleReq]);

    // Scheitert die Abfrage (Funkloch), ist der Benutzer NICHT plötzlich
    // unfreigeschaltet — sonst begrüßt die Startseite einen langjährigen
    // Mitarbeiter mit „wartet auf Freischaltung".
    if (profileError) {
      setLoading(false);
      return;
    }

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

    // Pickerl-Termine: Fahrzeuge, bei denen die Begutachtung ansteht.
    // Der Vorlauf steht je Fahrzeug (Kundenwunsch: ein Monat oder zwei Wochen).
    try {
      const { data: fahrzeuge } = await (supabase.from("vehicles" as never) as any)
        .select("id, bezeichnung, kennzeichen, aktiv, pickerl_faellig_am, pickerl_erinnerung_tage")
        .not("pickerl_faellig_am", "is", null);
      const heute = new Date(); heute.setHours(0, 0, 0, 0);
      const anstehend = ((fahrzeuge as any[]) || [])
        .filter((f) => f.aktiv !== false)
        .map((f) => {
          const faellig = new Date(f.pickerl_faellig_am + "T12:00:00");
          const tage = Math.ceil((faellig.getTime() - heute.getTime()) / 86400000);
          return { id: f.id, bezeichnung: f.bezeichnung, kennzeichen: f.kennzeichen,
                   faellig: f.pickerl_faellig_am, tage,
                   vorlauf: Number(f.pickerl_erinnerung_tage) || 30 };
        })
        .filter((f) => f.tage <= f.vorlauf)
        .sort((a, b) => a.tage - b.tage)
        .map(({ vorlauf, ...rest }) => rest);
      setPickerlFaellig(anstehend);
    } catch { /* Fahrzeugmodul optional — Startseite darf daran nicht scheitern */ }

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
    // Nicht abgerechnete Lieferscheine (Badge am Dokumente-Eintrag).
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("typ", "lieferschein")
      .eq("status", "offen")
      .then(({ count }) => {
        if (!cancelled) setLieferscheineOffen(count || 0);
      });
    // Nicht verrechnete Regieberichte (Badge am Betrieb-Eintrag).
    if (canView("regieberichte")) {
      (supabase.from("disturbances") as any)
        .select("id", { count: "exact", head: true })
        .or("is_verrechnet.is.null,is_verrechnet.eq.false")
        .then(({ count }: { count: number | null }) => {
          if (!cancelled) setRegieOffen(count || 0);
        });
    }
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
      <QuickFotoDialog open={fotoDialogOffen} onOpenChange={setFotoDialogOffen} />

      {/* Header — blaue KingBill-Titelleiste mit Systemleisten-Buttons wie im Original */}
      <header data-seitenkopf className="kb-toolbar sticky top-0 z-50">
        {/* Am Handy ausgeblendet (Kundenwunsch) — Abmelden steht im Menü
            rechts; links oben braucht es den Knopf nur am Desktop. */}
        <button type="button" className="kb-btn hidden shrink-0 sm:inline-flex" onClick={handleLogout} title="Abmelden">
          <LogOut className="h-4 w-4 text-kb-blue-dark" />
          <span className="hidden md:inline">Beenden</span>
        </button>
        {isAdmin && (
          <button type="button" className="kb-btn shrink-0 hidden sm:inline-flex" onClick={() => navigate("/admin")}>
            <Shield className="h-4 w-4 text-kb-blue-dark" />
            <span className="hidden md:inline">Einstellungen ändern</span>
          </button>
        )}
        {/* Änderung melden — auch auf der Startmaske (Kundenmeldung 26.08.2026:
            „im Hauptmenü geht es schon mal nicht"). Die Startmaske baut ihre
            Kopfleiste selbst und bekommt den Knopf daher nicht über KBToolbar. */}
        <span className="shrink-0" data-bildschirmfoto="aus">
          <AenderungswunschKnopf gestalt="kopf" />
        </span>
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
        <div className="ml-auto shrink-0 flex items-center gap-1 sm:gap-2">
          {/* Eigener Installieren-Knopf (Kundenwunsch) — entfällt, sobald die
              Seite bereits als installierte App läuft. Der Dialog erkennt das
              Betriebssystem und zeigt die passende Anleitung. */}
          {!laeuftAlsApp && (
            <button
              type="button"
              className="kb-btn shrink-0"
              onClick={handleRestartInstallGuide}
              title="App auf diesem Gerät installieren"
            >
              <Download className="h-4 w-4 text-kb-blue-dark" />
              <span className="hidden md:inline">App installieren</span>
            </button>
          )}
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
                <Download className="mr-2 h-4 w-4" />
                <span>App installieren</span>
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

      {/* Pickerl-Erinnerung — für alle, die den Fuhrpark sehen dürfen */}
      {canView("fahrzeuge") && pickerlFaellig.length > 0 && (
        <div
          className="cursor-pointer border-b transition-colors"
          style={{ background: pickerlFaellig.some(f => f.tage < 0) ? "#fef2f2" : "#fffbeb" }}
          onClick={() => navigate("/fahrzeuge")}
        >
          <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                pickerlFaellig.some(f => f.tage < 0) ? "bg-red-500" : "bg-amber-500"}`}>
                <Truck className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base text-amber-900">
                  {pickerlFaellig.length === 1 ? "Pickerl steht an" : `${pickerlFaellig.length} Pickerl-Termine stehen an`}
                </p>
                <p className="text-xs text-amber-800 break-words">
                  {pickerlFaellig.slice(0, 3).map((f) => {
                    const wann = f.tage < 0 ? `seit ${Math.abs(f.tage)} Tagen überfällig`
                      : f.tage === 0 ? "heute fällig"
                      : `in ${f.tage} Tagen`;
                    return `${f.bezeichnung}${f.kennzeichen ? ` (${f.kennzeichen})` : ""} — ${wann}`;
                  }).join(" · ")}
                  {pickerlFaellig.length > 3 ? " …" : ""}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-600 shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* Pending Users Notification for Admins */}
      {isAdmin && pendingUsersCount > 0 && (
        <div
          className="bg-amber-50 border-b border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => navigate("/admin")}
        >
          <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-4 lg:px-6 py-3">
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
      <main className="mx-auto w-full max-w-[1600px] px-3 sm:px-4 lg:px-6 py-4 sm:py-6">

        {/* Meine Einteilung — für Mitarbeiter und Vorarbeiter prominent oben */}
        {user && !isAdmin && (
          <div className="mb-4 sm:mb-6">
            <MeineEinteilung userId={user.id} />
          </div>
        )}

        {/* „Das ist neu" — was zuletzt umgesetzt wurde (Kundenwunsch
            26.08.2026). Steht ganz oben und verschwindet nach dem
            Bestätigen; der Vermerk liegt beim Benutzer, nicht im Browser. */}
        {user && <NeuerungenBanner userId={user.id} />}

        {/* Aufgaben (Kundenwunsch 19.08.2026): Status-Übersicht für den Admin,
            „Meine Aufgaben" als Nachricht an die zugewiesene Person. */}
        {user && (
          <div className="mb-4 sm:mb-6">
            <AufgabenWidget userId={user.id} isAdmin={isAdmin} />
          </div>
        )}

        {/* Handy-Schnellzugriff: Was man unterwegs tatsächlich macht — Zeit
            buchen, Beleg abfotografieren, Regiebericht schreiben. Ohne das
            muss sich der Chef am Telefon durch sieben Bereiche scrollen, bis
            er bei den Eingangsrechnungen ist. Nur am kleinen Schirm. */}
        <div className="mb-4 grid grid-cols-3 gap-2 sm:hidden">
          <KBButton
            className="w-full min-h-[72px] flex-col gap-1.5 py-3 text-sm"
            icon={Clock}
            label="Zeit buchen"
            onClick={() => navigate("/time-tracking")}
          />
          {/* „Foto" statt „Beleg-Foto" (Kundenwunsch): Fotos landen direkt im
              gewählten Projekt, nicht bei den Eingangsrechnungen. */}
          <KBButton
            className="w-full min-h-[72px] flex-col gap-1.5 py-3 text-sm"
            icon={Camera}
            label="Foto"
            onClick={() => setFotoDialogOffen(true)}
          />
          {canView("regieberichte") && (
            <KBButton
              className="w-full min-h-[72px] flex-col gap-1.5 py-3 text-sm"
              icon={FileText}
              label="Regiebericht"
              onClick={() => navigate("/disturbances")}
            />
          )}
        </div>

        {/* Am Handy sind alle Bereichs-Knöpfe höher (Kundenwunsch: „wenn man
            dickere Finger hat, dass es nicht zu Verwechslung kommt"); am
            Desktop bleibt die kompakte KingBill-Höhe. */}
        {/* Spalten-Layout statt Zeilen-Grid (Kundenwunsch 24.08.2026: „die
            Punkte sollen raufrücken, dass das alles ein Bild macht"): kurze
            Bereiche wie Kunden/Artikel füllen die Spalte unter dem vorigen
            Bereich auf, statt Löcher in einer Zeile zu lassen. */}
        <div className="columns-1 md:columns-2 xl:columns-4 gap-3 sm:gap-4 [&>*]:mb-3 sm:[&>*]:mb-4 [&>*]:break-inside-avoid [&_.kb-btn]:min-h-[52px] sm:[&_.kb-btn]:min-h-[2.25rem]">

          {/* ── Dokumente ─────────────────────────────────────────
              Kundenwunsch 24.08.2026: schlanke Listen-Menüs statt der
              Neu-/Suchen-Kombis („das mit Rechnung suchen und so weg") —
              angelegt und gesucht wird in der jeweiligen Liste. */}
          {canView("rechnungen") && (
            <KBBereich icon={FileText} title="Dokumente">
              <KBButton
                className="w-full"
                icon={FileText}
                label="Angebote"
                onClick={() => navigate("/invoices?tab=angebot")}
              />
              <KBButton
                className="w-full"
                icon={Receipt}
                label="Rechnungen"
                onClick={() => navigate("/invoices?tab=rechnung")}
              />
              <KBButton
                className="w-full"
                icon={Truck}
                label="Lieferscheine"
                badge={lieferscheineOffen}
                title={lieferscheineOffen > 0 ? `${lieferscheineOffen} Lieferschein(e) noch nicht abgerechnet` : undefined}
                onClick={() => navigate("/invoices?tab=lieferschein")}
              />
              <KBButton
                className="w-full"
                icon={LayoutGrid}
                label="Dokumentenliste"
                title="Alle Belege: Angebote, Aufträge, Lieferscheine, Rechnungen"
                onClick={() => navigate("/invoices")}
              />
              {isAdmin && (
                <KBButton
                  className="w-full"
                  icon={FileDown}
                  label="Ausschreibungen"
                  title="ÖNORM-Leistungsverzeichnisse (.onlv) einlesen und bepreisen"
                  onClick={() => navigate("/ausschreibungen")}
                />
              )}
            </KBBereich>
          )}

          {/* ── Kunden ────────────────────────────────────────── */}
          {canView("kunden") && (
            <KBBereich icon={BookUser} title="Kunden">
              <KBButton className="w-full" icon={BookUser} label="Kunden" onClick={() => navigate("/customers")} />
            </KBBereich>
          )}

          {/* ── Artikel ───────────────────────────────────────── */}
          {canView("materialien") && (
            <KBBereich icon={Package} title="Artikel">
              <KBButton className="w-full" icon={Package} label="Artikel" onClick={() => navigate("/materials")} />
            </KBBereich>
          )}

          {/* ── Aufgaben (Kundenwunsch 24.08.2026: eigener Menüpunkt,
              "das sieht man ja nicht") — zusätzlich zum Startseiten-Widget */}
          <KBBereich icon={ListTodo} title="Aufgaben">
            <KBButton
              className="w-full"
              icon={Plus}
              iconClassName="text-kb-green"
              label="Neue Aufgabe"
              onClick={() => navigate("/aufgaben?neu=1")}
            />
            <KBButton className="w-full" icon={ListTodo} label="Aufgabenliste" onClick={() => navigate("/aufgaben")} />
          </KBBereich>

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
          {(canView("nachkalkulation") || canView("plantafel") || canView("stundenauswertung") || canView("finanzplanung")) && (
            <KBBereich icon={BarChart3} title="Auswertung">
              {canView("nachkalkulation") && (
                <KBButton
                  className="w-full"
                  icon={TrendingUp}
                  label="Nachkalkulation"
                  onClick={() => navigate("/nachkalkulation")}
                />
              )}
              {canView("finanzplanung") && (
                <KBButton
                  className="w-full"
                  icon={Wallet}
                  label="Finanzplanung"
                  onClick={() => navigate("/finanzplanung")}
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
              <KBButton className="w-full" icon={FileText} label="Regieberichte"
                badge={regieOffen}
                title={regieOffen > 0 ? `${regieOffen} Regiebericht(e) noch nicht verrechnet` : undefined}
                onClick={() => navigate("/disturbances")} />
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
              <KBButton className="w-full" icon={Truck} label="KFZ- und Maschinen Manager" onClick={() => navigate("/fahrzeuge")} />
            )}
            <KBButton className="w-full" icon={BarChart3} label="Meine Stunden" onClick={() => navigate("/my-hours")} />
            {/* Auch der Chef bucht eigene Stunden und hat eigene Dokumente —
                früher war dieser Punkt für Administratoren ausgeblendet. */}
            <KBButton className="w-full" icon={FileText} label="Meine Dokumente" onClick={() => navigate("/my-documents")} />
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
              {isAdmin && (
                <KBButton className="w-full" icon={Mail} label="E-Mail" onClick={() => navigate("/email")} />
              )}
              {isAdmin && (
                <KBButton className="w-full" icon={KeyRound} label="Passwörter" onClick={() => navigate("/passwoerter")} />
              )}
            </KBBereich>
          )}
        </div>
      </main>
    </div>
  );
}
