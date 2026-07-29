/**
 * Finanzplanung — Rechenkern.
 *
 * Nachbau der Planrechnung (Steuerberater „Haider mal Zwei", Stand 5/2025).
 * Die Formeln wurden aus der Excel-Datei ausgelesen, NICHT nachempfunden;
 * die Herkunft steht jeweils als Zellbezug im Kommentar.
 *
 * Reine Funktionen ohne Datenbankzugriff — damit die Logik testbar bleibt und
 * an einer einzigen Stelle liegt (Übersicht, Liquidität und Export rechnen
 * sonst auseinander).
 */

import { round2 } from "@/lib/kalkulationEngine";

// ============================================================================
// Zeitachse
// ============================================================================

/** Planjahre × 12: laufender Monatsindex 1…36 (Excel: Dropdowns!F:G). */
export const monatsIndex = (jahr: number, monat: number, basisJahr: number): number =>
  (jahr - basisJahr) * 12 + monat;

export const ausIndex = (idx: number, basisJahr: number): { jahr: number; monat: number } => ({
  jahr: basisJahr + Math.floor((idx - 1) / 12),
  monat: ((idx - 1) % 12) + 1,
});

export const MONATSNAMEN = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// ============================================================================
// Zahlungsstaffel — wann welches Geld eingeht
// ============================================================================

export interface StaffelBand {
  /** Obergrenze des Bandes; null = nach oben offen. */
  bis: number | null;
  anzahlung: number;      // Prozent
  teilzahlungen: number;  // Anzahl
  schluss: number;        // Prozent
}

/**
 * Die drei Bänder exakt nach den rechnenden Excel-Formeln
 * (Umsatzberechnung 1 / 2 / 4).
 *
 * Zwei Abweichungen zur Beschreibung im Blatt „Erklärungen" sind bewusst:
 *  - über 60.000 rechnet das Excel mit 10 % Schlusszahlung (Formel H7),
 *    nicht mit den dort genannten 5 %;
 *  - „Umsatzberechnung 3" (60.000–300.000) ist verwaist — die Spalte U3 im
 *    Blatt „Umsatz" ist in allen Zeilen leer. Daher drei Bänder, nicht vier.
 */
export const STAFFEL_STANDARD: StaffelBand[] = [
  { bis: 10000, anzahlung: 50, teilzahlungen: 0, schluss: 0 },
  { bis: 60000, anzahlung: 30, teilzahlungen: 1, schluss: 10 },
  { bis: null, anzahlung: 15, teilzahlungen: 4, schluss: 10 },
];

export const bandFuer = (summe: number, staffel: StaffelBand[] = STAFFEL_STANDARD): StaffelBand =>
  staffel.find((b) => b.bis === null || summe <= b.bis) || staffel[staffel.length - 1];

export interface Zahlungsrate {
  /** Laufender Monatsindex 1…36 */
  idx: number;
  betrag: number;
  art: "anzahlung" | "teilzahlung" | "schluss";
}

export interface VerteilungsEingabe {
  summe: number;
  startIdx: number;
  endeIdx: number;
  /** Überschreibt den Bandwert (BV Aufstellung Spalten Q/R/P). */
  anzProzent?: number | null;
  schlussProzent?: number | null;
  teilzahlungen?: number | null;
}

/**
 * Verteilt eine Auftragssumme auf Monate.
 *
 * Regel aus den Excel-Formeln:
 *   Anzahlung      → Beginn-Monat        (UB1 P7, UB2 X7, UB4 BM7)
 *   Schlusszahlung → Ende-Monat          (UB2 …K7 bei T7=Spaltenmonat)
 *   Teilrechnungen → gleichmäßig dazwischen; bei genau einer Rate der
 *                    abgerundete Mittelmonat (UB2 W7 = ROUNDDOWN(AVERAGE(…)))
 *
 * Sonderfall aus UB1 Q7: Liegt Beginn = Ende, fällt die gesamte Summe in
 * diesen einen Monat.
 */
