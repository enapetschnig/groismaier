// ============================================================================
// Holzbau Groismaier — Auftragskalkulation: Rechen-Engine (pure functions)
// ----------------------------------------------------------------------------
// Nativer Ersatz für das eingebettete HTML-Tool v9
// (public/auftragskalkulation-tool.html). Fachliche Referenz ist das Excel
// "Stammblatt - Auftragskalkulation_4.3_rel Letztstand.xlsm" — bei
// Widersprüchen HTML vs. Excel gewinnt die Excel:
//
//   - Mittellohn Default 65 €/h (HTML hatte 47), Kran 180 €/h (HTML 150)
//   - Globaler Faktor ADDITIV: 1 + Aufschlag% − Skonto%   (Excel S6;
//     das HTML rechnete multiplikativ (1+a)×(1−s))
//   - 9-h-Tag, VK-Faktor 1,35, Fahrtkosten-Staffel min(km, 55)
//   - Riegelkonstruktion: EK-Basis (€/m³) wie Excel-Module 2–20; der
//     VK-Sonderfall in Excel-Modul 1 ist ein Excel-Bug (Risiko R1) und wird
//     NICHT übernommen. EK = VK (kein 1,35-Aufschlag, Risiko R2 — gewollt).
//
// Gefixte HTML-Bugs (Excel-Semantik):
//   1. Doppel-Flächen-Bug: "berechnet"-Zeilen (Holzvolumen) sind ABSOLUTE
//      €-Beträge und werden NICHT nochmals mit der Fläche multipliziert.
//   2. Dämmstoff-Fallback: fehlt der VK, wird der EK nur EINMAL mit der
//      Dämmstärke multipliziert (HTML multiplizierte die Dicke doppelt).
//   3. projectName wird beim Laden alter Blobs wiederhergestellt.
//
// Alles NETTO — es gibt (wie in beiden Referenzen) keine MwSt-Berechnung.
// ============================================================================

// ----------------------------------------------------------------------------
// State-Typen — bewusst nah am HTML-Shape, damit alte kalkulationen.data-Blobs
// (localStorage-Shape des iframe-Tools) per normalizeKalkulationState() ohne
// Datenverlust ladbar bleiben.
// ----------------------------------------------------------------------------

export interface MaterialRow {
  category: string;   // DB-Modus: Katalog-Kategoriename; manuell: Freitext
  product: string;    // DB-Modus: Artikelname; manuell: Freitext
  ekPrice: number;    // DB: €/m² (bzw. €/m³ bei Riegel/berechnet); manuell: absoluter €-Betrag
  vkPrice: number;    // analog
  actualVK: number | null; // Nachkalkulation Ist-VK (€/m²)
  manual: boolean;    // Zeilenmodus "manuell" (absolute €-Beträge)
  calc: boolean;      // Zeilenmodus "Holz berechnen" (nur Decke/Dach)
  lmPerQm: number;    // calc-Modus: Laufmeter pro m²
  dimension: number;  // calc-Modus: Breite b in cm
  dimension2: number; // calc-Modus: Höhe h in cm
}

export interface KalkModule {
  id: number;
  name: string;
  aufbauKategorie: "" | "Wand" | "Decke" | "Dach" | "AW";
  note: string;
  area: number;               // Fläche in m²
  wallHeight: number;         // Wandhöhe in m — im HTML tot, hier für die
                              // Excel-Riegelgeometrie wiederbelebt
  insulationThickness: number; // Dämmstärke in cm
  isOptional: boolean;
  collapsed: boolean;
  materialRows: MaterialRow[];
  workers: number;
  days: number;
  distanceKM: number;
  busTrips: number;
  lkwTrips: number;
  craneHours: number;
  shippingCosts: number;      // Speditionskosten €
  paintCosts: number;         // "Lohnabdunst Kosten" € (Label wörtlich aus Excel/HTML)
  miscCosts: number;          // Sonstige Kosten €
  nachkalk: { actualDays: number | null };
}

export interface PaintModule {
  id: number;
  name: string;
  category: string;           // Lack-Kategoriename (Hersteller)
  product: string;            // Lack-Artikelname
  area: number;               // Menge
  amountMode: "qm" | "lfm";   // reines Anzeige-Label (keine Rechenwirkung, wie Original)
  sides: "3-seitig" | "4-seitig" | "Kunde";
  isOptional: boolean;
  collapsed: boolean;
  surcharges: Record<string, boolean>; // Aufpreisname -> angehakt
}

/** Legacy-Katalogzeilen aus alten Blobs ([Name, EK, VK, Einheit] bzw. [Name, p3, p4, pKunde]). */
export type LegacyProductRow = [string, number | null, number | null, string?];
export type LegacyPaintRow = [string, number | null, number | null, number?];

export interface KalkulationState {
  settings: {
    businessData: Record<string, number>;
    /** Nur aus Alt-Blobs (HTML-Tool); dient als Preis-Fallback, UI nutzt den DB-Katalog. */
    products?: Record<string, LegacyProductRow[]>;
    paintPrices?: Record<string, LegacyPaintRow[]>;
    paintSurcharges?: Record<string, number>;
  };
  modules: KalkModule[];
  paintModules: PaintModule[];
  projectName: string;
  surchargePercent: number | null; // Aufschlag % (2/3/4/5)
  discontPercent: number | null;   // Skonto % (2/3) — [sic] Feldname aus dem Original beibehalten
  paintColorChanges: number;
  paintDimChanges: number;
  paintDistance: number;
  paintTravelHours: number;
}

// ----------------------------------------------------------------------------
// Betriebsdaten
// ----------------------------------------------------------------------------

export interface Betriebsdaten {
  mittellohn: number;        // €/h
  stundenProTag: number;     // h
  vkFaktor: number;          // VK = EK × Faktor
  mautFreiKm: number;        // km ohne Maut
  busKm: number;             // € / km
  busKmMaut: number;
  lkwKm: number;
  lkwKmMaut: number;
  kranSatz: number;          // € / h
  riegelAbstand: number;     // Lattungsabstand Riegelkonstruktion in cm
  riegelBrettDicke: number;  // Dicke der Riegelbretter in cm
  /**
   * Deckungsbeitrags-Rechnung: echte Lohn-SELBSTKOSTEN je Stunde inkl.
   * Lohnnebenkosten. NICHT der verrechnete Mittellohn (der ist Erlös-Seite) —
   * die Differenz Mittellohn − Selbstkosten ist genau der Lohn-Verdienst.
   */
  selbstkostenLohn: number;  // €/h
  /** Warnschwelle: liegt die Marge darunter, warnt der Editor. */
  warnMargeProzent: number;  // %
}

/** Excel-Letztstand (gewinnt vor den HTML-Defaults 47/150). */
export const DEFAULT_BETRIEBSDATEN: Betriebsdaten = {
  mittellohn: 65,
  stundenProTag: 9,
  vkFaktor: 1.35,
  mautFreiKm: 55,
  busKm: 0.8,
  busKmMaut: 1.25,
  lkwKm: 1.2,
  lkwKmMaut: 1.85,
  kranSatz: 180,
  riegelAbstand: 62.5,
  riegelBrettDicke: 6,
  selbstkostenLohn: 38,
  warnMargeProzent: 35,
};

