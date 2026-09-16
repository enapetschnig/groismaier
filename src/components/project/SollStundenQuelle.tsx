// ============================================================================
// Woher kommen die Soll-Stunden des Projekts? (Kundenwunsch 16.09.2026)
// Angebot (automatisch) · Kalkulation verknüpfen · händisch eintragen.
// Sitzt im Stundenabgleich der Projektseite, nur für Administratoren.
// ============================================================================
import { useEffect, useState } from "react";
import { Calculator, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ladeKalkulationenZurAuswahl, speichereGeplanteStunden, verknuepfeKalkulation,
  type KalkulationKurz, type SollStunden,
} from "@/lib/projektSollStunden";

interface Props {
  projectId: string;
  /** Aus dem Angebot errechnet (null = kein Angebot mit Stunden). */
  angebotStunden: number | null;
  /** Händisch/Kalkulation — null = Angebot gilt. */
  quelle: SollStunden | null;
  onGeaendert: () => void;
}

type Modus = "angebot" | "kalkulation" | "manuell";

export function SollStundenQuelle({ projectId, angebotStunden, quelle, onGeaendert }: Props) {
  const { toast } = useToast();
  const [modus, setModus] = useState<Modus>(quelle?.quelle ?? "angebot");
  const [kalkId, setKalkId] = useState<string>(quelle?.kalkulationId ?? "");
  const [stundenText, setStundenText] = useState(quelle?.quelle === "manuell" ? String(quelle.stunden).replace(".", ",") : "");
  const [kalks, setKalks] = useState<KalkulationKurz[]>([]);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    setModus(quelle?.quelle ?? "angebot");
    setKalkId(quelle?.kalkulationId ?? "");
    if (quelle?.quelle === "manuell") setStundenText(String(quelle.stunden).replace(".", ","));
  }, [quelle]);
  useEffect(() => { void ladeKalkulationenZurAuswahl().then(setKalks); }, []);

  const speichern = async () => {
    setSpeichert(true);
    let fehler: string | null = null;
    if (modus === "manuell") {
      const h = Number(stundenText.replace(",", "."));
      if (!(h > 0) || h > 100000) { setSpeichert(false); toast({ variant: "destructive", title: "Bitte Stunden eingeben", description: "Eine Zahl größer 0." }); return; }
      fehler = await speichereGeplanteStunden(projectId, Math.round(h * 10) / 10);
    } else if (modus === "kalkulation") {
      if (!kalkId) { setSpeichert(false); toast({ variant: "destructive", title: "Bitte eine Kalkulation wählen" }); return; }
      // Handeingabe löschen, sonst würde sie weiter vorgehen.
      fehler = (await speichereGeplanteStunden(projectId, null)) || (await verknuepfeKalkulation(projectId, kalkId));
    } else {
      fehler = (await speichereGeplanteStunden(projectId, null)) || (await verknuepfeKalkulation(projectId, null));
    }
    setSpeichert(false);
    if (fehler) { toast({ variant: "destructive", title: "Nicht gespeichert", description: fehler }); return; }
    toast({ title: "Soll-Stunden gespeichert" });
    onGeaendert();
  };

  const kalkLabel = (k: KalkulationKurz) => {
    const ort = k.kundeName || k.bauvorhaben;
    const fremd = k.project_id && k.project_id !== projectId ? " · schon an anderem Projekt" : "";
    return `${k.name}${ort && ort !== k.name ? ` (${ort})` : ""}${fremd}`;
  };

  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-2.5 text-xs">
      <div className="mb-1.5 font-medium text-muted-foreground">Woher kommen die Soll-Stunden?</div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={modus} onValueChange={(v) => setModus(v as Modus)}>
          <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="angebot">Aus dem Angebot{angebotStunden != null ? ` (${angebotStunden.toFixed(1)} h)` : " (keine Stunden)"}</SelectItem>
            <SelectItem value="kalkulation">Aus einer Kalkulation</SelectItem>
            <SelectItem value="manuell">Händisch eintragen</SelectItem>
          </SelectContent>
        </Select>
        {modus === "kalkulation" && (
          <Select value={kalkId} onValueChange={setKalkId}>
            <SelectTrigger className="h-9 w-[300px]"><SelectValue placeholder="Kalkulation wählen …" /></SelectTrigger>
            <SelectContent>
              {kalks.map((k) => <SelectItem key={k.id} value={k.id}>{kalkLabel(k)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {modus === "manuell" && (
          <div className="flex items-center gap-1">
            <Input inputMode="decimal" className="h-9 w-24" placeholder="z. B. 120" value={stundenText} onChange={(e) => setStundenText(e.target.value)} />
            <span>Std.</span>
          </div>
        )}
        <Button size="sm" variant="outline" className="h-9" onClick={() => void speichern()} disabled={speichert}>
          <Save className="mr-1 h-3.5 w-3.5" /> {speichert ? "Speichert …" : "Übernehmen"}
        </Button>
      </div>
      <p className="mt-1.5 text-muted-foreground">
        <Calculator className="mr-1 inline h-3 w-3" />
        Kalkulation: Summe der Arbeitsstunden aller Aufbauten (Arbeitszeit-Spalte der Kalkulation).
        Händisch gilt vor Kalkulation, Kalkulation vor Angebot.
      </p>
    </div>
  );
}
