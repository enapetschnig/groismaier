import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Trash2, Package, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { parseDecimal, toNumber } from "@/lib/num";

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
  const [toDelete, setToDelete] = useState<MaterialEntry | null>(null);

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
      // menge steht als Text in der DB — parseDecimal versteht auch Altbestand
      // mit deutschem Komma ("12,5"), nicht nur das kanonische "12.5".
      const menge = toNumber(e.menge, 0);
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

    // Menge ist PFLICHT — ohne Menge kann weder die Verbrauchsübersicht noch
    // die Nachkalkulation etwas rechnen (der Eintrag wäre nur Text).
    const mengeNum = parseDecimal(newMenge);
    if (mengeNum === null || mengeNum <= 0) {
      toast({ variant: "destructive", title: "Menge fehlt", description: 'Bitte eine Menge größer 0 eingeben (z.B. "12,5").' });
      return;
    }
    const preisNum = parseDecimal(newEinzelpreis);
    if (newEinzelpreis.trim() && preisNum === null) {
      toast({ variant: "destructive", title: "Einzelpreis ungültig", description: 'Bitte als Zahl eingeben, z.B. "8,40".' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("material_entries").insert({
      project_id: projectId,
      user_id: currentUserId,
      material: newMaterial.trim(),
      // KANONISCH mit Punkt speichern ("12.5"), NICHT die Roheingabe "12,5":
      // die Nachkalkulation liest diese Spalte mit parseFloat — aus "12,5"
      // würde dort sonst still 12 statt 12,5.
      menge: String(mengeNum),
      einheit: newEinheit,
      einzelpreis: preisNum ?? 0,
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

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("material_entries").delete().eq("id", toDelete.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Eintrag konnte nicht gelöscht werden" });
    } else {
      toast({ title: "Gelöscht" });
      fetchEntries();
    }
    setToDelete(null);
  };

  const canEditOrDelete = (entry: MaterialEntry) => isAdmin || entry.user_id === currentUserId;
  const summary = getSummary();
  // Gesamtwert = exakt die Formel, die auch die Nachkalkulation verwendet.
  const gesamtWert = summary.reduce((s, m) => s + m.verbrauch * m.einzelpreis, 0);

  /** Geldbetrag österreichisch: € 1.234,56 */
  const eur = (n: number) =>
    `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /** Menge ohne unnötige Nachkommastellen: 150 statt 150,0 — 12,5 bleibt 12,5. */
  const formatMenge = (n: number) =>
    n.toLocaleString("de-AT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">Verbrauchsübersicht</CardTitle>
                <Button variant="ghost" size="sm" className="h-11" onClick={() => setShowSummary(!showSummary)}>
                  {showSummary ? "Ausblenden" : "Anzeigen"}
                </Button>
              </div>
            </CardHeader>
            {showSummary && (
              <CardContent>
                <div className="space-y-2">
                  {/* Auch Zeilen mit Netto-Rückgabe (negativer Verbrauch) zeigen —
                      sonst verschwindet zurückgegebenes Material spurlos. */}
                  {summary.filter(s => s.verbrauch !== 0).map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border">
                      <div className="min-w-0">
                        <p className="font-medium text-sm break-words">{s.material}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.einzelpreis > 0 && `${eur(s.einzelpreis)} / ${s.einheit}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold tabular-nums">{formatMenge(s.verbrauch)} {s.einheit}</p>
                        {s.einzelpreis > 0 && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {eur(s.verbrauch * s.einzelpreis)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Materialkosten GESAMT — die Zahl, die auch in der
                    Nachkalkulation als Materialkosten auftaucht. */}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">Materialkosten gesamt</p>
                    <p className="text-xs text-muted-foreground">
                      Entnahme + Verbrauch − Rückgabe, je × EK — fließt so in die Nachkalkulation
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular-nums shrink-0">{eur(gesamtWert)}</p>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Einträge */}
        <Card>
          <CardHeader>
            {/* flex-wrap + min-w-0: am Handy (390px) rutscht der Button unter den
                Titel, statt die Karte über den Bildschirmrand zu schieben. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 shrink-0" />
                  Materialbewegungen
                </CardTitle>
                <CardDescription>{entries.length} {entries.length === 1 ? "Eintrag" : "Einträge"}</CardDescription>
              </div>
              {!showForm && (
                <Button onClick={() => setShowForm(true)} className="h-11 shrink-0">
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
                    <Input value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} placeholder="z.B. Fliese 30x60" className="h-11" required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Typ</label>
                    <Select value={newTyp} onValueChange={setNewTyp}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entnahme">Entnahme</SelectItem>
                        <SelectItem value="rueckgabe">Rückgabe</SelectItem>
                        <SelectItem value="verbrauch">Verbrauch (direkt)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Menge *</label>
                    {/* type="text" + inputMode="decimal": mit type="number" konnte
                        man "12,5" gar nicht eintippen (Browser verwirft das Komma). */}
                    <Input
                      value={newMenge}
                      onChange={(e) => setNewMenge(e.target.value)}
                      placeholder="z.B. 12,5"
                      type="text"
                      inputMode="decimal"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Einheit</label>
                    <Select value={newEinheit} onValueChange={setNewEinheit}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {einheiten.map(e => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Einkaufspreis je Einheit (€)</label>
                    <Input
                      value={newEinzelpreis}
                      onChange={(e) => setNewEinzelpreis(e.target.value)}
                      placeholder="z.B. 8,40"
                      type="text"
                      inputMode="decimal"
                      className="h-11"
                    />
                  </div>
                </div>
                {/* Live-Zwischensumme: der Erfasser sieht sofort, was die
                    Bewegung wert ist — Tippfehler (Faktor 100) fallen auf. */}
                {parseDecimal(newMenge) !== null && parseDecimal(newEinzelpreis) !== null && (
                  <p className="text-sm text-muted-foreground">
                    Wert dieser Bewegung:{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {eur(toNumber(newMenge) * toNumber(newEinzelpreis))}
                    </span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="h-11" disabled={submitting || !newMaterial.trim()}>
                    {submitting ? "Speichert..." : "Speichern"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setShowForm(false)}>Abbrechen</Button>
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
                {entries.map((entry) => {
                  const menge = toNumber(entry.menge, 0);
                  const ek = Number(entry.einzelpreis) || 0;
                  return (
                    <div key={entry.id} className="p-3 rounded-lg border bg-card flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="mt-1 shrink-0">{typIcon(entry.typ)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-sm break-words">{entry.material}</p>
                            <Badge variant="secondary" className={`text-xs shrink-0 ${typColor(entry.typ)}`}>
                              {typLabel(entry.typ)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground break-words">
                            {entry.menge && `${formatMenge(menge)} ${entry.einheit || ""}`}
                            {ek > 0 ? ` × ${eur(ek)} = ` : ""}
                            {ek > 0 ? <span className="font-medium text-foreground tabular-nums">{eur(menge * ek)}</span> : null}
                            {entry.profiles ? ` · ${entry.profiles.vorname} ${entry.profiles.nachname}` : ""}
                            {" · "}
                            {entry.datum ? new Date(entry.datum).toLocaleDateString("de-AT") : new Date(entry.created_at).toLocaleDateString("de-AT")}
                          </p>
                        </div>
                      </div>
                      {canEditOrDelete(entry) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${entry.material} löschen`}
                          className="h-11 w-11 shrink-0"
                          onClick={() => setToDelete(entry)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Löschen erst nach Rückfrage — ein Fehlgriff auf dem Handy hat sonst
          still eine Materialbewegung (und damit Nachkalkulations-Kosten) gelöscht. */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Materialbewegung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{toDelete?.material}</strong>
              {toDelete?.menge ? ` (${formatMenge(toNumber(toDelete.menge, 0))} ${toDelete.einheit || ""})` : ""}
              {" "}wird entfernt. Die Materialkosten in der Nachkalkulation sinken entsprechend.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ja, löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MaterialList;
