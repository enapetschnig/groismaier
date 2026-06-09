import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";

type Mode = "login" | "register" | "reset" | "registered";

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    let email = (formData.get("email") as string).trim();
    const password = formData.get("password") as string;

    // Support username login: if no @ sign, append internal domain
    if (!email.includes("@")) {
      email = `${email.toLowerCase()}@app.cg-holzbau.at`;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({ variant: "destructive", title: "Fehler beim Anmelden", description: error.message });
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile?.must_change_password) {
        toast({ title: "Bitte Passwort ändern", description: "Sie müssen Ihr Passwort beim ersten Login ändern." });
        navigate("/?changePassword=true");
        setLoading(false);
        return;
      }

      // Freelancer → eigene minimale Zeiterfassungs-Seite
      const { data: emp } = await (supabase.from("employees" as never) as any)
        .select("ist_freelancer")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (emp?.ist_freelancer) {
        toast({ title: "Willkommen" });
        navigate("/freelancer");
        setLoading(false);
        return;
      }
    }

    toast({ title: "Erfolgreich angemeldet" });
    navigate("/");
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const vorname = (formData.get("vorname") as string).trim();
    const nachname = (formData.get("nachname") as string).trim();
    const email = (formData.get("email") as string).trim().toLowerCase();
    const password = formData.get("password") as string;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { vorname, nachname },
      },
    });

    if (error) {
      toast({ variant: "destructive", title: "Registrierung fehlgeschlagen", description: error.message });
      setLoading(false);
      return;
    }

    // Konto ist angelegt, aber inaktiv → keine Session aufrechterhalten,
    // bis der Administrator freischaltet.
    await supabase.auth.signOut({ scope: "local" });
    setMode("registered");
    setLoading(false);
  };

  const handlePasswordReset = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({
      title: "Passwort zurücksetzen",
      description: "Bitte wende dich an deinen Administrator — er kann dir ein neues Passwort vergeben.",
    });
    setMode("login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/groismaier-logo.png" alt="Holzbau Groismaier" className="h-28 mx-auto mb-4" />
          <CardTitle className="sr-only">Holzbau Groismaier</CardTitle>
          <CardDescription>Zimmerei &amp; Holzbau</CardDescription>
        </CardHeader>
        <CardContent>
          {/* ── Registrierung erfolgreich → wartet auf Freischaltung ── */}
          {mode === "registered" && (
            <div className="space-y-5 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Registrierung eingegangen</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Dein Konto wartet auf Freischaltung durch den Administrator. Sobald es
                  freigegeben ist, kannst du dich mit deiner E-Mail und deinem Passwort anmelden.
                </p>
              </div>
              <Button className="w-full" onClick={() => setMode("login")}>Zur Anmeldung</Button>
            </div>
          )}

          {/* ── Passwort vergessen ── */}
          {mode === "reset" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Passwort zurücksetzen</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Wende dich an deinen Administrator — er kann dir ein neues Passwort vergeben.
                </p>
              </div>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <Button type="submit" className="w-full" disabled={loading}>Verstanden</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("login")}>
                  Zurück zur Anmeldung
                </Button>
              </form>
            </div>
          )}

          {/* ── Login ── */}
          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Benutzername oder E-Mail</Label>
                <Input id="email" name="email" type="text" autoComplete="username" placeholder="benutzername oder email@..." required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} />
              </div>
              <button type="button" onClick={() => setMode("reset")} className="text-sm text-primary hover:underline">
                Passwort vergessen?
              </button>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Lädt..." : "Anmelden"}
              </Button>
              <div className="text-center text-sm text-muted-foreground pt-2">
                Noch kein Konto?{" "}
                <button type="button" onClick={() => setMode("register")} className="text-primary hover:underline font-medium">
                  Jetzt registrieren
                </button>
              </div>
            </form>
          )}

          {/* ── Registrierung ── */}
          {mode === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="vorname">Vorname</Label>
                  <Input id="vorname" name="vorname" type="text" autoComplete="given-name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nachname">Nachname</Label>
                  <Input id="nachname" name="nachname" type="text" autoComplete="family-name" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">E-Mail</Label>
                <Input id="reg-email" name="email" type="email" autoComplete="email" placeholder="name@beispiel.at" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Passwort</Label>
                <Input id="reg-password" name="password" type="password" autoComplete="new-password" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Wird registriert..." : "Registrieren"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Neue Konten müssen vom Administrator freigeschaltet werden, bevor sie genutzt werden können.
              </p>
              <div className="text-center text-sm text-muted-foreground">
                Bereits registriert?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-primary hover:underline font-medium">
                  Zur Anmeldung
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