export interface LackSaetze {
  vierseitigFaktor: number; // 4-seitig = 3-seitig × Faktor (1,65)
  kundeSatz: number;        // "Farbe durch Kunde beigestellt" €/m² (4,95)
  farbwechsel: number;      // € pro Farbwechsel (25)
  dimension: number;        // € pro Dimension/Farbton >50mm (25)
  anfahrtKm: number;        // € / km (0,85)
  fahrzeitH: number;        // € / h (45)
}

export const DEFAULT_LACK_SAETZE: LackSaetze = {
  vierseitigFaktor: 1.65,
  kundeSatz: 4.95,
  farbwechsel: 25,
  dimension: 25,
  anfahrtKm: 0.85,
  fahrzeitH: 45,
};

/** app_settings-Key (Präfix kalk_) → Betriebsdaten-Feld. */
const SETTINGS_KEY_MAP: Record<string, keyof Betriebsdaten> = {
  kalk_mittellohn: "mittellohn",
  kalk_stunden_pro_tag: "stundenProTag",
  kalk_vk_faktor: "vkFaktor",
  kalk_maut_frei_km: "mautFreiKm",
  kalk_fahrt_bus: "busKm",
  kalk_fahrt_bus_maut: "busKmMaut",
  kalk_fahrt_lkw: "lkwKm",
  kalk_fahrt_lkw_maut: "lkwKmMaut",
  kalk_kran_stundensatz: "kranSatz",
  kalk_riegel_abstand: "riegelAbstand",
  kalk_riegel_brett_dicke: "riegelBrettDicke",
  kalk_selbstkosten_lohn: "selbstkostenLohn",
  kalk_warn_marge_prozent: "warnMargeProzent",
};

const LACK_KEY_MAP: Record<string, keyof LackSaetze> = {
  kalk_lack_vierseitig_faktor: "vierseitigFaktor",
  kalk_lack_kunde_satz: "kundeSatz",
  kalk_lack_farbwechsel: "farbwechsel",
  kalk_lack_dimension: "dimension",
  kalk_lack_anfahrt_km: "anfahrtKm",
  kalk_lack_fahrzeit_h: "fahrzeitH",
};

/** Betriebsdaten-Feld → deutscher businessData-Key (HTML-Shape, für Alt-Blobs). */
const BUSINESS_DATA_KEYS: Record<keyof Betriebsdaten, string> = {
  mittellohn: "Mittellohn",
  stundenProTag: "tägliche Arbeitszeit",
  vkFaktor: "Faktor für VK-Zuschlag (Produkte)",
  mautFreiKm: "keine Maut bis km",
  busKm: "Bus-Kosten pro km",
  busKmMaut: "Bus-Kosten pro km (Maut)",
  lkwKm: "LKW-Kosten pro km",
  lkwKmMaut: "LKW-Kosten pro km (Maut)",
  kranSatz: "Krankosten pro Stunde",
  riegelAbstand: "Lattungsabstand Riegelkonstruktion",
  riegelBrettDicke: "Dicke der Riegelbretter",
  selbstkostenLohn: "Selbstkosten Lohn",
  warnMargeProzent: "Warnschwelle Marge",
};

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 1e4) / 1e4;

/**
 * Löst die effektiven Betriebsdaten auf. Priorität:
 *   1. state.settings.businessData (Kalkulations-Snapshot, z.B. editierter Mittellohn)
 *   2. app_settings-Werte (kalk_*-Keys, globale Stammdaten)
 *   3. Excel-Defaults
 */
export function resolveBetriebsdaten(
  businessData: Record<string, number> | undefined,
  appSettings: Record<string, string> | undefined,
): Betriebsdaten {
  const bd: Betriebsdaten = { ...DEFAULT_BETRIEBSDATEN };
  if (appSettings) {
    for (const [key, field] of Object.entries(SETTINGS_KEY_MAP)) {
      if (appSettings[key] !== undefined && appSettings[key] !== "") {
        const v = num(appSettings[key]);
        if (v > 0) bd[field] = v;
      }
    }
  }
  if (businessData) {
    for (const [field, deKey] of Object.entries(BUSINESS_DATA_KEYS) as [keyof Betriebsdaten, string][]) {
      const raw = businessData[deKey];
      if (raw !== undefined && raw !== null && num(raw) > 0) bd[field] = num(raw);
    }
    // Alt-Blob-Eigenheit: beide Schreibweisen "tägliche/Tägliche Arbeitszeit"
    const gross = businessData["Tägliche Arbeitszeit"];
    if ((businessData["tägliche Arbeitszeit"] === undefined || businessData["tägliche Arbeitszeit"] === null) &&
        gross !== undefined && num(gross) > 0) {
      bd.stundenProTag = num(gross);
    }
  }
  return bd;
}

export function resolveLackSaetze(appSettings: Record<string, string> | undefined): LackSaetze {
  const s: LackSaetze = { ...DEFAULT_LACK_SAETZE };
  if (appSettings) {
    for (const [key, field] of Object.entries(LACK_KEY_MAP)) {
      if (appSettings[key] !== undefined && appSettings[key] !== "") {
        s[field] = num(appSettings[key]);
      }
    }
  }
  return s;
}

// ----------------------------------------------------------------------------
// Grundformeln
// ----------------------------------------------------------------------------

/**
 * Fahrtkosten-Staffel (Excel calcTransportCosts / HTML j):
 *   ((min(km,mautfrei) × satz) + ((km − min(km,mautfrei)) × satzMaut)) × 2 × anzahl
 * ×2 = Hin- und Rückfahrt.
 */
export function calcFahrtkosten(
  km: number, anzahl: number, satz: number, satzMaut: number, mautFreiKm: number,
): number {
  const k = num(km); const n = num(anzahl);
  if (k <= 0 || n <= 0) return 0;
  const frei = Math.min(k, num(mautFreiKm));
  const maut = k - frei;
  return (frei * satz + maut * satzMaut) * 2 * n;
}

export interface TransportErgebnis { bus: number; lkw: number; total: number }

export function calcTransport(m: Pick<KalkModule, "distanceKM" | "busTrips" | "lkwTrips">, bd: Betriebsdaten): TransportErgebnis {
  const bus = calcFahrtkosten(m.distanceKM, m.busTrips, bd.busKm, bd.busKmMaut, bd.mautFreiKm);
  const lkw = calcFahrtkosten(m.distanceKM, m.lkwTrips, bd.lkwKm, bd.lkwKmMaut, bd.mautFreiKm);
  return { bus, lkw, total: bus + lkw };
}

/** Lohnkosten: Tage × Stunden/Tag (9) × Mittellohn (65) × Arbeiter. */
export function calcLohnkosten(workers: number, days: number, bd: Betriebsdaten): number {
  const w = num(workers); const d = num(days);
  if (w <= 0 || d <= 0) return 0;
  return d * bd.stundenProTag * bd.mittellohn * w;
}

