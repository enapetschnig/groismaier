import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Plus, Trash2, LogOut, Home } from "lucide-react";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { parseDecimal } from "@/lib/num";

/**
 * Vereinfachte Zeiterfassung für freie Mitarbeiter.
 * - Nur Projekt, Datum, Stunden, Tätigkeit.
 * - Kein Tagessoll, kein Zeitkonto, keine Pause-Logik.
 * - Eigene Eintrags-Historie unten mit Lösch-Möglichkeit.
 *
 * Diese Maske liegt bewusst AUSSERHALB des AppLayouts (eigener Route-Zweig in
 * App.tsx): freie Mitarbeiter sehen nichts anderes von der App. Deshalb hat die
 * Toolbar hier keinen Zurück-, sondern einen Abmelden-Button. Wer KEIN
 * Freelancer ist (z. B. der Chef, der die Seite ansieht), bekommt zusätzlich
 * einen Home-Button — sonst wäre die Maske für ihn eine Sackgasse.
 */
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Von/Bis für eine reine Stundenmeldung.
 *
 * WARUM ES DAS BRAUCHT: time_entries hat die DB-Bedingung
 * `CHECK (end_time > start_time)` (Migration 20251117142234) und start_time /
 * end_time sind NOT NULL. Die Maske hat bisher fix 07:00 → 07:00 geschrieben —
 * damit schlug JEDE Buchung eines freien Mitarbeiters mit
 * „violates check constraint check_time_order" fehl. Die Seite war komplett
 * unbenutzbar.
 *
 * Freie Mitarbeiter melden nur eine Stundensumme, kein Zeitfenster. Wir legen
 * daher ab 07:00 ein passendes Fenster an (bei sehr langen Meldungen wandert der
 * Beginn nach vorne, damit 23:59 nicht überschritten wird). Maßgeblich für jede
 * Auswertung bleibt die Spalte `stunden` mit dem eingegebenen Wert.
 */
function zeitfenster(stunden: number): { start_time: string; end_time: string } {
  const MAX = 24 * 60 - 1; // 23:59
  const dauer = Math.min(Math.max(1, Math.round(stunden * 60)), MAX);
  const start = Math.max(0, Math.min(7 * 60, MAX - dauer));
  return { start_time: hhmm(start), end_time: hhmm(start + dauer) };
}