export function verteileAuftrag(
  e: VerteilungsEingabe,
  staffel: StaffelBand[] = STAFFEL_STANDARD,
): Zahlungsrate[] {
  const summe = Number(e.summe) || 0;
  if (summe <= 0 || !e.startIdx || !e.endeIdx) return [];

  const band = bandFuer(summe, staffel);
  const anzP = e.anzProzent ?? band.anzahlung;
  const schlP = e.schlussProzent ?? band.schluss;
  const anzahlTz = Math.max(0, e.teilzahlungen ?? band.teilzahlungen);

  const start = Math.min(e.startIdx, e.endeIdx);
  const ende = Math.max(e.startIdx, e.endeIdx);

  // Ein-Monats-Projekt: alles in diesem Monat (UB1 Q7).
  if (start === ende) return [{ idx: start, betrag: round2(summe), art: "anzahlung" }];

  const anzahlung = round2((summe * anzP) / 100);
  const schluss = round2((summe * schlP) / 100);
  const raten: Zahlungsrate[] = [];

  if (anzahlung > 0) raten.push({ idx: start, betrag: anzahlung, art: "anzahlung" });

  const rest = round2(summe - anzahlung - schluss);
  if (anzahlTz > 0 && rest > 0) {
    // Gleichmäßige Rate; die letzte Rate nimmt den Rundungsrest auf, damit die
    // Summe exakt aufgeht (Excel löst das über die Restbetrags-Kaskade UB4 M/N/O/P).
    const rate = round2(rest / anzahlTz);
    for (let i = 0; i < anzahlTz; i++) {
      const betrag = i === anzahlTz - 1 ? round2(rest - rate * (anzahlTz - 1)) : rate;
      // Monate zwischen Start und Ende gleichmäßig belegen; bei einer Rate
      // ergibt das den abgerundeten Mittelmonat wie in UB2.
      const idx = Math.floor(start + ((ende - start) * (i + 1)) / (anzahlTz + 1));
      raten.push({ idx, betrag, art: "teilzahlung" });
    }
  } else if (rest > 0) {
    // Kein Teilzahlungsband (bis 10.000): Rest fällt auf die Schlusszahlung.
    raten.push({ idx: ende, betrag: rest, art: "schluss" });
  }

  if (schluss > 0) raten.push({ idx: ende, betrag: schluss, art: "schluss" });
  return raten;
}

// ============================================================================
// Monatsreihen
// ============================================================================

/** Eine Kennzahl über die Planperiode: Index 1…n → Betrag. */
export type Reihe = Record<number, number>;

export const leereReihe = (): Reihe => ({});

export const addiere = (r: Reihe, idx: number, betrag: number): void => {
  if (!betrag) return;
  r[idx] = round2((r[idx] || 0) + betrag);
};

export const summeReihe = (r: Reihe, vonIdx = 1, bisIdx = 999): number =>
  round2(Object.entries(r).reduce((s, [k, v]) => {
    const i = Number(k);
    return i >= vonIdx && i <= bisIdx ? s + v : s;
  }, 0));

/** Jahressumme einer Reihe (Index-Fenster des Jahres). */
export const jahresSumme = (r: Reihe, jahr: number, basisJahr: number): number => {
  const von = monatsIndex(jahr, 1, basisJahr);
  return summeReihe(r, von, von + 11);
};

// ============================================================================
// Abschreibung (Blatt AFA)
// ============================================================================

export interface Anschaffung {
  bezeichnung: string;
  jahr: number;
  monat: number;
  betrag: number;
  nutzungsdauer: number | null;
  ist_gwg: boolean;
}

/**
 * Jahres-AfA nach Halbjahresregel (Excel-Blatt AFA: Spalten „1. HJ" / „2. HJ").
 * Anschaffung im 1. Halbjahr → volle Jahres-AfA, im 2. Halbjahr → halbe.
 * Geringwertige Wirtschaftsgüter werden sofort voll abgeschrieben.
 */
