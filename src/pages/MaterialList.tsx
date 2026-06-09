import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Trash2, Package, Edit2, Check, X, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

type MaterialEntry = {
  id: string;
  project_id: string;
  user_id: string;
  material: string;
  menge: string | null;
  notizen: string | null;
  einheit: string | null;
  einzelpreis: number | null;
  typ: string | null;
  datum: string | null;
  created_at: string;
  profiles?: {
    vorname: string;
    nachname: string;
  } | null;
};

type MaterialSummary = {
  material: string;
  einheit: string;
  einzelpreis: number;
  entnahme: number;
  rueckgabe: number;
  verbrauch: number;
};

const MaterialList = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const [entries, setEntries] = useState<MaterialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(true);

  // New entry form
  const [showForm, setShowForm] = useState(false);
  const [newMaterial, setNewMaterial] = useState("");
  const [newMenge, setNewMenge] = useState("");
  const [newEinheit, setNewEinheit] = useState("Stk.");
  const [newEinzelpreis, setNewEinzelpreis] = useState("");
  const [newTyp, setNewTyp] = useState<string>("entnahme");
  const [newNotizen, setNewNotizen] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (projectId) {
      checkUserAndFetchData();
    }
  }, [projectId]);

  const checkUserAndFetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    setIsAdmin(roleData?.role === "administrator");
    await Promise.all([fetchProjectName(), fetchEntries()]);
    setLoading(false);
  };

  const fetchProjectName = async () => {
    if (!projectId) return;
    const { data } = await supabase.from("projects").select("name").eq("id", projectId).single();
    if (data) setProjectName(data.name);
  };

  const fetchEntries = async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from("material_entries")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, vorname, nachname")
        .in("id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      setEntries(data.map(entry => ({
        ...entry,
        profiles: profileMap.get(entry.user_id) || null,
      })) as MaterialEntry[]);
    }
  };

  const getSummary = (): MaterialSummary[] => {
    const map = new Map<string, MaterialSummary>();
    for (const e of entries) {
      const key = e.material.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          material: e.material,
          einheit: e.einheit || "Stk.",
          einzelpreis: e.einzelpreis || 0,
          entnahme: 0,
          rueckgabe: 0,
          verbrauch: 0,
        });
      }
      const s = map.get(key)!;
      const menge = parseFloat(e.menge || "0") || 0;
      if (e.typ === "entnahme") s.entnahme += menge;
      else if (e.typ === "rueckgabe") s.rueckgabe += menge;
      else s.verbrauch += menge;
      if (e.einzelpreis && e.einzelpreis > 0) s.einzelpreis = e.einzelpreis;
    }
    return Array.from(map.values()).map(s => ({
      ...s,
      verbrauch: s.verbrauch + s.entnahme - s.rueckgabe,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !currentUserId || !newMaterial.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("material_entries").insert({
      project_id: projectId,
      user_id: currentUserId,
      material: newMaterial.trim(),
      menge: newMenge.trim() || null,
      einheit: newEinheit,
      einzelpreis: parseFloat(newEinzelpreis) || 0,
      typ: newTyp,
      notizen: newNotizen.trim() || null,
      datum: new Date().toISOString().split("T")[0],
    });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht gespeichert werden" });
    } else {
      toast({ title: "Gespeichert" });
      setNewMaterial("");
      setNewMenge("");
      setNewEinzelpreis("");
      setNewNotizen("");
      setShowForm(false);
      fetchEntries();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("material_entries").delete().eq("id", id);
    if (!error) {
      toast({ title: "Gelöscht" });
      fetchEntries();
    }
  };

  const canEditOrDelete = (entry: MaterialEntry) => isAdmin || entry.user_id === currentUserId;
  const summary = getSummary();

  const typIcon = (typ: string | null) => {
    if (typ === "entnahme") return <ArrowUp className="h-3.5 w-3.5 text-red-500" />;
    if (typ === "rueckgabe") return <ArrowDown className="h-3.5 w-3.5 text-green-500" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const typLabel = (typ: string | null) => {
    if (typ === "entnahme") return "Entnahme";
    if (typ === "rueckgabe") return "Rückgabe";
    return "Verbrauch";
  };

  const typColor = (typ: string | null) => {
    if (typ === "entnahme") return "bg-red-100 text-red-800";
    if (typ === "rueckgabe") return "bg-green-100 text-green-800";
    return "bg-muted text-muted-foreground";
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={`${projectName} - Material`} backPath={`/projects/${projectId}`} />

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {/* Verbrauchsübersicht */}
        {summary.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Verbrauchsübersicht</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowSummary(!showSummary)}>
                  {showSummary ? "Ausblenden" : "Anzeigen"}
                </Button>
              </div>
            </CardHeader>
            {showSummary && (
              <CardContent>
                <div className="space-y-2">
                  {summary.filter(s => s.verbrauch > 0).map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                      <div>
                        <p className="font-medium text-sm">{s.material}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.einzelpreis > 0 && `€ ${s.einzelpreis.toFixed(2)} / ${s.einheit}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{s.verbrauch.toFixed(1)} {s.einheit}</p>
                        {s.einzelpreis > 0 && (
                          <p className="text-xs text-muted-foreground">
                            € {(s.verbrauch * s.einzelpreis).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Einträge */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Materialbewegungen
                </CardTitle>
                <CardDescription>{entries.length} Einträge</CardDescription>
              </div>
              {!showForm && (
                <Button onClick={() => setShowForm(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Erfassen
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {showForm && (
              <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Material *</label>
                    <Input value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} placeholder="z.B. Fliese 30x60" required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Typ</label>
                    <Select value={newTyp} onValueChange={setNewTyp}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entnahme">Entnahme</SelectItem>
                        <SelectItem value="rueckgabe">Rückgabe</SelectItem>
                        <SelectItem value="verbrauch">Verbrauch (direkt)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Menge</label>
                    <Input value={newMenge} onChange={(e) => setNewMenge(e.target.value)} placeholder="z.B. 25" type="number" step="0.1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Einheit</label>
                    <Select value={newEinheit} onValueChange={setNewEinheit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {einheiten.map(e => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Einzelpreis (€)</label>
                    <Input value={newEinzelpreis} onChange={(e) => setNewEinzelpreis(e.target.value)} placeholder="0.00" type="number" step="0.01" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting || !newMaterial.trim()}>
                    {submitting ? "Speichert..." : "Speichern"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
                </div>
              </form>
            )}

            {entries.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">Keine Einträge</p>
                <p className="text-sm text-muted-foreground">Erfasse die erste Materialentnahme</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="p-3 rounded-lg border bg-card flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {typIcon(entry.typ)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{entry.material}</p>
                          <Badge variant="secondary" className={`text-xs shrink-0 ${typColor(entry.typ)}`}>
                            {typLabel(entry.typ)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {entry.menge && `${entry.menge} ${entry.einheit || ""}`}
                          {entry.einzelpreis && entry.einzelpreis > 0 ? ` · € ${entry.einzelpreis.toFixed(2)}` : ""}
                          {" · "}
                          {entry.profiles ? `${entry.profiles.vorname} ${entry.profiles.nachname}` : ""}
                          {" · "}
                          {entry.datum ? new Date(entry.datum).toLocaleDateString("de-AT") : new Date(entry.created_at).toLocaleDateString("de-AT")}
                        </p>
                      </div>
                    </div>
                    {canEditOrDelete(entry) && (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(entry.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MaterialList;
