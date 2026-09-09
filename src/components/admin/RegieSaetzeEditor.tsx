// ============================================================================
// Sätze für Regiearbeiten pflegen (Kundenwunsch 09.09.2026)
//
// Sie stehen am Ende jedes Angebots (Platzhalter {{regiesaetze}} im
// Schlusstext) und dienen als Vorschlag beim Abrechnen von Regieberichten.
//
// Die Liste liegt bewusst hier unter Einstellungen und nicht nur im
// Kalkulations-Editor: Dort war sie erst nach dem Öffnen irgendeiner
// Kalkulation erreichbar — „Einstellungs-Menü im Kalkulationsbereich gibt es
// bei mir nicht" (Kundenmeldung 09.09.2026).
// ============================================================================
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Save, Trash2, Euro } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatForInput, parseDecimal } from "@/lib/num";
import { ladeRegieSaetze, type RegieSatz } from "@/lib/regieSaetze";
import { regieSaetzeVergessen } from "@/lib/documentTextsLoader";

const tabelle = () => (supabase.from("regie_saetze" as never) as any);

export function RegieSaetzeEditor() {
  const { toast } = useToast();
  const [saetze, setSaetze] = useState<RegieSatz[]>([]);
  const [roh, setRoh] = useState<Record<string, string>>({});
  const [speichert, setSpeichert] = useState(false);

  const laden = async () => setSaetze(await ladeRegieSaetze(false));
  useEffect(() => { void laden(); }, []);

  const aendern = (id: string, patch: Partial<RegieSatz>) =>
    setSaetze((alt) => alt.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const neu = (gruppe: "personal" | "fahrzeug") => {
    const maxSort = Math.max(0, ...saetze.filter((r) => r.gruppe === gruppe).map((r) => r.sort));
    setSaetze((alt) => [...alt, {
      id: `neu-${Date.now()}`, gruppe, bezeichnung: "", betrag: 0,
      einheit: gruppe === "personal" ? "Std" : "km", sort: maxSort + 10, aktiv: true,
    }]);
  };

  const speichern = async () => {
    if (saetze.some((r) => !r.bezeichnung.trim())) {
      toast({ variant: "destructive", title: "Bezeichnung fehlt", description: "Bitte bei jedem Satz eine Bezeichnung eintragen oder die Zeile löschen." });
      return;
    }
    setSpeichert(true);
    const fehler: string[] = [];
    for (const r of saetze.filter((x) => !x.id.startsWith("neu-"))) {
      const { error } = await tabelle().update({
        gruppe: r.gruppe, bezeichnung: r.bezeichnung.trim(), betrag: r.betrag,
        einheit: r.einheit, sort: r.sort, aktiv: r.aktiv, updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (error) fehler.push(error.message);
    }
    const neue = saetze.filter((x) => x.id.startsWith("neu-"));
    if (neue.length > 0) {
      const { error } = await tabelle().insert(neue.map((r) => ({
        gruppe: r.gruppe, bezeichnung: r.bezeichnung.trim(), betrag: r.betrag,
        einheit: r.einheit, sort: r.sort, aktiv: r.aktiv,
      })));
      if (error) fehler.push(error.message);
    }
    setSpeichert(false);
    if (fehler.length > 0) {
      toast({ variant: "destructive", title: "Nicht gespeichert", description: `Nur Administratoren dürfen die Sätze ändern: ${fehler[0]}` });
      return;
    }
    regieSaetzeVergessen();   // der Angebotstext hält sie zwischengespeichert
    setRoh({});
    await laden();
    toast({ title: "Gespeichert", description: "Die Sätze stehen ab sofort in jedem neuen Angebot." });
  };

  const loeschen = async (r: RegieSatz) => {
    if (r.id.startsWith("neu-")) { setSaetze((alt) => alt.filter((x) => x.id !== r.id)); return; }
    const { error } = await tabelle().delete().eq("id", r.id);
    if (error) { toast({ variant: "destructive", title: "Nicht gelöscht", description: error.message }); return; }
    regieSaetzeVergessen();
    await laden();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Euro className="h-5 w-5" />
          Sätze für Regiearbeiten
        </CardTitle>
        <CardDescription>
          Stehen automatisch am Ende jedes Angebots und dienen als Vorschlag beim Abrechnen von
          Regieberichten. Änderst du hier einen Betrag, gilt er überall. Den Text drumherum pflegst
          du weiter unten bei den Dokumenttexten (Platzhalter <code>{"{{regiesaetze}}"}</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["personal", "fahrzeug"] as const).map((gruppe) => (
          <div key={gruppe}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {gruppe === "personal" ? "Personal (je Stunde)" : "Fahrzeuge (je Kilometer)"}
              </span>
              <Button variant="outline" size="sm" className="h-9" onClick={() => neu(gruppe)}>
                <Plus className="mr-1 h-4 w-4" /> Satz
              </Button>
            </div>
            <div className="space-y-1.5">
              {saetze.filter((r) => r.gruppe === gruppe).sort((a, b) => a.sort - b.sort).map((r) => (
                <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${r.aktiv ? "" : "opacity-50"}`}>
                  <Input
                    className="h-10 min-w-0 flex-1"
                    value={r.bezeichnung}
                    placeholder={gruppe === "personal" ? "z. B. Vorarbeiter" : "z. B. Montagebus"}
                    onChange={(e) => aendern(r.id, { bezeichnung: e.target.value })}
                  />
                  <div className="relative w-28 shrink-0">
                    <Input
                      className="h-10 pr-6 text-right"
                      inputMode="decimal"
                      value={roh[r.id] ?? formatForInput(r.betrag)}
                      onChange={(e) => {
                        setRoh((alt) => ({ ...alt, [r.id]: e.target.value }));
                        const z = parseDecimal(e.target.value);
                        if (z !== null) aendern(r.id, { betrag: z });
                      }}
                      onBlur={() => setRoh((alt) => { const n = { ...alt }; delete n[r.id]; return n; })}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                  </div>
                  <select
                    className="h-10 w-24 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                    value={r.einheit}
                    onChange={(e) => aendern(r.id, { einheit: e.target.value })}
                  >
                    <option value="Std">/Std</option>
                    <option value="km">/km</option>
                    <option value="Tag">/Tag</option>
                    <option value="Einsatz">/Einsatz</option>
                  </select>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" className="h-4 w-4" checked={r.aktiv}
                      onChange={(e) => aendern(r.id, { aktiv: e.target.checked })} />
                    im Angebot
                  </label>
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Satz löschen" onClick={() => void loeschen(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {saetze.filter((r) => r.gruppe === gruppe).length === 0 && (
                <p className="px-1 py-2 text-sm text-muted-foreground">Noch kein Satz angelegt.</p>
              )}
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={speichern} disabled={speichert}>
            <Save className="mr-2 h-4 w-4" />
            {speichert ? "Speichert…" : "Sätze speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