/**
 * Lohn-SELBSTKOSTEN: Tage × Stunden/Tag (9) × Selbstkostensatz (38) × Arbeiter.
 * Gegenstück zu calcLohnkosten(), das mit dem verrechneten Mittellohn (65)
 * rechnet — die Differenz ist der Verdienst auf der Arbeitsleistung.
 */
export function calcLohnSelbstkosten(workers: number, days: number, bd: Betriebsdaten): number {
  const w = num(workers); const d = num(days);
  if (w <= 0 || d <= 0) return 0;
  return d * bd.stundenProTag * bd.selbstkostenLohn * w;
}

/** Arbeitsstunden: Arbeiter × Tage × Stunden/Tag. */
export function calcArbeitsstunden(workers: number, days: number, bd: Betriebsdaten): number {
  return num(workers) * num(days) * bd.stundenProTag;
}

/**
 * Riegelkonstruktion → €/m² Wandfläche (Excel getBaseWallConstructionPrice,
 * EK-Basis wie Module 2–20; EK = VK, kein 1,35-Aufschlag):
 *
 *   länge         = qm / wandhöhe
 *   ständerAnzahl = AUFRUNDEN(länge / (abstand/100)) + 1      (Ständer alle 62,5 cm)
 *   ständerLänge  = wandhöhe − 2 × brettDicke                 (Bretter 6 cm)
 *   gesamtLänge   = ständerAnzahl × ständerLänge + 2 × länge  (oben + unten)
 *   volumen       = gesamtLänge × dämmDicke × brettDicke      (m³)
 *   €/m²          = volumen × preisProM3 / qm
 *
 * Fallback ohne Wandhöhe (Alt-Daten, Feld war im HTML tot): HTML-Näherung
 * 3,5 lfm Riegel je m² → 3,5 × brettDicke × dämmDicke × preisProM3.
 */
export function calcRiegelPreisProM2(
  qm: number, wandhoehe: number, daemmstaerkeCm: number, preisProM3: number, bd: Betriebsdaten,
): number {
  const area = num(qm); const h = num(wandhoehe);
  const daemm = num(daemmstaerkeCm) / 100;
  const brett = bd.riegelBrettDicke / 100;
  const preis = num(preisProM3);
  if (area <= 0 || daemm <= 0 || preis <= 0) return 0;
  if (h <= 0) {
    // HTML-Näherung (kein Excel-Widerspruch: Excel verlangt die Wandhöhe)
    return 3.5 * brett * daemm * preis;
  }
  const abstand = bd.riegelAbstand / 100;
  const laenge = area / h;
  const staenderAnzahl = Math.ceil(laenge / abstand) + 1;
  // Bei unplausibel niedriger Wandhöhe (h < 2 × Brettdicke) wäre die
  // Ständerlänge negativ und die Zeile käme mit einem NEGATIVEN Betrag in die
  // Summe. Auf 0 klemmen; die Oberfläche warnt zusätzlich am Feld
  // (siehe wandhoeheWarnung()).
  const staenderLaenge = Math.max(0, h - 2 * brett);
  const gesamtLaenge = staenderAnzahl * staenderLaenge + 2 * laenge;
  const volumen = gesamtLaenge * daemm * brett;
  return (volumen * preis) / area;
}

/**
 * Plausibilitätsprüfung der Wandhöhe für die Riegelkonstruktion.
 * Liefert einen Klartext-Hinweis oder null (alles in Ordnung).
 * Ohne Wandhöhe (0) greift die dokumentierte Näherung — das ist keine Warnung,
 * sondern wird an der Materialzeile eigens angezeigt.
 */
export function wandhoeheWarnung(wandhoehe: number, bd: Betriebsdaten): string | null {
  const h = num(wandhoehe);
  if (h <= 0) return null; // 0 = dokumentierte Näherung, wird an der Zeile angezeigt
  const mindest = (2 * bd.riegelBrettDicke) / 100;
  if (h < mindest) {
    return `Wandhöhe ${fmt(h)} m ist kleiner als 2 × Brettdicke (${fmt(mindest)} m) — ` +
      "die Riegelkonstruktion ergibt so keinen sinnvollen Wert. Bitte prüfen.";
  }
  if (h < 1.5) return `Wandhöhe ${fmt(h)} m ist ungewöhnlich niedrig — bitte prüfen (Angabe in Metern).`;
  if (h > 12) return `Wandhöhe ${fmt(h)} m ist ungewöhnlich hoch — bitte prüfen (Angabe in Metern).`;
  return null;
}

// ----------------------------------------------------------------------------
// Materialzeilen
// ----------------------------------------------------------------------------

export interface MaterialRowErgebnis {
  /** €/m² Aufbaufläche (nur DB-Modus; 0 bei manuell/berechnet) */
  ekProM2: number;
  vkProM2: number;
  /** absolute €-Beträge (manuell + berechnet; 0 im DB-Modus) */
  ekAbsolut: number;
  vkAbsolut: number;
  /**
   * true, wenn die Zeile keinen eigenen VK hatte und der Verkaufspreis aus dem
   * EK × VK-Faktor abgeleitet wurde. Die Oberfläche muss das sichtbar machen —
   * stillschweigend darf so eine Zeile weder mit 0 € im Angebot landen (alter
   * Fehler) noch unbemerkt kalkuliert werden.
   */
  vkAbgeleitet: boolean;
}

/**
 * VK einer Materialzeile: eingetragener Wert, sonst EK × VK-Faktor (1,35).
 *
 * HINTERGRUND (Edge-Case-Review 2026-07-21): Eine Zeile mit EK, aber ohne VK
 * ging mit 0 € in den Erlös und mit vollem Betrag in die Kosten — das Material
 * verschwand lautlos aus der Angebotssumme und drückte gleichzeitig die Marge.
 * Jetzt gilt dieselbe Regel wie im Katalog ("VK leer → EK × 1,35"), und die
 * Zeile wird als abgeleitet gekennzeichnet.
 */
export function vkAusEk(ekRoh: number, vkRoh: number, bd: Betriebsdaten): { vk: number; abgeleitet: boolean } {
  const ek = num(ekRoh);
  const vk = num(vkRoh);
  if (vk !== 0) return { vk, abgeleitet: false };
  if (ek <= 0) return { vk: 0, abgeleitet: false };
  return { vk: ek * (bd.vkFaktor > 0 ? bd.vkFaktor : 1), abgeleitet: true };
}

/**
 * Berechnet eine Materialzeile in allen 3 Modi.
 *
 * DB-Modus:
 *   - Artikelname beginnt mit "Riegelkonstruktion": ekPrice = €/m³ (editierbar),
 *     €/m² per Riegelgeometrie, EK = VK.
 *   - Kategorie "Dämmstoffe": €/m³ → €/m² = Preis × Dämmstärke/100.
 *     BUGFIX ggü. HTML: fehlt der VK, wird der EK-€/m³-Preis als VK-Basis
 *     genommen und die Dicke nur EINMAL multipliziert (das HTML multiplizierte
 *     den bereits umgerechneten EK nochmals mit der Dicke).
 *   - sonst: ekPrice/vkPrice sind bereits €/m².
 * Manuell: absolute €-Beträge (kein Flächenbezug).
 * Berechnet (nur Decke/Dach): absoluter €-Betrag
 *   area × lfm/m² × (b/100) × (h/100) × €/m³ — EK = VK.
 *   BUGFIX ggü. HTML: der Betrag enthält bereits die Fläche und wird in der
 *   Modulsumme NICHT nochmals mit ihr multipliziert (Doppel-Flächen-Bug).
 */
