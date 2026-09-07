// ============================================================================
// LV aus Excel (Kundenwunsch 07.09.2026: „Ausschreibungs-LV per Excel
// erhalten — bitte erweitern, dass ich auch Excel-Dateien einlesen und
// kalkulieren kann").
//
// Excel-LVs haben kein festes Schema (jeder Planer baut seine Tabelle anders).
// Deshalb in zwei Schritten:
//   1. erkenneSpalten(): Kopfzeile + Spalten (Pos-Nr, Text, Menge, Einheit,
//      Einheitspreis) anhand üblicher Überschriften erraten — der Anwender
//      sieht den Vorschlag und korrigiert ihn im Zuordnungs-Dialog.
//   2. baueLvAusZellen(): aus Zellen + Zuordnung dieselbe OnlvLV-Struktur
//      erzeugen, die auch der ÖNORM-Import liefert — Bepreisen, Summen und
//      „Als Angebot übernehmen" laufen danach unverändert.
//
// Die Funktionen arbeiten auf einer reinen Zellen-Matrix (Strings/Zahlen),
// damit sie ohne xlsx-Bibliothek testbar sind; das Lesen der Datei macht
// die Seite (dynamischer Import von xlsx, bleibt aus dem Hauptbundle).
// ============================================================================
import { parseDecimal } from "@/lib/num";
import type { OnlvLV, OnlvPosition } from "./onlv";

export type Zelle = string | number | boolean | null | undefined;
export type Zellen = Zelle[][];

export interface SpaltenZuordnung {
  pos: number | null;
  kurztext: number | null;
  langtext: number | null;
  menge: number | null;
  einheit: number | null;
  ep: number | null;
}

export class LvExcelFehler extends Error {}

const text = (z: Zelle): string => (z == null ? "" : String(z)).replace(/\s+/g, " ").trim();

/** Überschriften, wie sie in Planer-Tabellen üblicherweise stehen (klein, ohne Sonderzeichen). */
const KOPF_MUSTER: Record<keyof SpaltenZuordnung, RegExp[]> = {
  pos: [/^(pos|pos\.?\s*nr|position|positionsnr|positionsnummer|nr|oz|lfd\.?\s*nr|ordnungszahl)\.?$/],
  kurztext: [/^(kurztext|bezeichnung|leistung|leistungsbeschreibung|beschreibung|text|positionstext|artikel|stichwort)$/],
  langtext: [/^(langtext|beschreibung\s*lang|detail|details|erläuterung|erlaeuterung)$/],
  menge: [/^(menge|mengen|anzahl|stück|stk\.?|ausschreibungsmenge|lv-?menge)$/],
  einheit: [/^(einheit|einh\.?|eh|me|mengeneinheit|dim|dimension)$/],
  ep: [/^(ep|einheitspreis|e\.?p\.?|preis|preis\/eh|preis je einheit|einzelpreis|ep\s*€|ep\s*netto)$/],
};

