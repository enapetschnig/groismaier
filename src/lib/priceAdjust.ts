/**
 * Preisanpassung für Beleg-Positionen (Angebot / Rechnung).
 *
 * Zwei Anwendungsfälle:
 *  1. Rabatt / Aufschlag auf ausgewählte Positionen — ±% (wirkt je Position)
 *     oder ±€ (wird proportional zum Positionswert verteilt).
 *  2. KI-Anpassung — die Edge Function liefert neue Einzelpreise, hier wird
 *     nur noch gerundet und die Zielsumme centgenau nachgezogen.
 *
 * Zentrale Invarianten:
 *  - Einzelpreise haben IMMER max. 2 Nachkommastellen.
 *  - Der Gesamtpreis einer Position wird exakt wie in InvoiceDetail berechnet:
 *    round2(menge × einzelpreis × (1 − rabatt/100)).
 *  - Bei €-Verteilung trifft die Summe der ausgewählten Positionen die
 *    Zielsumme centgenau (Largest-Remainder + Restdifferenz auf die größte
 *    Position, die den Rest überhaupt aufnehmen kann).
 *  - Keine negativen Einzelpreise. Wird eine Position auf 0 geklemmt, wird ihr
 *    nicht verteilbarer Anteil auf die übrigen Positionen umgelegt.
 */

export interface AdjustLine {
  /** Index in der Positionsliste des Belegs. */
  index: number;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  rabatt_prozent?: number;
  gesamtpreis: number;
}

export interface AdjustedLine {
  index: number;
  /** Einzelpreis vorher. */
  einzelpreisAlt: number;
  /** Einzelpreis nachher (2 Nachkommastellen). */
  einzelpreisNeu: number;
  /** Gesamtpreis vorher. */
  gesamtAlt: number;
  /** Gesamtpreis nachher (= round2(menge × einzelpreisNeu × (1 − rabatt/100))). */
  gesamtNeu: number;
}

export interface AdjustResult {
  lines: AdjustedLine[];
  /** Summe der ausgewählten Positionen vorher. */
  summeAlt: number;
  /** Summe der ausgewählten Positionen nachher. */
  summeNeu: number;
  /**
   * Nicht darstellbare Restdifferenz zur Zielsumme in €. Normalerweise 0.
   * Bleibt nur dann ≠ 0, wenn KEINE Position den Rest bei 2 Nachkommastellen
   * im Einzelpreis exakt aufnehmen kann (z.B. alle Mengen gebrochen).
   */
  restdifferenz: number;
  /** true, wenn mindestens eine Position auf Einzelpreis 0 geklemmt wurde. */
  geklemmt: boolean;
}

export const r2 = (n: number): number =>
  isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;

/** Rabattfaktor einer Position (1 = kein Rabatt). */
const factor = (line: Pick<AdjustLine, "rabatt_prozent">): number =>
  1 - (Number(line.rabatt_prozent) || 0) / 100;

/** Gesamtpreis exakt nach der Formel aus InvoiceDetail. */
export const lineTotal = (line: Pick<AdjustLine, "menge" | "einzelpreis" | "rabatt_prozent">): number => {
  const m = Number(line.menge) || 0;
  const p = Number(line.einzelpreis) || 0;
  const t = m * p * factor(line);
  return isFinite(t) ? r2(t) : 0;
};

/**
 * Verteilt `deltaCents` (ganze Cent, kann negativ sein) proportional zu
 * `weights` — Largest-Remainder-Verfahren. Die Summe des Ergebnisses ist
 * IMMER exakt `deltaCents`.
 *
 * Negative oder fehlende Gewichte werden als 0 behandelt. Ist die Summe der
 * Gewichte 0, wird gleichmäßig verteilt.
 */
