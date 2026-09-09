// ============================================================================
// Stundensatz für Regiestunden vorschlagen (Kundenwunsch 09.09.2026)
//
// „dass die Stundensätze beim Import aus Regieberichten mit dem vorhandenen
//  Angebot abgeglichen werden"
//
// Entschieden am 09.09.2026: DAS ANGEBOT GEWINNT. Was dem Kunden zugesagt
// wurde, wird auch verrechnet. Erst wenn im Angebot kein Stundensatz steht,
// greifen die Regie-Sätze aus den Stammdaten, zuletzt der Wert aus den
// Einstellungen.
//
// Bewusst ohne KI: Die Quellen sind eindeutig, und beim Geld will man keine
// geratene Zuordnung. Gefunden wird über die Einheit (Std/h) und – wenn
// mehrere Sätze im Angebot stehen – über das Stichwort im Positionstext
// (Vorarbeiter, Facharbeiter, Hilfsarbeiter, Lehrling).
// ============================================================================
import type { RegieSatz } from "./regieSaetze";

export interface AngebotsPosition {
  beschreibung?: string | null;
  einheit?: string | null;
  einzelpreis?: number | null;
  /** Detailzeilen eines Aufbaus tragen keinen eigenen Betrag — sie zählen nicht. */
  gruppe?: string | null;
  ist_gruppensumme?: boolean | null;
}

export interface SatzQuelle {
  betrag: number;
  /** Woher der Vorschlag stammt — steht so in der Oberfläche. */
  herkunft: "angebot" | "stammdaten" | "einstellung";
  /** Klartext für die Anzeige, z. B. „Angebot: Zimmerer Facharbeiter". */
  bezeichnung: string;
}

/** Zählt die Position als Stundenposition? (Einheit h/Std, mit Preis) */
export const istStundenPosition = (p: AngebotsPosition): boolean => {
  const e = String(p.einheit || "").toLowerCase().replace(/\s|\./g, "");
  if (!["h", "std", "std", "stunde", "stunden", "akh"].includes(e)) return false;
  if (!(Number(p.einzelpreis) || 0)) return false;
  // Detailzeile eines Aufbaus: trägt nur zur Information Menge und Preis,
  // ihr Betrag steckt in der Sammelzeile — als Satzquelle trotzdem brauchbar.
  return true;
};

/** Stichwörter, an denen sich eine Qualifikation erkennen lässt. */
const STICHWORTE: { schluessel: string; muster: RegExp }[] = [
  { schluessel: "vorarbeiter", muster: /vorarbeiter|polier|partieführer|partiefuehrer/i },
  { schluessel: "facharbeiter", muster: /facharbeiter|geselle|zimmerer(?!.*lehr)|monteur/i },
  { schluessel: "hilfsarbeiter", muster: /hilfsarbeiter|helfer|hilfskraft/i },
  { schluessel: "lehrling", muster: /lehrling|lehrjahr|\blj\b/i },
];

/** Qualifikation aus einem Text erkennen; null = keine erkannt. */
export function qualifikationAus(text: string | null | undefined): string | null {
  const t = String(text || "");
  for (const s of STICHWORTE) if (s.muster.test(t)) return s.schluessel;
  return null;
}

/**
 * Stundensätze, die im Angebot tatsächlich verwendet wurden.
 * Ergebnis: Qualifikation → Satz, plus ein Eintrag "" für den Fall, dass
 * sich keine Qualifikation erkennen lässt (dann gilt der häufigste Satz).
 */
export function saetzeAusAngebot(positionen: AngebotsPosition[]): Map<string, SatzQuelle> {
  const treffer = new Map<string, SatzQuelle>();
  const alle: { betrag: number; text: string }[] = [];
  for (const p of positionen || []) {
    if (!istStundenPosition(p)) continue;
    const betrag = Math.round((Number(p.einzelpreis) || 0) * 100) / 100;
    const text = String(p.beschreibung || "").trim();
    alle.push({ betrag, text });
    const q = qualifikationAus(text);
    if (q && !treffer.has(q)) {
      treffer.set(q, { betrag, herkunft: "angebot", bezeichnung: `Angebot: ${text.split("\n")[0].slice(0, 60)}` });
    }
  }
  if (alle.length > 0 && !treffer.has("")) {
    // Ohne erkennbare Qualifikation: der am häufigsten verwendete Satz;
    // bei Gleichstand der höchste (er ist im Zweifel der aktuellere).
    const zaehler = new Map<number, number>();
    for (const a of alle) zaehler.set(a.betrag, (zaehler.get(a.betrag) || 0) + 1);
    let bester = alle[0].betrag;
    let max = 0;
    for (const [betrag, n] of zaehler) {
      if (n > max || (n === max && betrag > bester)) { bester = betrag; max = n; }
    }
    const beispiel = alle.find((a) => a.betrag === bester)!;
    treffer.set("", {
      betrag: bester,
      herkunft: "angebot",
      bezeichnung: `Angebot: ${beispiel.text.split("\n")[0].slice(0, 60) || "Stundensatz"}`,
    });
  }
  return treffer;
}

/**
 * Der vorgeschlagene Satz für eine konkrete Regie-Zeile.
 *
 * @param text       Beschreibung der Regiezeile (enthält oft die Qualifikation)
 * @param ausAngebot Sätze des verknüpften Angebots (saetzeAusAngebot)
 * @param stammdaten Regie-Sätze aus den Stammdaten
 * @param einstellung Fallback aus app_settings.regie_stundensatz
 */
export function satzFuer(
  text: string | null | undefined,
  ausAngebot: Map<string, SatzQuelle>,
  stammdaten: RegieSatz[],
  einstellung: number,
): SatzQuelle {
  const q = qualifikationAus(text);
  // 1. Angebot, passend zur Qualifikation
  if (q && ausAngebot.has(q)) return ausAngebot.get(q)!;
  // 2. Stammdaten, passend zur Qualifikation
  if (q) {
    const s = (stammdaten || []).find(
      (r) => r.aktiv && r.gruppe === "personal" && qualifikationAus(r.bezeichnung) === q,
    );
    if (s) return { betrag: s.betrag, herkunft: "stammdaten", bezeichnung: `Stammdaten: ${s.bezeichnung}` };
  }
  // 3. Angebot allgemein
  if (ausAngebot.has("")) return ausAngebot.get("")!;
  // 4. Einstellung
  return { betrag: Math.round((einstellung || 0) * 100) / 100, herkunft: "einstellung", bezeichnung: "Einstellungen: Regie-Stundensatz" };
}
