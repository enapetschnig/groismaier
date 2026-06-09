import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Eye, EyeOff, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const emptyForm = {
  username: "",
  password: "",
  rolle: "mitarbeiter",
  vorname: "",
  nachname: "",
  telefon: "",
  email: "",
  adresse: "",
  plz: "",
  ort: "",
  geburtsdatum: "",
  sv_nummer: "",
  eintrittsdatum: "",
  stundenlohn: "",
};

function buildOnboardingText(params: {
  vorname: string;
  username: string;
  password: string;
  appUrl: string;
  istFreelancer: boolean;
}) {
  const { vorname, username, password, appUrl, istFreelancer } = params;
  const lines: string[] = [];
  lines.push(`Hallo ${vorname}!`);
  lines.push("");
  lines.push("Willkommen bei Holzbau Groismaier.");
  lines.push("Hier deine Zugangsdaten:");
  lines.push("");

  if (istFreelancer) {
    lines.push(`🔗 Zeiterfassung: ${appUrl}/freelancer`);
  } else {
    lines.push(`🔗 App: ${appUrl}`);
  }
  lines.push(`👤 Benutzername: ${username}`);
  lines.push(`🔑 Passwort: ${password}`);
  lines.push("");
  lines.push("Beim ersten Login wirst du gebeten, das Passwort zu ändern.");
  lines.push("");

  if (istFreelancer) {
    lines.push("⏱️ So erfasst du deine Projektstunden:");
    lines.push("• Datum, Projekt auswählen, Stunden eintragen, fertig.");
    lines.push("• Keine Pausen-Logik, kein Tagessoll — ganz einfach.");
    lines.push("• Deine letzten 30 Einträge siehst du direkt in der Übersicht.");
    lines.push("");
  }
  lines.push("Bei Fragen melde dich im Büro.");
  return lines.join("\n");
}