export function distributeCents(weights: number[], deltaCents: number): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const w = weights.map(x => (isFinite(x) && x > 0 ? x : 0));
  const total = w.reduce((s, x) => s + x, 0);
  // Ohne verwertbare Gewichte: gleichmäßig verteilen.
  const eff = total > 0 ? w : new Array(n).fill(1);
  const effTotal = total > 0 ? total : n;

  const exact = eff.map(x => (deltaCents * x) / effTotal);
  const floors = exact.map(x => Math.floor(x));
  const assigned = floors.reduce((s, x) => s + x, 0);

  // Rest ist per Konstruktion 0 ≤ rest < n (auch bei negativem deltaCents).
  let rest = deltaCents - assigned;

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    // Größter Rest zuerst; bei Gleichstand die größere Position bevorzugen.
    .sort((a, b) => b.frac - a.frac || eff[b.i] - eff[a.i]);

  const out = [...floors];
  for (let k = 0; k < order.length && rest > 0; k++) {
    out[order[k].i] += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Rechnet Ziel-Gesamtpreise in Einzelpreise mit 2 Nachkommastellen um und
 * zieht die durch das Runden entstandene Restdifferenz auf der größten
 * Position nach, sodass die Zielsumme exakt erreicht wird.
 */
function solveEinzelpreise(lines: AdjustLine[], targets: number[]): AdjustResult {
  const zielSumme = r2(targets.reduce((s, t) => s + t, 0));
  let geklemmt = false;

  const work = lines.map((line, i) => {
    const m = Number(line.menge) || 0;
    const f = factor(line);
    const divisor = m * f;
    let ziel = targets[i];
    if (ziel < 0) { ziel = 0; geklemmt = true; }
    // Menge oder Rabattfaktor 0 → Gesamtpreis ist zwangsläufig 0.
    const ep = divisor === 0 ? r2(line.einzelpreis) : Math.max(0, r2(ziel / divisor));
    const gesamt = lineTotal({ menge: m, einzelpreis: ep, rabatt_prozent: line.rabatt_prozent });
    if (ep === 0 && ziel > 0) geklemmt = true;
    return { i, divisor, ep, gesamt };
  });

  let rest = r2(zielSumme - work.reduce((s, x) => s + x.gesamt, 0));

  // Restdifferenz auf die größte Position legen, die sie bei 2 Nachkomma-
  // stellen im Einzelpreis exakt aufnehmen kann.
  if (rest !== 0) {
    const kandidaten = [...work].sort((a, b) => Math.abs(b.gesamt) - Math.abs(a.gesamt));
    for (const k of kandidaten) {
      if (k.divisor === 0) continue;
      const ziel = r2(k.gesamt + rest);
      if (ziel < 0) continue;
      const ep = r2(ziel / k.divisor);
      if (ep < 0) continue;
      const check = lineTotal({ menge: lines[k.i].menge, einzelpreis: ep, rabatt_prozent: lines[k.i].rabatt_prozent });
      if (check === ziel) {
        k.ep = ep;
        k.gesamt = check;
        rest = 0;
        break;
      }
    }
  }

  const out: AdjustedLine[] = work.map(k => ({
    index: lines[k.i].index,
    einzelpreisAlt: r2(lines[k.i].einzelpreis),
    einzelpreisNeu: k.ep,
    gesamtAlt: r2(lines[k.i].gesamtpreis),
    gesamtNeu: k.gesamt,
  }));

  return {
    lines: out,
    summeAlt: r2(lines.reduce((s, l) => s + (Number(l.gesamtpreis) || 0), 0)),
    summeNeu: r2(out.reduce((s, l) => s + l.gesamtNeu, 0)),
    restdifferenz: rest,
    geklemmt,
  };
}

/**
 * Modus 1a — Prozent: wirkt je Position auf den Einzelpreis.
 * `prozent` negativ = Nachlass/Skonto, positiv = Aufschlag.
 */
export function adjustByPercent(lines: AdjustLine[], prozent: number): AdjustResult {
  const p = isFinite(prozent) ? prozent : 0;
  const targets = lines.map(l => {
    const epNeu = Math.max(0, r2((Number(l.einzelpreis) || 0) * (1 + p / 100)));
    return lineTotal({ menge: l.menge, einzelpreis: epNeu, rabatt_prozent: l.rabatt_prozent });
  });
  // Bei % gibt es keine externe Zielsumme — die Ziele SIND das Ergebnis.
  const res = solveEinzelpreise(lines, targets);
  return { ...res, restdifferenz: 0 };
}

/**
 * Modus 1b — Betrag: `deltaEuro` wird proportional zum Positionswert auf die
 * Auswahl verteilt (negativ = Nachlass, positiv = Aufschlag). Die neue Summe
 * der Auswahl ist centgenau `summeAlt + deltaEuro`.
 */
export function adjustByAmount(lines: AdjustLine[], deltaEuro: number): AdjustResult {
  const summeAlt = r2(lines.reduce((s, l) => s + (Number(l.gesamtpreis) || 0), 0));
  return adjustToTarget(lines, r2(summeAlt + (isFinite(deltaEuro) ? deltaEuro : 0)));
}

/**
 * Verteilt so, dass die Auswahl exakt `zielSumme` netto ergibt.
 * Klemmt Positionen bei 0 und legt deren Anteil auf die übrigen um.
 */
export function adjustToTarget(lines: AdjustLine[], zielSumme: number): AdjustResult {
  if (lines.length === 0) {
    return { lines: [], summeAlt: 0, summeNeu: 0, restdifferenz: 0, geklemmt: false };
  }

  const werte = lines.map(l => Number(l.gesamtpreis) || 0);
  const summeAltCents = werte.reduce((s, v) => s + Math.round(v * 100), 0);
  const zielCents = Math.round(zielSumme * 100);

  // Iterativ: Positionen, die ins Negative laufen würden, auf 0 festnageln
  // und den Rest auf die verbleibenden Positionen neu verteilen.
  const fixedZero: boolean[] = new Array(lines.length).fill(false);
  let targetsCents: number[] = new Array(lines.length).fill(0);

  for (let runde = 0; runde < lines.length + 1; runde++) {
    const freieIdx = lines.map((_, i) => i).filter(i => !fixedZero[i]);
    if (freieIdx.length === 0) {
      targetsCents = targetsCents.map((_, i) => (fixedZero[i] ? 0 : 0));
      break;
    }
    const freieAltCents = freieIdx.reduce((s, i) => s + Math.round(werte[i] * 100), 0);
    const deltaCents = zielCents - freieAltCents;
    const anteile = distributeCents(freieIdx.map(i => werte[i]), deltaCents);

    let neueNullen = false;
    targetsCents = new Array(lines.length).fill(0);
    freieIdx.forEach((i, k) => {
      const t = Math.round(werte[i] * 100) + anteile[k];
      if (t < 0) {
        fixedZero[i] = true;
        neueNullen = true;
      }
      targetsCents[i] = Math.max(0, t);
    });
    if (!neueNullen) break;
  }

  const targets = targetsCents.map(c => r2(c / 100));
  const res = solveEinzelpreise(lines, targets);
  // Klemmung passiert bereits in der Schleife oben — Flag mit durchreichen,
  // damit der Dialog den Hinweis "auf 0 begrenzt" anzeigen kann.
  return { ...res, geklemmt: res.geklemmt || fixedZero.some(Boolean) };
}

/**
 * KI-Ergebnis anwenden: die Function liefert neue Einzelpreise, hier wird
 * gerundet, auf ≥ 0 geklemmt und — falls eine Zielsumme bekannt ist — die
 * Restdifferenz centgenau nachgezogen.
 */
export function applyAiPrices(
  lines: AdjustLine[],
  neuePreise: Record<number, number>,
  zielSumme?: number
): AdjustResult {
  const targets = lines.map(l => {
    const roh = neuePreise[l.index];
    const ep = Math.max(0, r2(isFinite(roh) ? roh : Number(l.einzelpreis) || 0));
    return lineTotal({ menge: l.menge, einzelpreis: ep, rabatt_prozent: l.rabatt_prozent });
  });

  if (zielSumme === undefined || !isFinite(zielSumme)) {
    const res = solveEinzelpreise(lines, targets);
    return { ...res, restdifferenz: 0 };
  }

  // Auf die Zielsumme nachjustieren: die Differenz proportional zu den
  // KI-Vorschlagswerten verteilen, damit die KI-Gewichtung erhalten bleibt.
  //
  // WICHTIG: Nur auf Positionen, die die KI tatsächlich verändert hat. Sonst
  // würde die Restdifferenz Positionen anfassen, die die KI auf Wunsch des
  // Nutzers bewusst unangetastet ließ („Montage nicht verändern").
  const summeKi = targets.reduce((s, t) => s + Math.round(t * 100), 0);
  const deltaCents = Math.round(zielSumme * 100) - summeKi;
  if (deltaCents !== 0) {
    const veraendert = lines.map((l, i) => {
      const alt = lineTotal({ menge: l.menge, einzelpreis: l.einzelpreis, rabatt_prozent: l.rabatt_prozent });
      return Math.round(alt * 100) !== Math.round(targets[i] * 100);
    });
    // Fallback: hat die KI nichts verändert, darf jede Position tragen.
    const tragend = veraendert.some(Boolean) ? veraendert : lines.map(() => true);
    const gewichte = targets.map((t, i) => (tragend[i] ? t : 0));
    const anteile = distributeCents(gewichte, deltaCents);
    anteile.forEach((c, i) => {
      if (!tragend[i]) return;
      targets[i] = r2(Math.max(0, Math.round(targets[i] * 100) + c) / 100);
    });
  }
  return solveEinzelpreise(lines, targets);
}
