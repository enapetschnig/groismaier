/**
 * Belegsummen — die EINE Wahrheit für Netto, USt und Brutto eines Belegs.
 *
 * Warum es diese Datei gibt: Die Summen wurden an mehreren Stellen getrennt
 * gerechnet — im Beleg-Editor, im PDF-Erzeuger und in der Vorschau. Genau
 * daraus entstand der schwerste gefundene Fehler: Das PDF rechnete
 * Menge × Einzelpreis nach, während Editor und Datenbank mit dem
 * gespeicherten Zeilenbetrag arbeiteten — der Kunde bekam die doppelte
 * Rechnungssumme gedruckt.
 *
 * Regeln, die hier zusammenlaufen:
 *  - Aufbau-Gruppen: Die Detailzeilen tragen den Betrag 0, die Sammelzeile
 *    (ist_gruppensumme) trägt ihn. Detailzeilen dürfen NIE über
 *    Menge × Einzelpreis in eine Summe eingehen, sonst zählt der Aufbau
 *    doppelt.
 *  - mwst_exempt-Zeilen (z.B. Anzahlungs-Abzüge auf der Schlussrechnung)
 *    enthalten bereits BRUTTO-Beträge und werden nach der USt-Rechnung
 *    hinzugezählt.
 *  - Reverse Charge (§ 19 Abs. 1a): keine USt, Rechnungsbetrag = Netto.
 */

export const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export interface BelegPosition {
  beschreibung?: string | null;
  menge?: number | null;
  einzelpreis?: number | null;
  rabatt_prozent?: number | null;
  gesamtpreis?: number | null;
  mwst_exempt?: boolean | null;
  gruppe?: string | null;
  ist_gruppensumme?: boolean | null;
  /**
   * INFOPOSITION (Kundenwunsch 28.08.2026): Die Zeile zeigt ihren Betrag am
   * Beleg, zählt aber NICHT in die Belegsumme — z.B. ein optionaler Aufbau
   * aus der Kalkulation, den der Kunde dazunehmen kann.
   */
  ist_info?: boolean | null;
}

export interface BelegKopf {
  mwst_satz?: number | null;
  rabatt_prozent?: number | null;
  rabatt_betrag?: number | null;
  reverse_charge?: boolean | null;
}

export interface Summen {
  /** Summe der steuerpflichtigen Positionen vor Kopfrabatt. */
  positionenNetto: number;
  /** Bereits BRUTTO — Anzahlungs-Abzüge und andere befreite Zeilen. */
  exemptBrutto: number;
  rabattWert: number;
  nettoSumme: number;
  mwstBetrag: number;
  bruttoSumme: number;
}

/**
 * Wird die Zeile beim Speichern überhaupt geschrieben?
 *
 * Der Beleg-Editor speichert nur Positionen mit Beschreibung. Zählte eine
 * beschreibungslose Zeile trotzdem in die Kopfsummen, stand in der Datenbank
 * ein höherer Betrag als die Summe der gespeicherten Zeilen — der Beleg ging
 * nicht auf (Audit-Befund).
 */
export const istSpeicherbar = (p: BelegPosition): boolean =>
  String(p.beschreibung ?? "").trim().length > 0;

export const speicherbarePositionen = <T extends BelegPosition>(positionen: T[]): T[] =>
  (positionen || []).filter(istSpeicherbar);

/**
 * Zeilenbetrag NEU berechnen (nach Änderung von Menge, Preis, Rabatt oder
 * nach Anwenden einer Kalkulation).
 *
 * Detailzeilen eines Aufbaus bleiben bei 0 — ihr Betrag steckt in der
 * Sammelzeile. Ohne diese Regel verdoppelte schon das Anwenden einer
 * Kalkulation auf eine Detailzeile den ganzen Aufbau.
 */
export const neuerZeilenbetrag = (p: BelegPosition): number =>
  istDetailzeile(p) ? 0 : berechneZeilenpreis(p.menge, p.einzelpreis, p.rabatt_prozent);

/** Gehört die Zeile zu einer Gruppe, ohne deren Sammelzeile zu sein? */
export const istDetailzeile = (p: BelegPosition): boolean =>
  !!(p.gruppe && String(p.gruppe).trim()) && !p.ist_gruppensumme;

/** Zeilenpreis aus Menge, Einzelpreis und Zeilenrabatt. */
export const berechneZeilenpreis = (
  menge: number | null | undefined,
  einzelpreis: number | null | undefined,
  rabattProzent: number | null | undefined = 0,
): number => round2((Number(menge) || 0) * (Number(einzelpreis) || 0) * (1 - (Number(rabattProzent) || 0) / 100));

/**
 * Der Betrag, mit dem die Zeile in die Belegsumme eingeht.
 *
 * Vorrang hat der GESPEICHERTE gesamtpreis: Er ist das, was der Anwender im
 * Editor gesehen und bestätigt hat, und was in der Datenbank steht. Nur wenn
 * er fehlt, wird nachgerechnet.
 */
export const zeilenBetrag = (p: BelegPosition): number => {
  // INFOPOSITION: Betrag steht sichtbar an der Zeile (gesamtpreis), geht aber
  // bewusst NICHT in die Belegsumme ein.
  if (p.ist_info) return 0;
  if (istDetailzeile(p)) return 0;
  if (p.gesamtpreis !== null && p.gesamtpreis !== undefined) return round2(Number(p.gesamtpreis));
  return berechneZeilenpreis(p.menge, p.einzelpreis, p.rabatt_prozent);
};

/** Sämtliche Belegsummen aus Positionen und Kopfdaten. */
export function belegSummen(positionen: BelegPosition[], kopf: BelegKopf): Summen {
  // Nur Zeilen, die auch gespeichert werden — sonst weichen Kopfsumme und
  // Summe der Positionen voneinander ab.
  const zeilen = speicherbarePositionen(positionen || []).map((p) => ({ p, betrag: zeilenBetrag(p) }));

  const exemptBrutto = round2(zeilen.filter((z) => z.p.mwst_exempt).reduce((s, z) => s + z.betrag, 0));
  const positionenNetto = round2(zeilen.filter((z) => !z.p.mwst_exempt).reduce((s, z) => s + z.betrag, 0));

  const rabattProzent = Number(kopf.rabatt_prozent) || 0;
  const rabattWert = round2(rabattProzent > 0
    ? positionenNetto * (rabattProzent / 100)
    : (Number(kopf.rabatt_betrag) || 0));

  const nettoSumme = round2(positionenNetto - rabattWert);
  const mwstBetrag = kopf.reverse_charge
    ? 0
    : round2(nettoSumme * ((Number(kopf.mwst_satz) || 0) / 100));
  const bruttoSumme = round2(nettoSumme + mwstBetrag + exemptBrutto);

  return { positionenNetto, exemptBrutto, rabattWert, nettoSumme, mwstBetrag, bruttoSumme };
}