export function CreateUserDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [onboardingText, setOnboardingText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [istFreelancer, setIstFreelancer] = useState(false);

  const [form, setForm] = useState(emptyForm);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let pw = "";
    for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    update("password", pw);
  };

  const resetAndClose = () => {
    setForm(emptyForm);
    setIstFreelancer(false);
    setOnboardingText(null);
    setCopied(false);
    onOpenChange(false);
  };

  const handleCopy = async () => {
    if (!onboardingText) return;
    await navigator.clipboard.writeText(onboardingText);
    setCopied(true);
    toast({ title: "Kopiert", description: "Onboarding-Text in der Zwischenablage" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async () => {
    if (!form.username.trim() || !form.password || !form.vorname.trim() || !form.nachname.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Benutzername, Passwort, Vor- und Nachname sind Pflicht" });
      return;
    }
    if (form.password.length < 6) {
      toast({ variant: "destructive", title: "Fehler", description: "Passwort muss mindestens 6 Zeichen haben" });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { ...form, ist_freelancer: istFreelancer },
      });
      if (error) {
        // FunctionsHttpError.context ist eine Response → Body explizit lesen
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.clone === "function") {
            const bodyText = await ctx.clone().text();
            console.error("create-user raw response:", ctx.status, bodyText);
            try {
              const j = JSON.parse(bodyText);
              if (j?.error) detail = j.error;
              else if (bodyText) detail = bodyText;
            } catch {
              if (bodyText) detail = bodyText;
            }
          }
        } catch (parseErr) {
          console.error("Error parsing function error:", parseErr);
        }
        console.error("create-user error:", error, "detail:", detail);
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Benutzer erstellt",
        description: `${form.vorname} ${form.nachname}`,
      });

      setOnboardingText(
        buildOnboardingText({
          vorname: form.vorname.trim(),
          username: form.username.trim().toLowerCase(),
          password: form.password,
          appUrl: window.location.origin,
          istFreelancer: istFreelancer,
        }),
      );
      onCreated();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {onboardingText ? "Onboarding-Text" : "Neuen Benutzer anlegen"}
          </DialogTitle>
        </DialogHeader>

        {onboardingText ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Kopiere den Text und schicke ihn dem Mitarbeiter per SMS oder E-Mail.
            </p>
            <Textarea
              value={onboardingText}
              onChange={(e) => setOnboardingText(e.target.value)}
              className="min-h-[320px] font-mono text-sm"
            />
            <Button onClick={handleCopy} variant="outline" className="gap-2 w-full">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Kopiert" : "In Zwischenablage kopieren"}
            </Button>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Zugangsdaten */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Zugangsdaten</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Benutzername *</Label>
                  <Input
                    value={form.username}
                    onChange={e => update("username", e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                    placeholder="z.B. max.m"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">Kleinbuchstaben, Zahlen, Punkt, Bindestrich</p>
                </div>
                <div>
                  <Label>Passwort *</Label>
                  <div className="flex gap-1">
                    <div className="relative flex-1">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={e => update("password", e.target.value)}
                        placeholder="Min. 6 Zeichen"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={generatePassword} className="shrink-0">
                      Generieren
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <Label>Rolle</Label>
                <Select value={form.rolle} onValueChange={v => update("rolle", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mitarbeiter">Mitarbeiter</SelectItem>
                    <SelectItem value="vorarbeiter">Vorarbeiter</SelectItem>
                    <SelectItem value="administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 bg-muted/30">
                <div className="text-xs">
                  <span className="font-medium">Freier Mitarbeiter</span>
                  <p className="text-muted-foreground">Nutzt nur die einfache Zeiterfassungs-Seite (/freelancer). Kein Tagessoll, kein Zeitkonto.</p>
                </div>
                <Switch
                  checked={istFreelancer}
                  onCheckedChange={setIstFreelancer}
                />
              </label>

            </div>

            {/* Persönliche Daten */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Persönliche Daten</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vorname *</Label>
                  <Input value={form.vorname} onChange={e => update("vorname", e.target.value)} />
                </div>
                <div>
                  <Label>Nachname *</Label>
                  <Input value={form.nachname} onChange={e => update("nachname", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefon</Label>
                  <Input value={form.telefon} onChange={e => update("telefon", e.target.value)} placeholder="+43..." />
                </div>
                <div>
                  <Label>E-Mail</Label>
                  <Input type="email" value={form.email} onChange={e => update("email", e.target.value)} placeholder="optional" />
                </div>
              </div>
            </div>

            {/* Adresse */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Adresse</h3>
              <AddressAutocomplete
                label="Straße & Nr."
                value={form.adresse}
                onChange={(v) => update("adresse", v)}
                onSelect={(addr) => {
                  setForm((prev) => ({
                    ...prev,
                    adresse: addr.street,
                    plz: addr.plz,
                    ort: addr.ort,
                  }));
                }}
              />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>PLZ</Label>
                  <Input value={form.plz} onChange={e => update("plz", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Ort</Label>
                  <Input value={form.ort} onChange={e => update("ort", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Beschäftigung */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Beschäftigung</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Geburtsdatum</Label>
                  <Input type="date" value={form.geburtsdatum} onChange={e => update("geburtsdatum", e.target.value)} />
                </div>
                <div>
                  <Label>SV-Nummer</Label>
                  <Input value={form.sv_nummer} onChange={e => update("sv_nummer", e.target.value)} placeholder="1234 010190" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Eintrittsdatum</Label>
                  <Input type="date" value={form.eintrittsdatum} onChange={e => update("eintrittsdatum", e.target.value)} />
                </div>
                <div>
                  <Label>Stundenlohn (€)</Label>
                  <Input type="number" step="0.01" min="0" value={form.stundenlohn} onChange={e => update("stundenlohn", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {onboardingText ? (
            <Button onClick={resetAndClose}>Fertig</Button>
          ) : (
            <>
              <Button variant="outline" onClick={resetAndClose}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Erstellt..." : "Benutzer erstellen"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