export function calcMaterialRow(
  row: MaterialRow,
  m: Pick<KalkModule, "area" | "wallHeight" | "insulationThickness" | "aufbauKategorie">,
  bd: Betriebsdaten,
): MaterialRowErgebnis {
  const leer: MaterialRowErgebnis = { ekProM2: 0, vkProM2: 0, ekAbsolut: 0, vkAbsolut: 0, vkAbgeleitet: false };
  if (row.manual) {
    const { vk, abgeleitet } = vkAusEk(row.ekPrice, row.vkPrice, bd);
    return { ...leer, ekAbsolut: num(row.ekPrice), vkAbsolut: vk, vkAbgeleitet: abgeleitet };
  }
  if (row.calc) {
    const betrag = num(m.area) * num(row.lmPerQm) * (num(row.dimension) / 100) * (num(row.dimension2) / 100) * num(row.ekPrice);
    return { ...leer, ekAbsolut: betrag, vkAbsolut: betrag };
  }
  if (!row.category || !row.product) return leer;
  if (row.product.startsWith("Riegelkonstruktion")) {
    const preis = calcRiegelPreisProM2(m.area, m.wallHeight, m.insulationThickness, row.ekPrice, bd);
    return { ...leer, ekProM2: preis, vkProM2: preis };
  }
  if (row.category === "Dämmstoffe") {
    const dicke = num(m.insulationThickness) / 100;
    const ekRoh = num(row.ekPrice);
    const vkRoh = num(row.vkPrice);
    // BUGFIX: früher war ein EK > 0 Pflicht — wer im Katalog-Modus nur den
    // Verkaufspreis kannte und den EK leer ließ, verlor die ganze Zeile
    // (Dämmung fehlte lautlos im Angebot). Jetzt genügt einer der beiden
    // Preise; der Flächen-Check entfällt, damit die €/m²-Vorschau schon vor
    // dem Eintragen der Fläche stimmt (×0 passiert ohnehin in der Summe).
    if (dicke <= 0 || (ekRoh <= 0 && vkRoh <= 0)) return leer;
    const { vk: vkBasis, abgeleitet } = vkAusEk(ekRoh, vkRoh, bd);
    return { ...leer, ekProM2: dicke * ekRoh, vkProM2: dicke * vkBasis, vkAbgeleitet: abgeleitet };
  }
  const { vk, abgeleitet } = vkAusEk(row.ekPrice, row.vkPrice, bd);
  return { ...leer, ekProM2: num(row.ekPrice), vkProM2: vk, vkAbgeleitet: abgeleitet };
}

export interface MaterialSummen {
  ekProM2: number;   // Σ €/m²-EK der DB-Zeilen
  vkProM2: number;   // Σ €/m²-VK der DB-Zeilen ("Material pro qm")
  ekAbsolut: number; // Σ absolute EK-Beträge (manuell + berechnet)
  vkAbsolut: number;
  ekTotal: number;   // ekProM2 × Fläche + ekAbsolut
  vkTotal: number;   // vkProM2 × Fläche + vkAbsolut  → Material des Aufbaus (unadjustiert)
  /**
   * EK-Summe für die Deckungsbeitrags-Rechnung: wie ekTotal, aber Zeilen ohne
   * hinterlegten EK (typisch Manuell-Zeilen, wo nur ein VK-Betrag eingetippt
   * wurde) gehen mit ihrem VK ein. Sonst würde der Verdienst zu hoch
   * ausgewiesen — lieber vorsichtig rechnen und das Ergebnis als unsicher
   * kennzeichnen.
   */
  ekSelbstkosten: number;
  /** true, sobald mind. eine Zeile über den VK-Fallback lief. */
  ekUnsicher: boolean;
  /** Anzahl Zeilen, deren VK aus dem EK abgeleitet wurde (EK gesetzt, VK leer). */
  vkAbgeleitetAnzahl: number;
}

export function calcMaterialSummen(m: KalkModule, bd: Betriebsdaten): MaterialSummen {
  let ekProM2 = 0, vkProM2 = 0, ekAbsolut = 0, vkAbsolut = 0;
  let ekSelbstkosten = 0, ekUnsicher = false, vkAbgeleitetAnzahl = 0;
  const area = num(m.area);
  for (const row of m.materialRows || []) {
    const r = calcMaterialRow(row, m, bd);
    ekProM2 += r.ekProM2; vkProM2 += r.vkProM2;
    ekAbsolut += r.ekAbsolut; vkAbsolut += r.vkAbsolut;
    if (r.vkAbgeleitet) vkAbgeleitetAnzahl += 1;

    const ekZeile = r.ekProM2 * area + r.ekAbsolut;
    const vkZeile = r.vkProM2 * area + r.vkAbsolut;
    if (ekZeile > 0) {
      ekSelbstkosten += ekZeile;
    } else if (vkZeile > 0) {
      ekSelbstkosten += vkZeile; // VK als EK annehmen
      ekUnsicher = true;
    }
  }
  return {
    ekProM2, vkProM2, ekAbsolut, vkAbsolut,
    ekTotal: ekProM2 * area + ekAbsolut,
    vkTotal: vkProM2 * area + vkAbsolut,
    ekSelbstkosten, ekUnsicher, vkAbgeleitetAnzahl,
  };
}

// ----------------------------------------------------------------------------
// Aufbau-Gesamtrechnung
// ----------------------------------------------------------------------------

export interface NachkalkErgebnis {
  istLohn: number | null;
  diffLohn: number | null;
  diffTage: number | null;
  istMaterial: number | null;  // Σ Ist-VK (€/m²) × Fläche
  diffMaterial: number | null; // Ist − Soll (Material unadjustiert)
}

export interface ModulErgebnis {
  material: MaterialSummen;
  laborCosts: number;      // Lohn
  laborHours: number;      // Arbeitsstunden
  transport: TransportErgebnis;
  craneCosts: number;
  servicesTotal: number;   // Kran + Spedition + Lohnabdunst + Sonstige
  laborTotal: number;      // Lohn + Fahrten + Dienstleistungen ("Arbeit")
  grandTotal: number;      // Material + Arbeit (unadjustiert)
  perQm: number;           // grandTotal / Fläche
  laborPerQm: number;
  nachkalk: NachkalkErgebnis;
}

