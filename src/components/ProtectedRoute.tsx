import { useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, Loader2, ShieldX } from "lucide-react";
import type { FeatureKey } from "@/hooks/usePermissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  feature?: FeatureKey;
}

type Status = "loading" | "authenticated" | "unauthenticated" | "pending" | "forbidden" | "redirect-freelancer" | "offline";

/**
 * Netzfehler von echter Abmeldung unterscheiden.
 *
 * supabase-js wirft bei einem fehlgeschlagenen Netzwerkaufruf nicht, sondern
 * liefert `{ user: null, error: AuthRetryableFetchError }`. Wer nur `user`
 * auswertet, hält jedes Funkloch für eine Abmeldung — und genau das passiert
 * dem Zimmerer auf der Baustelle mitten im Regiebericht.
 */
const istNetzfehler = (e: unknown): boolean => {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; status?: number; message?: string };
  return err.name === "AuthRetryableFetchError"
    || err.status === 0
    || /fetch|network|failed to fetch|timeout/i.test(err.message || "");
};

export function ProtectedRoute({ children, feature }: ProtectedRouteProps) {
  const [status, setStatus] = useState<Status>("loading");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAccess();
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const checkAccess = async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user) {
      // Kein Netz? Dann gilt die lokal gespeicherte Sitzung weiter —
      // getSession() fragt den Server nicht.
      if (userError && istNetzfehler(userError)) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) { setStatus("authenticated"); return; }
      }
      setStatus("unauthenticated");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();

    // Scheitert die Abfrage am Netz, ist der Benutzer NICHT plötzlich
    // unfreigeschaltet — sonst liest ein langjähriger Mitarbeiter bei
    // schlechtem Empfang „Warten auf Freischaltung".
    if (profileError) {
      setStatus(istNetzfehler(profileError) ? "offline" : "pending");
      return;
    }

    if (!profile || profile.is_active === false || profile.is_active === null) {
      setStatus("pending");
      return;
    }

    // Freelancer-Check: freie Mitarbeiter dürfen nur /freelancer erreichen
    const { data: emp } = await (supabase.from("employees" as never) as any)
      .select("ist_freelancer")
      .eq("user_id", user.id)
      .maybeSingle();
    if (emp?.ist_freelancer && location.pathname !== "/freelancer") {
      setStatus("redirect-freelancer");
      return;
    }

    // Check feature-based permissions
    if (feature) {
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const role = roleData?.role || "mitarbeiter";
      const { data: permData } = await (supabase.from("role_permissions" as never) as any)
        .select("can_view").eq("role", role).eq("feature", feature).maybeSingle();
      if (!permData?.can_view) {
        setStatus("forbidden");
        return;
      }
    }

    setStatus("authenticated");
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/auth" replace />;
  }

  if (status === "offline") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Keine Verbindung</CardTitle>
            <CardDescription className="text-base mt-2">
              Die Daten konnten nicht geladen werden. Du bist weiterhin angemeldet —
              sobald wieder Empfang da ist, geht es hier weiter.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => { setStatus("loading"); checkAccess(); }}>
              Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "redirect-freelancer") {
    return <Navigate to="/freelancer" replace />;
  }

  if (status === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <img src="/groismaier-logo.png" alt="Holzbau Groismaier" className="h-24 mx-auto mb-4" />
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Warten auf Freischaltung</CardTitle>
            <CardDescription className="text-base mt-2">
              Dein Konto wurde erstellt und wartet auf Freischaltung durch einen Administrator.
              Du wirst benachrichtigt, sobald dein Zugang aktiviert wurde.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}>
              <LogOut className="mr-2 h-4 w-4" />
              Abmelden
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldX className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-xl">Kein Zugriff</CardTitle>
            <CardDescription className="text-base mt-2">
              Du hast keine Berechtigung für diesen Bereich.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate("/")}>
              Zurück zum Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
