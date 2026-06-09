import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Calculator, FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/**
 * Auftragskalkulation — Holzbau Groismaier
 *
 * Bindet das vollständige, eigenständige Kalkulations-Tool
 * (public/auftragskalkulation-tool.html) als Iframe in die App ein. Das Tool
 * enthält die komplette GROISMAIER-Auftrags- und Nachkalkulation
 * (Aufbauten/Material, Holzberechnung, Arbeitszeit, Nachkalkulation,
 * Lohnlackierung) und persistiert eigene Daten im localStorage.
 *
 * Brücke "➜ Angebot erstellen": Da das Tool same-origin im Iframe läuft,
 * liest die Wrapper-Seite die gerenderte Projektübersicht-Tabelle direkt
 * aus dem Iframe-DOM aus, wandelt die Aufbauten in Angebots-Positionen
 * (m²-basiert) um und legt sie in sessionStorage ab. Anschließend wird
 * der Angebots-Editor mit ?from_kalkulation=1 geöffnet, der die
 * Positionen automatisch übernimmt.
 */

/** Parst einen deutschen Euro-String ("10.200,00 €") in eine Zahl. */
function parseEuro(s: string | null | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface KalkPosition {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
}

export default function Auftragskalkulation() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleUebernehmen = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      toast({ variant: "destructive", title: "Kalkulation nicht bereit", description: "Bitte warte, bis die Kalkulation vollständig geladen ist." });
      return;
    }

    // Projektübersicht-Tabelle finden (Header enthalten "Aufbau" + "pro qm")
    let table: HTMLTableElement | null = null;
    doc.querySelectorAll("table").forEach((t) => {
      const heads = Array.from(t.querySelectorAll("th")).map((th) => (th.textContent || "").trim().toLowerCase());
      if (heads.includes("aufbau") && heads.some((h) => h.includes("pro qm"))) table = t as HTMLTableElement;
    });
    if (!table) {
      toast({ variant: "destructive", title: "Keine Kalkulation gefunden", description: "Bitte zuerst im Tab 'Aufbau Kalkulation' Positionen anlegen." });
      return;
    }

    const positions: KalkPosition[] = [];
    let projektGesamt = 0;
    // Alle Zeilen (tbody + tfoot): die "Gesamt (Projekt)"-Summenzeile steht
    // ggf. im tfoot. Die Kopfzeile (th statt td) wird automatisch übersprungen.
    (table as HTMLTableElement).querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
      if (cells.length < 6) return;
      const name = cells[0];
      const notiz = cells[1];
      const gesamt = parseEuro(cells[4]);
      const proQm = parseEuro(cells[5]);
      // Summenzeile "Gesamt (Projekt)" separat erfassen, nicht als Position
      if (/gesamt\s*\(projekt\)/i.test(name)) { projektGesamt = gesamt; return; }
      if (gesamt <= 0) return; // leere Aufbauten überspringen
      const beschreibung = notiz ? `${name}\n${notiz}` : name;
      if (proQm > 0) {
        positions.push({
          beschreibung,
          menge: round2(gesamt / proQm),
          einheit: "m²",
          einzelpreis: round2(proQm),
          gesamtpreis: round2(gesamt),
        });
      } else {
        positions.push({ beschreibung, menge: 1, einheit: "Pauschale", einzelpreis: round2(gesamt), gesamtpreis: round2(gesamt) });
      }
    });

    if (positions.length === 0) {
      toast({ variant: "destructive", title: "Noch nichts kalkuliert", description: "Es wurden keine Aufbauten mit Betrag gefunden. Bitte zuerst eine Kalkulation erstellen." });
      return;
    }

    // Differenz zwischen Projekt-Gesamt und Summe der Aufbauten (Transport,
    // Kran, Spedition, Lohnlackierung, Sonstiges) als eine Sammelposition.
    const summe = positions.reduce((s, p) => s + p.gesamtpreis, 0);
    const nebenkosten = round2(projektGesamt - summe);
    if (nebenkosten > 0.5) {
      positions.push({
        beschreibung: "Transport, Kran & sonstige Nebenkosten (lt. Kalkulation)",
        menge: 1, einheit: "Pauschale", einzelpreis: nebenkosten, gesamtpreis: nebenkosten,
      });
    }

    // Projektname als Betreff
    const projektInput = doc.querySelector('input[placeholder*="Projektname"]') as HTMLInputElement | null;
    const projektName = (projektInput?.value || "").trim();
    const betreff = projektName ? `Angebot – ${projektName}` : "Angebot lt. Kalkulation";

    sessionStorage.setItem("kalkulation_to_angebot", JSON.stringify({ betreff, items: positions }));
    navigate("/invoices/new?typ=angebot&from_kalkulation=1");
  };

  return (
    <div className="flex flex-col h-[100dvh]">
      <PageHeader title="Auftragskalkulation" />

      <div className="px-3 sm:px-4 lg:px-6 py-2 border-b bg-card flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground hidden md:flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          Aufbauten, Material, Holzberechnung, Arbeitszeit, Nachkalkulation &amp; Lohnlackierung
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" onClick={handleUebernehmen} title="Aufbauten dieser Kalkulation als Positionen in ein neues Angebot übernehmen">
            <FileText className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Als Angebot übernehmen</span>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/auftragskalkulation-tool.html" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Neuer Tab</span>
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 relative bg-white">
        <iframe
          ref={iframeRef}
          src="/auftragskalkulation-tool.html"
          title="Auftragskalkulation Holzbau Groismaier"
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    </div>
  );
}
