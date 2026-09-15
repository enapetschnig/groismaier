// ============================================================================
// Admin → Einstellungen: Lenkzeitvergütung (Kundenmeldung 15.09.2026: „Die
// €/h richten sich nach dem KV und müssen anpassbar sein — vielleicht auch
// in den Einstellungen, um das bei Erhöhung ändern zu können").
//
// Bis dahin gab es die Sätze nur je Mitarbeiter unter Stammdaten/Personal;
// der betriebliche Standard stand mit 0 in der Datenbank und war nirgends
// änderbar — jede Lenkzeit war 0,00 €.
// ============================================================================
import { useEffect, useState } from "react";
import { Car, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ladeLenkzeitVorgaben, speichereLenkzeitVorgaben } from "@/lib/lenkzeitSaetze";

const alsText = (n: number) => String(n).replace(".", ",");
const alsZahl = (s: string) => Number(s.replace(",", "."));

export function LenkzeitSaetzeKarte() {
  const { toast } = useToast();
  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [fahrer, setFahrer] = useState("0");
  const [beifahrer, setBeifahrer] = useState("0");
  const [schwelle, setSchwelle] = useState("25");
  const [ausnahmen, setAusnahmen] = useState(0);

  useEffect(() => {
    void (async () => {
      const v = await ladeLenkzeitVorgaben();
      setFahrer(alsText(v.standard.fahrer));
      setBeifahrer(alsText(v.standard.beifahrer));
      setSchwelle(String(v.schwelleMinuten));
      setAusnahmen(v.proMitarbeiter.size);
      setLaedt(false);
    })();
  }, []);

  const speichern = async () => {
    const f = alsZahl(fahrer), b = alsZahl(beifahrer), s = alsZahl(schwelle);
    if (![f, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 200) || !(Number.isFinite(s) && s >= 1 && s <= 600)) {
      toast({ variant: "destructive", title: "Unplausibel", description: "Sätze 0–200 €/h, Schwelle 1–600 Minuten." });
      return;
    }
    setSpeichert(true);
    const fehler = await speichereLenkzeitVorgaben({ fahrer: f, beifahrer: b, schwelleMinuten: s });
    setSpeichert(false);
    if (fehler) toast({ variant: "destructive", title: "Nicht gespeichert", description: fehler });
    else toast({ title: "Lenkzeit-Sätze gespeichert", description: `Fahrer ${alsText(f)} €/h · Beifahrer ${alsText(b)} €/h · ab ${Math.round(s)} min je Strecke` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="h-5 w-5" />
          Lenkzeitvergütung
        </CardTitle>
        <CardDescription>
          Betrieblicher Standard laut Kollektivvertrag — gilt für alle, die unter
          Stammdaten/Personal keinen eigenen Satz haben. Bei einer KV-Erhöhung hier
          ändern; ab dem Speichern rechnen Auswertung und Excel mit dem neuen Satz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {laedt ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lade …</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="lenk-fahrer">Fahrer (€ je Stunde Lenkzeit)</Label>
                <Input id="lenk-fahrer" inputMode="decimal" value={fahrer} onChange={(e) => setFahrer(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lenk-beifahrer">Beifahrer (€ je Stunde Lenkzeit)</Label>
                <Input id="lenk-beifahrer" inputMode="decimal" value={beifahrer} onChange={(e) => setBeifahrer(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lenk-schwelle">Vergütet ab (Minuten je Strecke)</Label>
                <Input id="lenk-schwelle" inputMode="numeric" value={schwelle} onChange={(e) => setSchwelle(e.target.value)} className="h-11" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              So kommt eine Lenkzeit zustande: Beim Projekt steht „Fahrzeit einfach" (Minuten laut Google Maps).
              Liegt sie über der Schwelle, zeigt die Zeiterfassung bei diesem Projekt die Kästchen „Fahrer" /
              „Beifahrer"; die vergütete Zeit ist hin und retour. Mitgebuchte Kollegen sind automatisch Beifahrer.
              {ausnahmen > 0 && ` Derzeit ${ausnahmen} ${ausnahmen === 1 ? "Person" : "Personen"} mit Personal-Stammsatz — eigene Sätze dort gehen vor.`}
            </p>
            <Button onClick={() => void speichern()} disabled={speichert} className="h-11">
              <Save className="mr-2 h-4 w-4" />
              {speichert ? "Speichert …" : "Speichern"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
