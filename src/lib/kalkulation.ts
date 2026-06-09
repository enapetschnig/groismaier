// ============================================================================
// Holzbau Groismaier — Materialkalkulation
// ----------------------------------------------------------------------------
// Faithfully nachgebaut aus der Excel "Z_Kalkulation Vorlage 2026":
//
//   Materialkosten/EH = ek_preis · (1 + verschnitt%/100) · (1 + aufschlag%/100)
//   Lohnkosten/EH     = (arbeitszeit_minuten / 60) · stundensatz
//   Einzelpreis (VK)  = Materialkosten + befestigung + sonstiges + Lohnkosten
//
// "Aufschlag" ist die Marge auf das Material, "Verschnitt" der Materialverlust.
// Beides ist im Angebot pro Position anpassbar; zusätzlich gibt es einen
// dokumentweiten Aufschlag-Override (kalkulation_aufschlag_override).
// ============================================================================

export interface KalkulationInput {
  ek_preis: number;            // Einkaufspreis Material in EUR / Einheit
  verschnitt_prozent: number;  // Verschnitt-Zuschlag in % (z.B. 15)
  aufschlag_prozent: number;   // Material-Aufschlag (Marge) in % (z.B. 18)
  befestigung_preis: number;   // Befestigungsmaterial EUR / Einheit
  sonstiges_preis: number;     // Sonstiges EUR / Einheit
  arbeitszeit_minuten: number; // Montage-/Arbeitszeit in Minuten / Einheit
  stundensatz: number;         // Lohnsatz EUR / h
}

export interface KalkulationResult {
  materialkosten: number; // EK inkl. Verschnitt + Aufschlag
  lohnkosten: number;     // Arbeitszeit · Stundensatz
  zuschlaege: number;     // Befestigung + Sonstiges
  einzelpreis: number;    // Summe = VK / Einheit
}

export const DEFAULT_STUNDENSATZ = 52;   // Mittellohn (Excel)
export const REGIE_STUNDENSATZ = 50;      // Regiestundensatz (Excel)

export const EMPTY_KALKULATION: KalkulationInput = {
  ek_preis: 0,
  verschnitt_prozent: 0,
  aufschlag_prozent: 0,
  befestigung_preis: 0,
  sonstiges_preis: 0,
  arbeitszeit_minuten: 0,
  stundensatz: DEFAULT_STUNDENSATZ,
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Berechnet die Material-/Lohn-/Gesamtkosten einer Kalkulationsposition. */
export function calcKalkulation(input: Partial<KalkulationInput>): KalkulationResult {
  const ek = num(input.ek_preis);
  const verschnitt = num(input.verschnitt_prozent);
  const aufschlag = num(input.aufschlag_prozent);
  const befestigung = num(input.befestigung_preis);
  const sonstiges = num(input.sonstiges_preis);
  const minuten = num(input.arbeitszeit_minuten);
  const stundensatz = num(input.stundensatz);

  const materialkosten = ek * (1 + verschnitt / 100) * (1 + aufschlag / 100);
  const lohnkosten = (minuten / 60) * stundensatz;
  const zuschlaege = befestigung + sonstiges;
  const einzelpreis = round2(materialkosten + zuschlaege + lohnkosten);

  return {
    materialkosten: round2(materialkosten),
    lohnkosten: round2(lohnkosten),
    zuschlaege: round2(zuschlaege),
    einzelpreis,
  };
}

/** Nur der Verkaufs-Einzelpreis (gerundet auf 2 Stellen). */
export function calcEinzelpreis(input: Partial<KalkulationInput>): number {
  return calcKalkulation(input).einzelpreis;
}

/**
 * Wendet einen dokumentweiten Aufschlag-Override an: ist `override` gesetzt
 * (nicht null/undefined), wird er als aufschlag_prozent verwendet, sonst der
 * positionseigene Wert.
 */
export function effectiveAufschlag(
  positionAufschlag: number,
  override: number | null | undefined,
): number {
  return override === null || override === undefined || override === ("" as unknown)
    ? num(positionAufschlag)
    : num(override);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Liest die Kalkulationsfelder defensiv aus einem beliebigen Objekt (DB-Row). */
export function readKalkulation(row: Record<string, unknown> | null | undefined): KalkulationInput {
  if (!row) return { ...EMPTY_KALKULATION };
  return {
    ek_preis: num(row.ek_preis),
    verschnitt_prozent: num(row.verschnitt_prozent),
    aufschlag_prozent: num(row.aufschlag_prozent),
    befestigung_preis: num(row.befestigung_preis),
    sonstiges_preis: num(row.sonstiges_preis),
    arbeitszeit_minuten: num(row.arbeitszeit_minuten),
    stundensatz: num(row.stundensatz) || DEFAULT_STUNDENSATZ,
  };
}