export function afaFuerJahr(anschaffungen: Anschaffung[], jahr: number): {
  abschreibung: number; gwg: number;
} {
  let abschreibung = 0;
  let gwg = 0;
  for (const a of anschaffungen) {
    const betrag = Number(a.betrag) || 0;
    if (!betrag) continue;
    if (a.ist_gwg || !a.nutzungsdauer || a.nutzungsdauer <= 0) {
      if (a.jahr === jahr) gwg += betrag;
      continue;
    }
    const ersteHalbjahr = a.monat <= 6;
    const jahresAfa = betrag / a.nutzungsdauer;
    // Abschreibungsdauer: bei 2. Halbjahr verlängert sich der Zeitraum um ein Jahr
    // (halbe AfA im ersten und im letzten Jahr).
    const letztesJahr = a.jahr + a.nutzungsdauer - (ersteHalbjahr ? 1 : 0);
    if (jahr < a.jahr || jahr > letztesJahr) continue;
    if (!ersteHalbjahr && (jahr === a.jahr || jahr === letztesJahr)) abschreibung += jahresAfa / 2;
    else abschreibung += jahresAfa;
  }
  return { abschreibung: round2(abschreibung), gwg: round2(gwg) };
}

// ============================================================================
// Plan-GuV (Blatt „Plan GuV")
// ============================================================================

export interface GuVEingabe {
  umsatz: number;
  sonstigeErtraege: number;
  wareneinkauf: number;
  personalkosten: number;
  abschreibung: number;
  gwg: number;
  /** OHNE Kreditzinsen — die stehen separat (Excel: SBAW!AD132 = SUMME − AD100). */
  sbaw: number;
  zinsertrag: number;
  zinsaufwand: number;
  koestSatz?: number;
  koestMindest?: number;
}

export interface GuVZeile {
  label: string;
  betrag: number;
  /** Anteil an der Betriebsleistung in Prozent (Excel-Spalten C/E). */
  prozent: number | null;
  /** Zwischen-/Ergebniszeile → in der Maske hervorgehoben. */
  hervor?: boolean;
}

/**
 * Körperschaftsteuer mit Mindest-KÖSt.
 * Excel Plan GuV Z38: =WENN(EGT<=2173,92; 500; EGT*0,23)
 * (2.173,92 ist genau der Punkt, ab dem 23 % die Mindeststeuer übersteigen.)
 */
export function berechneKoest(egt: number, satz = 23, mindest = 500): number {
  const schwelle = mindest / (satz / 100);
  return egt <= schwelle ? mindest : round2((egt * satz) / 100);
}

export function berechneGuV(e: GuVEingabe): { zeilen: GuVZeile[]; egt: number; gewinn: number } {
  const betriebsleistung = round2(e.umsatz + e.sonstigeErtraege);
  const pct = (x: number): number | null =>
    betriebsleistung ? round2((x * 100) / betriebsleistung) : null;

  const abschreibungGesamt = round2(e.abschreibung + e.gwg);
  const egt = round2(
    betriebsleistung - e.wareneinkauf - e.personalkosten - abschreibungGesamt
    - e.sbaw + e.zinsertrag - e.zinsaufwand,
  );
  const koest = berechneKoest(egt, e.koestSatz ?? 23, e.koestMindest ?? 500);
  const gewinn = round2(egt - koest);

  const zeilen: GuVZeile[] = [
    { label: "Umsatzerlöse", betrag: e.umsatz, prozent: null },
    { label: "Sonstige Erträge", betrag: e.sonstigeErtraege, prozent: null },
    { label: "Betriebsleistung", betrag: betriebsleistung, prozent: betriebsleistung ? 100 : null, hervor: true },
    { label: "Wareneinsatz", betrag: e.wareneinkauf, prozent: pct(e.wareneinkauf) },
    { label: "Personalkosten", betrag: e.personalkosten, prozent: pct(e.personalkosten) },
    { label: "Abschreibungen", betrag: e.abschreibung, prozent: null },
    { label: "Geringwertige Wirtschaftsgüter", betrag: e.gwg, prozent: null },
    { label: "Abschreibung gesamt", betrag: abschreibungGesamt, prozent: pct(abschreibungGesamt) },
    { label: "Sonstige betriebliche Aufwendungen", betrag: e.sbaw, prozent: pct(e.sbaw) },
    { label: "Zinserträge", betrag: e.zinsertrag, prozent: null },
    { label: "Zinsen und ähnliche Aufwendungen", betrag: e.zinsaufwand, prozent: pct(e.zinsaufwand) },
    { label: "EGT", betrag: egt, prozent: pct(egt), hervor: true },
    { label: "abzgl. KÖSt", betrag: koest, prozent: null },
    { label: "Gewinn nach Steuern", betrag: gewinn, prozent: pct(gewinn), hervor: true },
  ];
  return { zeilen, egt, gewinn };
}