const norm = (s: string) => s.toLowerCase().replace(/[€()\[\]:]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Kopfzeile und Spalten erraten. Liefert kopfZeile = -1, wenn keine
 * Überschriften gefunden wurden — dann werden die Spalten am Inhalt geraten.
 */
export function erkenneSpalten(zellen: Zellen): { kopfZeile: number; zuordnung: SpaltenZuordnung } {
  const leer = (): SpaltenZuordnung => ({ pos: null, kurztext: null, langtext: null, menge: null, einheit: null, ep: null });
  let beste = { kopfZeile: -1, zuordnung: leer(), treffer: 0 };
  for (let r = 0; r < Math.min(zellen.length, 40); r++) {
    const zeile = zellen[r] || [];
    const z = leer();
    let treffer = 0;
    zeile.forEach((zelle, c) => {
      const t = norm(text(zelle));
      if (!t) return;
      for (const feld of Object.keys(KOPF_MUSTER) as (keyof SpaltenZuordnung)[]) {
        if (z[feld] === null && KOPF_MUSTER[feld].some((re) => re.test(t))) { z[feld] = c; treffer += 1; break; }
      }
    });
    if (treffer > beste.treffer) beste = { kopfZeile: r, zuordnung: z, treffer };
    if (treffer >= 4) break;
  }
  if (beste.treffer >= 2) return { kopfZeile: beste.kopfZeile, zuordnung: beste.zuordnung };

  // Kein brauchbarer Kopf: Spalten am Inhalt raten.
  const z = leer();
  const spalten = Math.max(0, ...zellen.slice(0, 200).map((r) => (r || []).length));
  const stat = Array.from({ length: spalten }, (_, c) => {
    let zahlen = 0, posartig = 0, kurz = 0, textLaenge = 0, belegt = 0;
    for (const r of zellen.slice(0, 200)) {
      const t = text((r || [])[c]);
      if (!t) continue;
      belegt += 1;
      if (/^\d{1,3}([.\-/ ]\d{1,4})*[a-z]?$/i.test(t)) posartig += 1;
      if (parseDecimal(t) !== null && !/^\d{1,3}([.\-/ ]\d{1,4}){2,}$/.test(t)) zahlen += 1;
      if (/^[a-zäöü²³.]{1,6}\d?$/i.test(t)) kurz += 1; // m2, lfm, Stk., psch
      textLaenge += t.length;
    }
    return { c, belegt, zahlen, posartig, kurz, mittel: belegt ? textLaenge / belegt : 0 };
  }).filter((s) => s.belegt > 0);
  const nimm = (auswahl: typeof stat) => (auswahl.length ? auswahl[0].c : null);
  z.pos = nimm([...stat].filter((s) => s.posartig / s.belegt > 0.6).sort((a, b) => a.c - b.c));
  z.kurztext = nimm([...stat].filter((s) => s.c !== z.pos).sort((a, b) => b.mittel - a.mittel));
  z.einheit = nimm([...stat].filter((s) => s.c !== z.pos && s.c !== z.kurztext && s.kurz / s.belegt >= 0.6).sort((a, b) => a.c - b.c));
  const zahlSpalten = [...stat].filter((s) => ![z.pos, z.kurztext, z.einheit].includes(s.c) && s.zahlen / s.belegt > 0.7).sort((a, b) => a.c - b.c);
  z.menge = zahlSpalten[0]?.c ?? null;
  z.ep = zahlSpalten[1]?.c ?? null;
  return { kopfZeile: -1, zuordnung: z };
}

/** Einheiten, wie Planer sie schreiben → Schreibweise der App. */
export function normalisiereEinheit(roh: string): string | null {
  const t = roh.trim().replace(/\.$/, "");
  if (!t) return null;
  const k = t.toLowerCase().replace(/\s+/g, "");
  const map: Record<string, string> = {
    m2: "m²", qm: "m²", "m²": "m²", m3: "m³", cbm: "m³", "m³": "m³", lfm: "lfm", lm: "lfm", m: "m",
    stk: "Stk.", "stk.": "Stk.", st: "Stk.", stück: "Stk.", stueck: "Stk.", psch: "Pauschale", pa: "Pauschale",
    pausch: "Pauschale", pauschal: "Pauschale", pauschale: "Pauschale", h: "h", std: "h", "std.": "h", stunde: "h",
    stunden: "h", kg: "kg", t: "t", l: "l", lt: "l", tag: "Tag", tage: "Tag", wo: "Woche", woche: "Woche",
  };
  return map[k] ?? t;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const alsHtml = (s: string): string =>
  s.split(/\r?\n/).map((z) => z.trim()).filter(Boolean).map((z) => `<p>${escapeHtml(z)}</p>`).join("");

/** Positionsnummer in ihre Ebenen zerlegen: „01.02.03A" → ["01","02","03A"]. */
export const nummerTeile = (nr: string): string[] =>
  nr.trim().replace(/[\s/\-]+/g, ".").split(".").map((t) => t.trim()).filter(Boolean);

/**
 * Aus Zellen + Zuordnung ein LV in der Struktur des ÖNORM-Imports bauen.
 *
 * - Zeilen mit Menge UND Einheit sind bepreisbare Positionen.
 * - Zeilen nur mit Text (Überschriften, Vorbemerkungen) werden Vertragstexte
 *   (positionsart „text") und liefern die LG-/ULG-Überschriften für die
 *   folgenden Positionen: eine Nummer mit einer Ebene („01") ist eine
 *   Leistungsgruppe, mit zwei Ebenen („01.02") eine Unterleistungsgruppe.
 * - Ein Einheitspreis aus der Datei landet als Vorschlag in „EP Sonstiges".
 */
export function baueLvAusZellen(
  zellen: Zellen,
  kopfZeile: number,
  zu: SpaltenZuordnung,
  dateiName: string,
  blattName?: string,
): OnlvLV {
  if (zu.kurztext === null && zu.pos === null) {
    throw new LvExcelFehler("Bitte mindestens die Spalte mit dem Positionstext zuordnen.");
  }
  const positionen: OnlvPosition[] = [];
  let lg = "", lgUeberschrift = "", ulg = "", ulgUeberschrift = "";
  let laufend = 0;
  const wert = (zeile: Zelle[], c: number | null) => (c === null ? "" : text(zeile[c]));
  for (let r = kopfZeile + 1; r < zellen.length; r++) {
    const zeile = zellen[r] || [];
    const nr = wert(zeile, zu.pos);
    const kurz = wert(zeile, zu.kurztext);
    const lang = wert(zeile, zu.langtext);
    const mengeRoh = wert(zeile, zu.menge);
    const einheit = normalisiereEinheit(wert(zeile, zu.einheit));
    const menge = mengeRoh ? parseDecimal(mengeRoh) : null;
    const epRoh = wert(zeile, zu.ep);
    const ep = epRoh ? parseDecimal(epRoh) : null;
    if (!nr && !kurz && !lang) continue; // Leerzeile
    // Summen-/Übertragszeilen des Planers gehören nicht ins LV.
    if (!nr && /^(summe|gesamtsumme|zwischensumme|übertrag|uebertrag|netto|brutto|ust|mwst)/i.test(kurz)) continue;

    const teile = nummerTeile(nr);
    const bepreisbar = menge !== null && !!einheit;
    const stichwort = kurz || lang.split(/\r?\n/)[0] || nr;
    if (!bepreisbar) {
      // Überschrift / Vorbemerkung → Gliederung mitführen
      if (teile.length === 1) { lg = teile[0]; lgUeberschrift = stichwort; ulg = ""; ulgUeberschrift = ""; }
      else if (teile.length === 2) { lg = teile[0]; ulg = teile[1]; ulgUeberschrift = stichwort; }
      else if (teile.length === 0 && !menge && !einheit && kurz && !lang) {
        // Text ohne Nummer und ohne Menge: Zwischenüberschrift
        if (!lg) { lg = "1"; lgUeberschrift = stichwort; } else { ulg = ulg || "1"; ulgUeberschrift = stichwort; }
      }
    }
    if (bepreisbar) {
      if (teile.length >= 1 && !lg) lg = teile[0];
      if (teile.length >= 2 && !ulg) ulg = teile[1];
    }
    laufend += 1;
    positionen.push({
      nummer: nr || String(laufend),
      lg: (teile.length >= 1 ? teile[0] : lg) || "1",
      lgUeberschrift,
      ulg: (teile.length >= 2 ? teile[1] : ulg) || "",
      ulgUeberschrift,
      grundtextNr: teile.length >= 3 ? teile.slice(2).join(".") : (teile.length === 0 ? String(laufend) : ""),
      ftnr: null,
      stichwort,
      langtextHtml: alsHtml([kurz && lang ? lang : (lang || (kurz !== stichwort ? kurz : ""))].filter(Boolean).join("\n")),
      einheit: bepreisbar ? einheit : null,
      menge: bepreisbar ? menge : null,
      positionsart: bepreisbar ? "normal" : "text",
      leistungsteil: null,
      sort: laufend,
      epSonstiges: bepreisbar && ep !== null && ep > 0 ? ep : null,
    });
  }
  if (positionen.length === 0) {
    throw new LvExcelFehler("In der Tabelle wurden keine Positionen gefunden — bitte Kopfzeile und Spalten prüfen.");
  }
  const basis = dateiName.replace(/\.(xlsx|xlsm|xls|csv)$/i, "");
  return {
    schemaVersion: "Excel",
    lvcode: "",
    vorhaben: basis,
    lvbezeichnung: blattName && blattName !== basis ? `${basis} — ${blattName}` : basis,
    auftraggeberName: "",
    auftraggeberAdresse: "",
    waehrung: "EUR",
    preisbasis: "",
    erstelltAm: "",
    programmsystem: "Excel",
    positionen,
    vorbemerkungen: [],
  };
}