export function calcModule(m: KalkModule, bd: Betriebsdaten): ModulErgebnis {
  const material = calcMaterialSummen(m, bd);
  const laborCosts = calcLohnkosten(m.workers, m.days, bd);
  const laborHours = calcArbeitsstunden(m.workers, m.days, bd);
  const transport = calcTransport(m, bd);
  const craneCosts = num(m.craneHours) * bd.kranSatz;
  const servicesTotal = craneCosts + num(m.shippingCosts) + num(m.paintCosts) + num(m.miscCosts);
  const laborTotal = laborCosts + transport.total + servicesTotal;
  const grandTotal = material.vkTotal + laborTotal;
  const area = num(m.area);

  // Nachkalkulation
  const actualDays = m.nachkalk?.actualDays;
  let istLohn: number | null = null, diffLohn: number | null = null, diffTage: number | null = null;
  if (actualDays !== null && actualDays !== undefined && num(actualDays) > 0) {
    istLohn = num(actualDays) * bd.stundenProTag * bd.mittellohn * num(m.workers);
    diffLohn = istLohn - laborCosts;
    diffTage = num(actualDays) - num(m.days);
  }
  const istRows = (m.materialRows || []).filter(
    (r) => r.actualVK !== null && r.actualVK !== undefined && r.category && r.product,
  );
  let istMaterial: number | null = null, diffMaterial: number | null = null;
  if (istRows.length > 0) {
    istMaterial = istRows.reduce((s, r) => s + num(r.actualVK), 0) * area;
    diffMaterial = istMaterial - material.vkTotal;
  }

  return {
    material, laborCosts, laborHours, transport, craneCosts, servicesTotal,
    laborTotal, grandTotal,
    perQm: area > 0 ? grandTotal / area : 0,
    laborPerQm: area > 0 ? laborTotal / area : 0,
    nachkalk: { istLohn, diffLohn, diffTage, istMaterial, diffMaterial },
  };
}

// ----------------------------------------------------------------------------
// Globaler Faktor & Projektsummen
// ----------------------------------------------------------------------------

/**
 * Globaler Aufschlag/Skonto-Faktor — ADDITIV wie Excel S6:
 *   faktor = 1 + Aufschlag/100 − Skonto/100
 * (Das HTML rechnete multiplikativ (1+a)×(1−s); Excel gewinnt.)
 */
export function globalFaktor(surchargePercent: number | null, discontPercent: number | null): number {
  return 1 + num(surchargePercent) / 100 - num(discontPercent) / 100;
}

// ----------------------------------------------------------------------------
// Verdienst / Deckungsbeitrag
// ----------------------------------------------------------------------------
//
// Die Kalkulation liefert den ERLÖS (was der Kunde zahlt). Was davon im Betrieb
// hängen bleibt, zeigt erst die Gegenüberstellung mit den echten Kosten:
//
//   Erlös          = (Material-VK + Lohn zu Mittellohn + Fahrten + DL) × Faktor
//   − Material-EK  = Σ EK-Spalte × Fläche (VK-Fallback bei EK-losen Zeilen)
//   − Lohn-SK      = Tage × 9 h × Arbeiter × Selbstkosten-Lohn (38 €/h)
//   − Fahrten      = Bus + LKW (Selbstkosten = verrechnete Kosten)
//   − DL           = Kran + Spedition + Lohnabdunst + Sonstiges (Fremdleistung)
//   = Deckungsbeitrag €
//     Marge %      = DB / Erlös × 100
//
// Bewusste Entscheidungen:
//   - Der Aufschlag/Skonto-Faktor wirkt NUR auf den Erlös. Die Selbstkosten
//     sind reale Ausgaben und werden nicht mitskaliert; ein Skonto schmälert
//     also direkt den Deckungsbeitrag (genau das soll die Warnung zeigen).
//   - Fahrten und eingekaufte Dienstleistungen werden 1:1 als Kosten geführt
//     (Durchläufer). Verdient wird daran nur über den globalen Faktor.
//   - Die Lohnlackierung (Tab 2) bleibt außen vor — sie ist wie in beiden
//     Referenzen eine eigenständige Rechnung außerhalb der Projektsumme.

export interface VerdienstErgebnis {
  erloes: number;
  materialEk: number;
  lohnSelbstkosten: number;
  fahrtkosten: number;
  dienstleistungen: number;
  selbstkosten: number;      // Σ der vier Kostenblöcke
  deckungsbeitrag: number;   // Erlös − Selbstkosten
  margeProzent: number;      // DB / Erlös × 100 (0, wenn kein Erlös)
  /** true, wenn mindestens ein Material-EK geschätzt werden musste. */
  unsicher: boolean;
}

export const leererVerdienst = (): VerdienstErgebnis => ({
  erloes: 0, materialEk: 0, lohnSelbstkosten: 0, fahrtkosten: 0, dienstleistungen: 0,
  selbstkosten: 0, deckungsbeitrag: 0, margeProzent: 0, unsicher: false,
});

/** Marge % aus DB und Erlös — ohne Erlös gibt es keine sinnvolle Marge (0 %). */
export function calcMargeProzent(deckungsbeitrag: number, erloes: number): number {
  return num(erloes) > 0 ? (num(deckungsbeitrag) / num(erloes)) * 100 : 0;
}

/** Verdienst-Rechnung für einen Aufbau (Erlös adjustiert, Kosten roh). */
export function calcVerdienst(
  m: KalkModule, erg: ModulErgebnis, faktor: number, bd: Betriebsdaten,
): VerdienstErgebnis {
  const erloes = erg.grandTotal * faktor;
  const materialEk = erg.material.ekSelbstkosten;
  const lohnSelbstkosten = calcLohnSelbstkosten(m.workers, m.days, bd);
  const fahrtkosten = erg.transport.total;
  const dienstleistungen = erg.servicesTotal;
  const selbstkosten = materialEk + lohnSelbstkosten + fahrtkosten + dienstleistungen;
  const deckungsbeitrag = erloes - selbstkosten;
  return {
    erloes, materialEk, lohnSelbstkosten, fahrtkosten, dienstleistungen,
    selbstkosten, deckungsbeitrag,
    margeProzent: calcMargeProzent(deckungsbeitrag, erloes),
    unsicher: erg.material.ekUnsicher,
  };
}

/** Addiert Verdienst-Ergebnisse (für Gesamt/Optional/ohne Optional). */
export function addVerdienst(ziel: VerdienstErgebnis, q: VerdienstErgebnis): void {
  ziel.erloes += q.erloes;
  ziel.materialEk += q.materialEk;
  ziel.lohnSelbstkosten += q.lohnSelbstkosten;
  ziel.fahrtkosten += q.fahrtkosten;
  ziel.dienstleistungen += q.dienstleistungen;
  ziel.selbstkosten += q.selbstkosten;
  ziel.deckungsbeitrag += q.deckungsbeitrag;
  ziel.unsicher = ziel.unsicher || q.unsicher;
  ziel.margeProzent = calcMargeProzent(ziel.deckungsbeitrag, ziel.erloes);
}

export type MargeAmpel = "gruen" | "gelb" | "rot";

/**
 * Ampel für die Marge: grün ab Schwelle+10 Punkten, gelb ab Schwelle,
 * darunter rot. Ohne Erlös (leerer Aufbau) gibt es nichts zu bewerten → gelb
 * wäre irreführend, daher "gruen" erst ab echtem Erlös prüfen (siehe UI).
 */
export function margeAmpel(margeProzent: number, schwelle: number): MargeAmpel {
  if (margeProzent >= num(schwelle) + 10) return "gruen";
  if (margeProzent >= num(schwelle)) return "gelb";
  return "rot";
}