export default function FreelancerHours() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [isFreelancer, setIsFreelancer] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [myEntries, setMyEntries] = useState<any[]>([]);

  const [form, setForm] = useState({
    datum: format(new Date(), "yyyy-MM-dd"),
    project_id: "",
    stunden: "",
    taetigkeit: "",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      setUserId(user.id);

      const [{ data: prof }, { data: emp }, { data: projs }, { data: entries }] = await Promise.all([
        (supabase.from("profiles" as never) as any).select("vorname, nachname").eq("id", user.id).maybeSingle(),
        (supabase.from("employees" as never) as any).select("ist_freelancer").eq("user_id", user.id).maybeSingle(),
        supabase.from("projects").select("id, name").not("status", "eq", "Abgeschlossen").order("name"),
        supabase.from("time_entries").select("id, datum, stunden, taetigkeit, project_id, projects(name)").eq("user_id", user.id).order("datum", { ascending: false }).limit(30),
      ]);

      // Sicherheit: wenn nicht freelancer, auf die normale Zeiterfassung umleiten.
      // ACHTUNG: Die Route heißt /time-tracking — das frühere "/zeiterfassung"
      // existiert in App.tsx nicht und warf den Anwender auf die 404-Seite.
      if (emp && !(emp as any).ist_freelancer) {
        navigate("/time-tracking", { replace: true });
        return;
      }
      // Kein employees-Datensatz (z. B. Chef/Admin) → Maske bleibt sichtbar,
      // bekommt aber einen Weg zurück in die App.
      setIsFreelancer(Boolean((emp as any)?.ist_freelancer));

      setUserName(prof ? `${(prof as any).vorname} ${(prof as any).nachname}` : "");
      setProjects((projs as any[]) || []);
      setMyEntries((entries as any[]) || []);
      setLoading(false);
    })();
  }, [navigate]);

  const save = async () => {
    if (!form.project_id) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte Projekt auswählen" });
      return;
    }
    // Deutsche Eingabe („4,5") muss funktionieren — parseDecimal statt parseFloat.
    const h = parseDecimal(form.stunden);
    if (h === null || h <= 0 || h > 24) {
      toast({ variant: "destructive", title: "Fehler", description: "Stunden müssen zwischen 0 und 24 liegen" });
      return;
    }
    setSaving(true);
    const { start_time, end_time } = zeitfenster(h);
    const { error } = await supabase.from("time_entries").insert({
      user_id: userId,
      datum: form.datum,
      project_id: form.project_id,
      stunden: h,
      taetigkeit: form.taetigkeit.trim() || "Projektarbeit",
      location_type: "baustelle",
      start_time,
      end_time,
      pause_minutes: 0,
    });
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Gespeichert", description: `${h.toFixed(2).replace(".", ",")} h gebucht` });
    setForm({ datum: format(new Date(), "yyyy-MM-dd"), project_id: "", stunden: "", taetigkeit: "" });
    // Reload entries
    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, datum, stunden, taetigkeit, project_id, projects(name)")
      .eq("user_id", userId)
      .order("datum", { ascending: false })
      .limit(30);
    setMyEntries((entries as any[]) || []);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Eintrag wirklich löschen?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    setMyEntries(myEntries.filter((e) => e.id !== id));
    toast({ title: "Gelöscht" });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const totalThisMonth = myEntries
    .filter((e) => {
      const d = parseISO(e.datum);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + Number(e.stunden), 0);

  if (loading) {
    return (
      <div className="kb-page flex min-h-screen items-center justify-center text-muted-foreground">
        Lädt…
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        title={userName ? `Zeiterfassung — ${userName}` : "Zeiterfassung"}
        rightActions={
          <>
            {!isFreelancer && (
              <button
                type="button"
                onClick={() => navigate("/")}
                aria-label="Zur Startmaske"
                title="Zur Startmaske"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-kb-blue-dark bg-gradient-to-b from-white to-[hsl(213_30%_88%)] shadow-md transition-transform hover:brightness-105 active:translate-y-px"
              >
                <Home className="h-5 w-5 text-kb-blue-dark" strokeWidth={2.5} />
              </button>
            )}
            <KBToolbarButton icon={LogOut} label="Abmelden" onClick={logout} />
          </>
        }
      />

      <main className="container mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <Card className="kb-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Neue Projektstunden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fl-datum">Datum</Label>
              <Input
                id="fl-datum"
                type="date"
                className="h-11"
                value={form.datum}
                onChange={(e) => setForm({ ...form, datum: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Projekt</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Projekt auswählen…" /></SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">Keine offenen Projekte</div>
                  ) : (
                    projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fl-stunden">Stunden</Label>
              <Input
                id="fl-stunden"
                type="text"
                inputMode="decimal"
                className="h-11"
                placeholder="z.B. 4,5"
                value={form.stunden}
                onChange={(e) => setForm({ ...form, stunden: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fl-taet">Tätigkeit <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                id="fl-taet"
                className="h-11"
                value={form.taetigkeit}
                onChange={(e) => setForm({ ...form, taetigkeit: e.target.value })}
                placeholder="z.B. Aufmaß, Montage, Abnahme…"
              />
            </div>
            <KBToolbarButton
              icon={Plus}
              iconClassName="text-kb-green"
              label={saving ? "Speichert…" : "Stunden erfassen"}
              className="w-full justify-center"
              onClick={save}
              disabled={saving}
            />
          </CardContent>
        </Card>

        <Card className="kb-panel">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Meine letzten Einträge</CardTitle>
              <div className="text-xs text-muted-foreground">
                Diesen Monat: <span className="font-semibold text-foreground">{totalThisMonth.toFixed(2)} h</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {myEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Noch keine Einträge.</p>
            ) : (
              <>
                {/* Mobil: Karten statt Tabelle */}
                <ul className="flex flex-col gap-2 sm:hidden">
                  {myEntries.map((e) => (
                    <li key={e.id} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">
                            {format(parseISO(e.datum), "dd.MM.yyyy", { locale: de })}
                            <span className="ml-2 text-primary">{Number(e.stunden).toFixed(2)} h</span>
                          </p>
                          <p className="mt-0.5 break-words text-sm">{e.projects?.name || "—"}</p>
                          {e.taetigkeit && (
                            <p className="break-words text-xs text-muted-foreground">{e.taetigkeit}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label="Eintrag löschen"
                          className="kb-btn h-11 w-11 shrink-0 justify-center"
                          onClick={() => deleteEntry(e.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-x-auto sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Datum</TableHead>
                        <TableHead>Projekt</TableHead>
                        <TableHead className="text-right">Stunden</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myEntries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{format(parseISO(e.datum), "dd.MM.yy", { locale: de })}</TableCell>
                          <TableCell className="text-sm">
                            <div className="max-w-[220px] truncate font-medium">{e.projects?.name || "—"}</div>
                            {e.taetigkeit && <div className="max-w-[220px] truncate text-xs text-muted-foreground">{e.taetigkeit}</div>}
                          </TableCell>
                          <TableCell className="text-right font-medium">{Number(e.stunden).toFixed(2)}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              aria-label="Eintrag löschen"
                              className="kb-btn h-9 w-9 justify-center"
                              onClick={() => deleteEntry(e.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
