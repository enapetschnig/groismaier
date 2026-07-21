// ============================================================================
// Zahleneingabe im deutschen/österreichischen Format.
//
// HINTERGRUND (Edge-Case-Review 2026-07-21): Die App nutzte überall
// <Input type="number"> mit Number(e.target.value). Tippt ein Anwender
// "12,50" (die normale Schreibweise in Österreich), verwirft der Browser
// das Komma → aus 12,50 € wurden lautlos 1250,00 €. Faktor 100 zu viel,
// ohne jede Warnung. Gleiches Problem mit Tausenderpunkt ("1.250" → 1,25).
//
// parseDecimal() ist die zentrale, getestete Umrechnung:
//   "12,50"     → 12.5        "1.250,50" → 1250.5
//   "1.250"     → 1250        "12.50"    → 12.5   (englische Eingabe)
//   ""/"abc"    → null        "-5"       → -5
// ============================================================================

/**
 * Wandelt eine Benutzereingabe in eine Zahl um. Versteht deutsche Schreibweise
 * (Komma = Dezimaltrenner, Punkt = Tausendertrenner) UND englische Eingabe.
 * Gibt null zurück, wenn keine sinnvolle Zahl erkennbar ist.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = String(input).trim();
  if (!s) return null;

  // Währungszeichen, Leerzeichen und geschützte Leerzeichen entfernen.
  s = s.replace(/[€\s  ]/g, "");
  if (!s) return null;

  const hasKomma = s.includes(",");
  const hasPunkt = s.includes(".");

  if (hasKomma && hasPunkt) {
    // Beides vorhanden: das WEITER RECHTS stehende Zeichen ist der Dezimaltrenner.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // 1.250,50 → 1250.50
    } else {
      s = s.replace(/,/g, ""); // 1,250.50 → 1250.50
    }
  } else if (hasKomma) {
    // Nur Komma → immer Dezimaltrenner: 12,50 → 12.50
    s = s.replace(/,/g, ".");
  } else if (hasPunkt) {
    // Nur Punkt: mehrfach ODER Dreiergruppe = Tausendertrenner ("1.250" → 1250).
    const teile = s.split(".");
    const mehrfach = teile.length > 2;
    const dreier = teile.length === 2 && /^\d{3}$/.test(teile[1]) && teile[0] !== "";
    if (mehrfach || dreier) s = s.replace(/\./g, "");
  }

  // Nur noch Vorzeichen, Ziffern und EIN Punkt zulassen.
  const m = s.match(/^-?\d*\.?\d*/);
  if (!m || m[0] === "" || m[0] === "-" || m[0] === ".") return null;

  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Wie parseDecimal, liefert aber einen Zahlenwert (Default bei ungültiger Eingabe). */
export function toNumber(input: string | number | null | undefined, fallback = 0): number {
  const n = parseDecimal(input);
  return n === null ? fallback : n;
}

/** Auf min/max begrenzen (nach dem Parsen). */
export function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

/** Zahl für die Anzeige in einem Eingabefeld (deutsches Komma, keine Tausenderpunkte). */
export function formatForInput(n: number | null | undefined, nachkomma?: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const s = nachkomma === undefined ? String(n) : n.toFixed(nachkomma);
  return s.replace(".", ",");
}
