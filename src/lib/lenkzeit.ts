// ============================================================================
// Lenkzeitvergütung — Regeln an EINER Stelle (Kundenvorgabe 02.09.2026)
//
//   „Entfernung zur Baustelle nach Google Maps inkl. Zeit … bei mindestens
//    25 min Reisezeit (EINE Strecke) soll diese Zeit automatisch bei
//    Stundenbuchungen als Lenkzeitvergütung gebucht werden.
//    Für Fahrer/Beifahrer braucht es zwei Kästchen … der Fahrer bekommt
//    dann etwas mehr Geld.
//    Projekte unter 25 min werden als normale Arbeitszeit gebucht —
//    dazu braucht es keine Sonderbuchungen."
//
// Bewusst getrennt vom Bildschirm gehalten: Die Zeiterfassung, die
// Stundenauswertung und der Export müssen dieselbe Zahl liefern.
// ============================================================================

/** Ab dieser Reisezeit je Strecke gibt es Lenkzeitvergütung. */
export const LENKZEIT_SCHWELLE_MINUTEN = 25;

export interface LenkzeitSaetze {
  /** €/Stunde Lenkzeit, wenn der Mitarbeiter selbst fährt. */
  fahrer: number;
  /** €/Stunde Lenkzeit als Beifahrer. */
  beifahrer: number;
}

/**
 * Ist die Fahrt zu diesem Projekt vergütungspflichtig?
 * Maßstab ist die Reisezeit EINER Strecke — so gibt der Chef sie aus
 * Google Maps ein.
 */
export function istLenkzeitPflichtig(
  fahrzeitMinutenEineStrecke: number | null | undefined,
  schwelle: number = LENKZEIT_SCHWELLE_MINUTEN,
): boolean {
  const min = Number(fahrzeitMinutenEineStrecke) || 0;
  return min >= schwelle;
}

/**
 * Vergütete Lenkzeit eines Arbeitstages in Minuten.
 *
 * Hin- UND Rückfahrt (× 2), denn gefahren wird beides — unter der Schwelle
 * gibt es 0, dann zählt die Zeit wie normale Arbeitszeit weiter.
 */
export function lenkzeitMinutenProTag(
  fahrzeitMinutenEineStrecke: number | null | undefined,
  schwelle: number = LENKZEIT_SCHWELLE_MINUTEN,
): number {
  if (!istLenkzeitPflichtig(fahrzeitMinutenEineStrecke, schwelle)) return 0;
  return Math.round((Number(fahrzeitMinutenEineStrecke) || 0) * 2);
}

/**
 * Betrag für eine Buchung. Fahrer und Beifahrer schließen einander aus —
 * ist beides angehakt, gewinnt der (höhere) Fahrer-Satz, weil derjenige
 * tatsächlich gefahren ist.
 */
export function lenkzeitBetrag(
  minuten: number | null | undefined,
  rolle: { istFahrer?: boolean | null; istBeifahrer?: boolean | null },
  saetze: LenkzeitSaetze,
): number {
  const min = Number(minuten) || 0;
  if (min <= 0) return 0;
  const satz = rolle.istFahrer ? Number(saetze.fahrer) || 0
    : rolle.istBeifahrer ? Number(saetze.beifahrer) || 0
    : 0;
  if (satz <= 0) return 0;
  return Math.round((min / 60) * satz * 100) / 100;
}

/** Anzeigetext für Listen und Auswertung: „1:40 h" statt „100 min". */
export function lenkzeitText(minuten: number | null | undefined): string {
  const min = Math.max(0, Math.round(Number(minuten) || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

/**
 * Summe je Mitarbeiter für die Stundenauswertung / Lohnverrechnung.
 * Die Sätze kommen je Mitarbeiter herein (Stammdaten), damit unterschiedliche
 * Vergütungen korrekt zusammengerechnet werden.
 */
export interface LenkzeitBuchung {
  userId: string;
  lenkzeitMinuten: number;
  istFahrer?: boolean | null;
  istBeifahrer?: boolean | null;
}

export interface LenkzeitSumme {
  userId: string;
  minutenFahrer: number;
  minutenBeifahrer: number;
  betrag: number;
}

export function lenkzeitJeMitarbeiter(
  buchungen: LenkzeitBuchung[],
  saetzeJeMitarbeiter: (userId: string) => LenkzeitSaetze,
): LenkzeitSumme[] {
  const map = new Map<string, LenkzeitSumme>();
  for (const b of buchungen || []) {
    const min = Number(b.lenkzeitMinuten) || 0;
    if (min <= 0 || !b.userId) continue;
    const eintrag = map.get(b.userId)
      || { userId: b.userId, minutenFahrer: 0, minutenBeifahrer: 0, betrag: 0 };
    // Fahrer gewinnt, wenn beides angehakt ist (siehe lenkzeitBetrag).
    if (b.istFahrer) eintrag.minutenFahrer += min;
    else if (b.istBeifahrer) eintrag.minutenBeifahrer += min;
    eintrag.betrag = Math.round((eintrag.betrag + lenkzeitBetrag(min, b, saetzeJeMitarbeiter(b.userId))) * 100) / 100;
    map.set(b.userId, eintrag);
  }
  return [...map.values()];
}