/**
 * Bewertung eines Verdienst-Ergebnisses.
 *
 * HINTERGRUND (Edge-Case-Review 2026-07-21): Ein Aufbau mit 0 € Erlös und
 * 5.000 € Kosten wurde als "–" dargestellt und löste KEINE Warnung aus — eine
 * reine Verlustkalkulation sah unauffällig aus. "keinErloes" und "verlust"
 * sind daher eigene, rot gekennzeichnete Zustände.
 *
 *   leer         — nichts kalkuliert (kein Erlös, keine Kosten)
 *   keinErloes   — Kosten, aber kein Erlös → immer Verlust
 *   verlust      — Erlös da, Deckungsbeitrag aber negativ
 *   unterSchwelle— positiv, aber unter der Warnschwelle
 *   ok           — alles im grünen Bereich
 */
export type MargeStatus = "leer" | "keinErloes" | "verlust" | "unterSchwelle" | "ok";

export function margeStatus(v: VerdienstErgebnis, schwelle: number): MargeStatus {
  const erloes = num(v.erloes);
  const kosten = num(v.selbstkosten);
  if (erloes <= 0) return kosten > 0 ? "keinErloes" : "leer";
  if (num(v.deckungsbeitrag) < 0) return "verlust";
  if (num(v.margeProzent) < num(schwelle)) return "unterSchwelle";
  return "ok";
}

/** Warnung nötig? Auch dann, wenn es Kosten ohne jeden Erlös gibt. */
export function margeUnterSchwelle(v: VerdienstErgebnis, schwelle: number): boolean {
  const s = margeStatus(v, schwelle);
  return s === "keinErloes" || s === "verlust" || s === "unterSchwelle";
}

export interface ProjektZeile {
  module: KalkModule;
  ergebnis: ModulErgebnis;
  materialAdj: number; // × Faktor
  laborAdj: number;
  gesamtAdj: number;
  proQmAdj: number;    // gesamtAdj / Fläche
  pctMaterial: number; // Material / (Material+Arbeit) × 100
  pctArbeit: number;
  verdienst: VerdienstErgebnis;
}

/** Auswertungs-Panel (Excel-Überblick N3): eine Wertespalte. */
export interface AuswertungSpalte {
  material: number;     // € (adjustiert)
  arbeitszeitH: number; // h (roh)
  busFahrten: number;   // Anzahl (roh, wie Excel — das HTML zeigte €)
  lkwFahrten: number;   // Anzahl
  kranstunden: number;  // h
  spedition: number;    // € × Faktor (wie Excel Zeile 14)
  lohnabdunst: number;  // € × Faktor
  sonstige: number;     // € × Faktor
  arbeitAdj: number;    // € (adjustiert, für Kurzblock/Pie)
  gesamtAdj: number;
}

export interface ProjektErgebnis {
  zeilen: ProjektZeile[];
  faktor: number;
  totalMaterial: number; // Σ adjustiert
  totalArbeit: number;
  totalGesamt: number;
  pctMaterial: number;
  pctArbeit: number;
  gesamt: AuswertungSpalte;
  optional: AuswertungSpalte;
  ohneOptional: AuswertungSpalte;
  /** Deckungsbeitrag in denselben drei Sichten. */
  verdienst: VerdienstErgebnis;
  verdienstOptional: VerdienstErgebnis;
  verdienstOhneOptional: VerdienstErgebnis;
  /** Warnschwelle aus den Betriebsdaten (durchgereicht für die UI). */
  warnMargeProzent: number;
}

const leereSpalte = (): AuswertungSpalte => ({
  material: 0, arbeitszeitH: 0, busFahrten: 0, lkwFahrten: 0, kranstunden: 0,
  spedition: 0, lohnabdunst: 0, sonstige: 0, arbeitAdj: 0, gesamtAdj: 0,
});

/** a / (a+b) × 100 (Excel getPercentage). */
export function getPercentage(a: number, b: number): number {
  const sum = num(a) + num(b);
  return sum > 0 ? (num(a) / sum) * 100 : 0;
}

export function calcProjekt(state: KalkulationState, bd: Betriebsdaten): ProjektErgebnis {
  const faktor = globalFaktor(state.surchargePercent, state.discontPercent);
  const gesamt = leereSpalte();
  const optional = leereSpalte();
  const verdienst = leererVerdienst();
  const verdienstOptional = leererVerdienst();
  // Direkt akkumuliert statt Gesamt − Optional: nur so trägt jede Sicht ihr
  // eigenes "unsicher"-Flag (ein EK-loser Optional-Aufbau darf die Sicht
  // "ohne Optional" nicht als unsicher markieren).
  const verdienstOhneOptional = leererVerdienst();

  const zeilen: ProjektZeile[] = (state.modules || []).map((m) => {
    const erg = calcModule(m, bd);
    const verd = calcVerdienst(m, erg, faktor, bd);
    const materialAdj = erg.material.vkTotal * faktor;
    const laborAdj = erg.laborTotal * faktor;
    const gesamtAdj = materialAdj + laborAdj;
    const area = num(m.area);

    const add = (s: AuswertungSpalte) => {
      s.material += materialAdj;
      s.arbeitszeitH += erg.laborHours;
      s.busFahrten += num(m.busTrips);
      s.lkwFahrten += num(m.lkwTrips);
      s.kranstunden += num(m.craneHours);
      s.spedition += num(m.shippingCosts) * faktor;
      s.lohnabdunst += num(m.paintCosts) * faktor;
      s.sonstige += num(m.miscCosts) * faktor;
      s.arbeitAdj += laborAdj;
      s.gesamtAdj += gesamtAdj;
    };
    add(gesamt);
    addVerdienst(verdienst, verd);
    if (m.isOptional) { add(optional); addVerdienst(verdienstOptional, verd); }
    else addVerdienst(verdienstOhneOptional, verd);

    return {
      module: m, ergebnis: erg, materialAdj, laborAdj, gesamtAdj,
      proQmAdj: area > 0 ? gesamtAdj / area : 0,
      pctMaterial: getPercentage(materialAdj, laborAdj),
      pctArbeit: getPercentage(laborAdj, materialAdj),
      verdienst: verd,
    };
  });

  const ohneOptional = leereSpalte();
  (Object.keys(ohneOptional) as (keyof AuswertungSpalte)[]).forEach((k) => {
    ohneOptional[k] = gesamt[k] - optional[k];
  });

  return {
    zeilen, faktor,
    totalMaterial: gesamt.material,
    totalArbeit: gesamt.arbeitAdj,
    totalGesamt: gesamt.gesamtAdj,
    pctMaterial: getPercentage(gesamt.material, gesamt.arbeitAdj),
    pctArbeit: getPercentage(gesamt.arbeitAdj, gesamt.material),
    gesamt, optional, ohneOptional,
    verdienst, verdienstOptional, verdienstOhneOptional,
    warnMargeProzent: bd.warnMargeProzent,
  };
}

// ----------------------------------------------------------------------------
// Lohnlackierung (Tab 2) — eigenständige Rechnung, KEIN globaler Faktor,
// fließt NICHT in die Projektsumme von Tab 1 ein (beide Referenzen).
// ----------------------------------------------------------------------------

