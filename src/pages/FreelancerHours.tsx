import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, Plus, Trash2, LogOut } from "lucide-react";

/**
 * Vereinfachte Zeiterfassung für freie Mitarbeiter.
 * - Nur Projekt, Datum, Stunden, Tätigkeit.
 * - Kein Tagessoll, kein Zeitkonto, keine Pause-Logik.
 * - Eigene Eintrags-Historie unten mit Lösch-Möglichkeit.
 */
export default function FreelancerHours() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
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

      // Sicherheit: wenn nicht freelancer, auf normale Zeiterfassung umleiten
      if (emp && !(emp as any).ist_freelancer) {
        navigate("/zeiterfassung");
        return;
      }

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
    const h = parseFloat(form.stunden);
    if (!h || h <= 0 || h > 24) {
      toast({ variant: "destructive", title: "Fehler", description: "Stunden müssen zwischen 0 und 24 liegen" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("time_entries").insert({
      user_id: userId,
      datum: form.datum,
      project_id: form.project_id,
      stunden: h,
      taetigkeit: form.taetigkeit.trim() || "Projektarbeit",
      location_type: "baustelle",
      start_time: "07:00",
      end_time: "07:00",
      pause_minutes: 0,
    });
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Gespeichert", description: `${h}h gebucht` });
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
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Lädt…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Zeiterfassung</h1>
            <Badge variant="outline">Freier Mitarbeiter</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{userName}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
              <LogOut className="w-4 h-4" /> Abmelden
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Neue Projektstunden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Datum</Label>
              <Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} />
            </div>
            <div>
              <Label>Projekt</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger><SelectValue placeholder="Projekt auswählen…" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stunden</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="24"
                inputMode="decimal"
                placeholder="z.B. 4.5"
                value={form.stunden}
                onChange={(e) => setForm({ ...form, stunden: e.target.value })}
              />
            </div>
            <div>
              <Label>Tätigkeit <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                value={form.taetigkeit}
                onChange={(e) => setForm({ ...form, taetigkeit: e.target.value })}
                placeholder="z.B. Aufmaß, Montage, Abnahme…"
              />
            </div>
            <Button onClick={save} disabled={saving} className="w-full gap-2">
              <Plus className="w-4 h-4" /> {saving ? "Speichert…" : "Stunden erfassen"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Meine letzten Einträge</CardTitle>
              <div className="text-xs text-muted-foreground">
                Diesen Monat: <span className="font-semibold text-foreground">{totalThisMonth.toFixed(2)}h</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {myEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Noch keine Einträge.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Datum</TableHead>
                    <TableHead>Projekt</TableHead>
                    <TableHead className="text-right">Stunden</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myEntries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{format(parseISO(e.datum), "dd.MM.yy", { locale: de })}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium truncate max-w-[180px]">{e.projects?.name || "—"}</div>
                        {e.taetigkeit && <div className="text-xs text-muted-foreground truncate max-w-[180px]">{e.taetigkeit}</div>}
                      </TableCell>
                      <TableCell className="text-right font-medium">{Number(e.stunden).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteEntry(e.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