// ============================================================================
// Liquiditätsplan (Blatt „Liquiditätsplan")
// ============================================================================

export interface LiquiditaetsEingabe {
  /** Je Position eine Monatsreihe. */
  kundenzahlungen: Reihe;
  zinsertraege: Reihe;
  uebrigeErloese: Reihe;
  kreditlinienNeu: Reihe;
  sbaw: Reihe;
  wareneinkauf: Reihe;
  personal: Reihe;
  investitionen: Reihe;
  kreditraten: Reihe;
  /** Bargeld + Konto + freie Kreditlinien zum Start (Excel Z27–Z30). */
  anfangsbestand: number;
  anzahlMonate: number;
}

export interface LiquiditaetsMonat {
  idx: number;
  jahr: number;
  monat: number;
  zufluss: number;
  abfluss: number;
  saldo: number;
  endbestand: number;
  positionen: Record<string, number>;
}

export function berechneLiquiditaet(
  e: LiquiditaetsEingabe,
  basisJahr: number,
): LiquiditaetsMonat[] {
  const out: LiquiditaetsMonat[] = [];
  let bestand = e.anfangsbestand;
  for (let idx = 1; idx <= e.anzahlMonate; idx++) {
    const p = {
      kundenzahlungen: e.kundenzahlungen[idx] || 0,
      zinsertraege: e.zinsertraege[idx] || 0,
      uebrigeErloese: e.uebrigeErloese[idx] || 0,
      kreditlinienNeu: e.kreditlinienNeu[idx] || 0,
      sbaw: e.sbaw[idx] || 0,
      wareneinkauf: e.wareneinkauf[idx] || 0,
      personal: e.personal[idx] || 0,
      investitionen: e.investitionen[idx] || 0,
      kreditraten: e.kreditraten[idx] || 0,
    };
    const zufluss = round2(p.kundenzahlungen + p.zinsertraege + p.uebrigeErloese + p.kreditlinienNeu);
    const abfluss = round2(p.sbaw + p.wareneinkauf + p.personal + p.investitionen + p.kreditraten);
    const saldo = round2(zufluss - abfluss);
    bestand = round2(bestand + saldo);
    const { jahr, monat } = ausIndex(idx, basisJahr);
    out.push({ idx, jahr, monat, zufluss, abfluss, saldo, endbestand: bestand, positionen: p });
  }
  return out;
}

// ============================================================================
// Kreditraten
// ============================================================================

export interface Kredit {
  rate_monatlich: number;
  start_jahr: number | null;
  start_monat: number | null;
  laufzeit_monate: number | null;
  aktiv: boolean;
}

/** Verteilt die Monatsraten aller Kredite auf die Planperiode. */
export function kreditReihe(kredite: Kredit[], basisJahr: number, anzahlMonate: number): Reihe {
  const r = leereReihe();
  for (const k of kredite) {
    if (!k.aktiv || !k.rate_monatlich) continue;
    const start = k.start_jahr && k.start_monat
      ? monatsIndex(k.start_jahr, k.start_monat, basisJahr)
      : 1;
    const ende = k.laufzeit_monate ? start + k.laufzeit_monate - 1 : anzahlMonate;
    for (let i = Math.max(1, start); i <= Math.min(anzahlMonate, ende); i++) {
      addiere(r, i, Number(k.rate_monatlich));
    }
  }
  return r;
}