export interface LackPreis { p3: number | null; p4: number | null }
/** Preis-Resolver: (Kategorie, Artikel) → 3-/4-seitig-Preise oder null. */
export type LackPreisResolver = (category: string, product: string) => LackPreis | null;
/** Aufpreis-Resolver: Aufpreisname → €/Einheit (kann negativ sein) oder null. */
export type AufpreisResolver = (name: string) => number | null;

export interface PaintPositionErgebnis {
  basePrice: number;
  surchargesSum: number;
  unitPrice: number;
  total: number; // unitPrice × Menge
}

export function calcPaintPosition(
  pm: PaintModule, resolvePreis: LackPreisResolver, resolveAufpreis: AufpreisResolver, saetze: LackSaetze,
): PaintPositionErgebnis {
  let basePrice = 0;
  if (pm.sides === "Kunde") {
    basePrice = saetze.kundeSatz; // 4,95 €/m² unabhängig vom Lack
  } else if (pm.category && pm.product) {
    const preis = resolvePreis(pm.category, pm.product);
    if (preis) {
      if (pm.sides === "3-seitig") basePrice = num(preis.p3);
      else basePrice = preis.p4 !== null && preis.p4 !== undefined && num(preis.p4) > 0
        ? num(preis.p4)
        : num(preis.p3) * saetze.vierseitigFaktor; // 4-seitig = 3-seitig × 1,65
    }
  }
  let surchargesSum = 0;
  for (const [name, aktiv] of Object.entries(pm.surcharges || {})) {
    if (!aktiv) continue;
    const betrag = resolveAufpreis(name);
    if (betrag !== null) surchargesSum += betrag;
  }
  const unitPrice = basePrice + surchargesSum;
  return { basePrice, surchargesSum, unitPrice, total: unitPrice * num(pm.area) };
}

export interface PaintExtras { farbwechsel: number; dimension: number; anfahrt: number; fahrzeit: number; total: number }

export function calcPaintExtras(state: KalkulationState, saetze: LackSaetze): PaintExtras {
  const farbwechsel = num(state.paintColorChanges) * saetze.farbwechsel;
  const dimension = num(state.paintDimChanges) * saetze.dimension;
  const anfahrt = num(state.paintDistance) * saetze.anfahrtKm;
  const fahrzeit = num(state.paintTravelHours) * saetze.fahrzeitH;
  return { farbwechsel, dimension, anfahrt, fahrzeit, total: farbwechsel + dimension + anfahrt + fahrzeit };
}

export interface PaintProjektErgebnis {
  positionen: { pm: PaintModule; ergebnis: PaintPositionErgebnis }[];
  summeMaterial: number;
  extras: PaintExtras;
  gesamt: number;
}

export function calcPaintProjekt(
  state: KalkulationState, resolvePreis: LackPreisResolver, resolveAufpreis: AufpreisResolver, saetze: LackSaetze,
): PaintProjektErgebnis {
  const positionen = (state.paintModules || []).map((pm) => ({
    pm, ergebnis: calcPaintPosition(pm, resolvePreis, resolveAufpreis, saetze),
  }));
  const summeMaterial = positionen.reduce((s, p) => s + p.ergebnis.total, 0);
  const extras = calcPaintExtras(state, saetze);
  return { positionen, summeMaterial, extras, gesamt: summeMaterial + extras.total };
}

// ----------------------------------------------------------------------------
// Angebots-Übergabe — Payload-Vertrag EXAKT wie bisher (InvoiceDetail.tsx
// konsumiert sessionStorage["kalkulation_to_angebot"] = {betreff, customer_id,
// items:[{beschreibung, menge, einheit, einzelpreis, gesamtpreis}]}).
// ----------------------------------------------------------------------------

export interface AngebotItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
}

/**
 * Erzeugt Angebots-Positionen aus der Projektübersicht (adjustierte Werte),
 * identisch zur bisherigen Scraping-Logik: je Aufbau mit Gesamt > 0 eine
 * Position (m² über pro-qm-Preis, sonst Pauschale); Differenz zur
 * Projektsumme > 0,50 € wird als Nebenkosten-Pauschale angehängt.
 */
export function buildAngebotItems(projekt: ProjektErgebnis): { items: AngebotItem[]; projektGesamt: number } {
  const items: AngebotItem[] = [];
  projekt.zeilen.forEach((z, i) => {
    const gesamt = round2(z.gesamtAdj);
    if (gesamt <= 0) return;
    // Optionale Aufbauten sind im Angebot als solche zu erkennen (sie stecken
    // — wie in der Projektsumme — mit vollem Betrag drin).
    const name = (z.module.name || `Aufbau ${i + 1}`) + (z.module.isOptional ? " (optional)" : "");
    const mitNotiz = (titel: string) => (z.module.note ? `${titel}\n${z.module.note}` : titel);
    // Die Angebotszeile MUSS aufgehen: Menge × Einzelpreis = Gesamt.
    // (Edge-Case-Review 2026-07-21: früher wurden Menge und Einzelpreis
    // unabhängig gerundet — im Angebot stand dann z.B. 12,34 m² × 88,88 € und
    // daneben eine Summe, die dazu nicht passte. Geht die m²-Zeile nicht
    // centgenau auf, wird sie als Pauschale ausgewiesen.)
    const menge = round2(num(z.module.area));
    if (menge > 0) {
      const einzelpreis = round2(gesamt / menge);
      if (Math.abs(round2(menge * einzelpreis) - gesamt) < 0.005) {
        items.push({ beschreibung: mitNotiz(name), menge, einheit: "m²", einzelpreis, gesamtpreis: gesamt });
        return;
      }
    }
    // Als Pauschale ausweisen — die Fläche bleibt trotzdem im Positionstext
    // stehen, damit im Angebot nichts an Information verlorengeht.
    items.push({
      beschreibung: mitNotiz(menge > 0 ? `${name} (${fmt(menge)} m²)` : name),
      menge: 1, einheit: "Pauschale", einzelpreis: gesamt, gesamtpreis: gesamt,
    });
  });
  const projektGesamt = round2(projekt.totalGesamt);
  const summe = items.reduce((s, i) => s + i.gesamtpreis, 0);
  const nebenkosten = round2(projektGesamt - summe);
  if (nebenkosten > 0.5) {
    items.push({
      beschreibung: "Transport, Kran & sonstige Nebenkosten (lt. Kalkulation)",
      menge: 1, einheit: "Pauschale", einzelpreis: nebenkosten, gesamtpreis: nebenkosten,
    });
  }
  return { items, projektGesamt };
}

// ----------------------------------------------------------------------------
// Factories & Konverter für Alt-Daten
// ----------------------------------------------------------------------------

export const DAEMMSTAERKEN = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
export const AUFSCHLAG_OPTIONEN = [2, 3, 4, 5];
export const SKONTO_OPTIONEN = [2, 3];
export const MAX_MODULE = 20;
export const MAX_PAINT_MODULE = 20;
export const INITIAL_MATERIAL_ROWS = 10;

export function newMaterialRow(): MaterialRow {
  return {
    category: "", product: "", ekPrice: 0, vkPrice: 0, actualVK: null,
    manual: false, calc: false, lmPerQm: 0, dimension: 0, dimension2: 0,
  };
}

export function newModule(id: number): KalkModule {
  return {
    id, name: "", aufbauKategorie: "", note: "", area: 0, wallHeight: 0,
    insulationThickness: 20, isOptional: false, collapsed: false,
    materialRows: Array.from({ length: INITIAL_MATERIAL_ROWS }, newMaterialRow),
    workers: 0, days: 0, distanceKM: 0, busTrips: 0, lkwTrips: 0,
    craneHours: 0, shippingCosts: 0, paintCosts: 0, miscCosts: 0,
    nachkalk: { actualDays: null },
  };
}

export function newPaintModule(id: number): PaintModule {
  return {
    id, name: "", category: "", product: "", area: 0, amountMode: "qm",
    sides: "3-seitig", isOptional: false, collapsed: false, surcharges: {},
  };
}

export function newEmptyState(): KalkulationState {
  return {
    settings: { businessData: {} },
    modules: [], paintModules: [], projectName: "",
    surchargePercent: null, discontPercent: null,
    paintColorChanges: 0, paintDimChanges: 0, paintDistance: 0, paintTravelHours: 0,
  };
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Konverter: macht aus einem beliebigen kalkulationen.data-Blob (alter
 * localStorage-Shape des iframe-Tools ODER neuer nativer State) einen sauberen
 * KalkulationState. Repliziert die Defensivlogik des Originals:
 *   - fehlende Teilbäume → Defaults, nachkalk/actualVK-Normalisierung
 *   - Legacy-Top-Level-Feld `mittellohn` → businessData["Mittellohn"]
 *   - Alt-Felder nachkalk.actualMaterial/actualLabor werden verworfen
 *   - legacy settings.products/paintPrices/paintSurcharges bleiben als
 *     Preis-Fallback erhalten (UI nutzt den DB-Katalog)
 * BUGFIX ggü. HTML: projectName wird wiederhergestellt (ging dort verloren).
 */
export function normalizeKalkulationState(raw: unknown): KalkulationState {
  const state = newEmptyState();
  if (!raw || typeof raw !== "object") return state;
  const o = raw as Record<string, any>;

  if (o.settings && typeof o.settings === "object") {
    if (o.settings.businessData && typeof o.settings.businessData === "object") {
      for (const [k, v] of Object.entries(o.settings.businessData)) {
        const n = numOrNull(v);
        if (n !== null) state.settings.businessData[k] = n;
      }
    }
    if (o.settings.products && typeof o.settings.products === "object") state.settings.products = o.settings.products;
    if (o.settings.paintPrices && typeof o.settings.paintPrices === "object") state.settings.paintPrices = o.settings.paintPrices;
    if (o.settings.paintSurcharges && typeof o.settings.paintSurcharges === "object") state.settings.paintSurcharges = o.settings.paintSurcharges;
  }
  // Legacy: top-level `mittellohn` (sehr alte Blobs)
  if (numOrNull(o.mittellohn) !== null && state.settings.businessData["Mittellohn"] === undefined) {
    state.settings.businessData["Mittellohn"] = num(o.mittellohn);
  }

  state.projectName = typeof o.projectName === "string" ? o.projectName : "";
  state.surchargePercent = numOrNull(o.surchargePercent);
  state.discontPercent = numOrNull(o.discontPercent);
  state.paintColorChanges = num(o.paintColorChanges);
  state.paintDimChanges = num(o.paintDimChanges);
  state.paintDistance = num(o.paintDistance);
  state.paintTravelHours = num(o.paintTravelHours);

  if (Array.isArray(o.modules)) {
    state.modules = o.modules.map((m: any, i: number): KalkModule => {
      const base = newModule(num(m?.id) || i + 1);
      if (!m || typeof m !== "object") return base;
      const rows: MaterialRow[] = Array.isArray(m.materialRows)
        ? m.materialRows.map((r: any): MaterialRow => ({
            category: typeof r?.category === "string" ? r.category : "",
            product: typeof r?.product === "string" ? r.product : "",
            ekPrice: num(r?.ekPrice),
            vkPrice: num(r?.vkPrice),
            actualVK: numOrNull(r?.actualVK),
            manual: !!r?.manual,
            calc: !!r?.calc,
            lmPerQm: num(r?.lmPerQm),
            dimension: num(r?.dimension),
            dimension2: num(r?.dimension2),
          }))
        : base.materialRows;
      return {
        ...base,
        name: typeof m.name === "string" ? m.name : "",
        aufbauKategorie: (["Wand", "Decke", "Dach", "AW"].includes(m.aufbauKategorie) ? m.aufbauKategorie : "") as KalkModule["aufbauKategorie"],
        note: typeof m.note === "string" ? m.note : "",
        area: num(m.area),
        wallHeight: num(m.wallHeight),
        insulationThickness: num(m.insulationThickness) || 20,
        isOptional: !!m.isOptional,
        collapsed: !!m.collapsed,
        materialRows: rows,
        workers: num(m.workers),
        days: num(m.days),
        distanceKM: num(m.distanceKM),
        busTrips: num(m.busTrips),
        lkwTrips: num(m.lkwTrips),
        craneHours: num(m.craneHours),
        shippingCosts: num(m.shippingCosts),
        paintCosts: num(m.paintCosts),
        miscCosts: num(m.miscCosts),
        // Alt-Felder actualMaterial/actualLabor werden bewusst verworfen (wie Original)
        nachkalk: { actualDays: numOrNull(m.nachkalk?.actualDays) },
      };
    });
  }

  if (Array.isArray(o.paintModules)) {
    state.paintModules = o.paintModules.map((p: any, i: number): PaintModule => {
      const base = newPaintModule(num(p?.id) || i + 1);
      if (!p || typeof p !== "object") return base;
      const surcharges: Record<string, boolean> = {};
      if (p.surcharges && typeof p.surcharges === "object") {
        for (const [k, v] of Object.entries(p.surcharges)) surcharges[k] = !!v;
      }
      return {
        ...base,
        name: typeof p.name === "string" ? p.name : "",
        category: typeof p.category === "string" ? p.category : "",
        product: typeof p.product === "string" ? p.product : "",
        area: num(p.area),
        amountMode: p.amountMode === "lfm" ? "lfm" : "qm",
        sides: (["3-seitig", "4-seitig", "Kunde"].includes(p.sides) ? p.sides : "3-seitig") as PaintModule["sides"],
        isOptional: !!p.isOptional,
        collapsed: !!p.collapsed,
        surcharges,
      };
    });
  }

  return state;
}

/** Nächste freie Modul-ID (max + 1, beginnend bei 1 — wie Original). */
export function nextId(list: { id: number }[]): number {
  return list.length === 0 ? 1 : Math.max(...list.map((m) => num(m.id))) + 1;
}

// ----------------------------------------------------------------------------
// Formatierung (de-AT, netto)
// ----------------------------------------------------------------------------

const nf = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt = (n: number): string => nf.format(Number.isFinite(n) ? n : 0);
export const fmtEuro = (n: number): string => `${fmt(n)} €`;
