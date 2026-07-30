/**
 * Tests der Finanzplanung gegen die ECHTEN Zahlen aus der Planrechnung des
 * Steuerberaters (Holzbau Groismaier, Stand 5/2025). Die Erwartungswerte sind
 * keine erfundenen Beispiele, sondern aus der Excel-Datei ausgelesen.
 */
import { describe, it, expect } from "vitest";
import {
  verteileAuftrag, berechneGuV, berechneKoest, afaFuerJahr, kreditReihe,
  berechneLiquiditaet, monatsIndex, leereReihe, addiere, summeReihe,
} from "./finanzplanung";

const summe = (r: { betrag: number }[]) => r.reduce((s, x) => s + x.betrag, 0);

describe("Zahlungsverteilung", () => {
  it("Excel-Fall Scheubmayer: 86.900 €, Anz 15 %, Schluss 30 %, 4 Raten", () => {
    const r = verteileAuftrag({
      summe: 86900, startIdx: 8, endeIdx: 9,
      anzProzent: 15, schlussProzent: 30, teilzahlungen: 4,
    });
    expect(r.find(x => x.art === "anzahlung")?.betrag).toBe(13035);
    expect(r.filter(x => x.art === "teilzahlung")).toHaveLength(4);
    expect(r.filter(x => x.art === "teilzahlung")[0].betrag).toBeCloseTo(11948.75, 2);
    expect(summe(r.filter(x => x.art === "schluss"))).toBe(26070);
    expect(summe(r)).toBeCloseTo(86900, 2);
  });

  it("Band bis 10.000: 50 % Anzahlung, Rest zum Ende", () => {
    const r = verteileAuftrag({ summe: 8000, startIdx: 1, endeIdx: 4 });
    expect(r.find(x => x.art === "anzahlung")?.betrag).toBe(4000);
    expect(summe(r.filter(x => x.art === "schluss"))).toBe(4000);
    expect(summe(r)).toBeCloseTo(8000, 2);
  });

  it("Band bis 60.000: 30 % Anzahlung, eine Teilrechnung, 10 % Schluss", () => {
    const r = verteileAuftrag({ summe: 22000, startIdx: 5, endeIdx: 6 });
    expect(r.find(x => x.art === "anzahlung")?.betrag).toBe(6600);
    expect(r.filter(x => x.art === "teilzahlung")).toHaveLength(1);
    expect(summe(r.filter(x => x.art === "schluss"))).toBe(2200);
    expect(summe(r)).toBeCloseTo(22000, 2);
  });

  it("Band über 60.000: 15 % Anzahlung, 10 % Schluss", () => {
    const r = verteileAuftrag({ summe: 190000, startIdx: 5, endeIdx: 7 });
    expect(r.find(x => x.art === "anzahlung")?.betrag).toBe(28500);
    expect(summe(r.filter(x => x.art === "schluss"))).toBe(19000);
    expect(summe(r)).toBeCloseTo(190000, 2);
  });

  it("Ein-Monats-Projekt: alles in diesem Monat", () => {
    const r = verteileAuftrag({ summe: 50000, startIdx: 3, endeIdx: 3 });
    expect(r).toHaveLength(1);
    expect(r[0].betrag).toBe(50000);
  });

  it("krumme Raten gehen exakt auf und liegen im Zeitraum", () => {
    const r = verteileAuftrag({ summe: 100000, startIdx: 1, endeIdx: 12, teilzahlungen: 3 });
    expect(summe(r)).toBeCloseTo(100000, 2);
    expect(r.every(x => x.idx >= 1 && x.idx <= 12)).toBe(true);
  });

  it("ohne Summe oder ohne Zeitraum entstehen keine Raten", () => {
    expect(verteileAuftrag({ summe: 0, startIdx: 1, endeIdx: 5 })).toHaveLength(0);
    expect(verteileAuftrag({ summe: 5000, startIdx: 0, endeIdx: 0 })).toHaveLength(0);
  });

  it("verdrehter Zeitraum verliert keinen Betrag", () => {
    expect(summe(verteileAuftrag({ summe: 30000, startIdx: 9, endeIdx: 4 }))).toBeCloseTo(30000, 2);
  });
});

describe("Körperschaftsteuer", () => {
  it("23 % über der Schwelle (Excel-Wert 2025)", () => {
    expect(berechneKoest(142296.66)).toBeCloseTo(32728.23, 2);
  });
  it("Mindest-KÖSt 500 € bis 2.173,92 €", () => {
    expect(berechneKoest(2000)).toBe(500);
    expect(berechneKoest(2173.92)).toBe(500);
    expect(berechneKoest(2200)).toBeCloseTo(506, 2);
  });
  it("Verlust: trotzdem Mindest-KÖSt", () => {
    expect(berechneKoest(-61749)).toBe(500);
  });
});

describe("Plan-GuV", () => {
  const basis = {
    umsatz: 483165.74, sonstigeErtraege: 57885.0,
    wareneinkauf: 142595.22, personalkosten: 115934.17,
    abschreibung: 0, gwg: 0, zinsertrag: 0, zinsaufwand: 2090.81,
  };

  it("bildet die Excel-Kette 2025 exakt ab", () => {
    const g = berechneGuV({ ...basis, sbaw: 138133.88 });
    const z = (l: string) => g.zeilen.find(x => x.label === l)?.betrag;
    expect(z("Betriebsleistung")).toBeCloseTo(541050.74, 2);
    expect(g.egt).toBeCloseTo(142296.66, 2);
    expect(g.gewinn).toBeCloseTo(109568.43, 2);
  });

  it("Quoten beziehen sich auf die Betriebsleistung", () => {
    const g = berechneGuV({ ...basis, sbaw: 138133.88 });
    expect(g.zeilen.find(x => x.label === "Wareneinsatz")?.prozent).toBeCloseTo(26.36, 1);
    expect(g.zeilen.find(x => x.label === "Personalkosten")?.prozent).toBeCloseTo(21.43, 1);
  });

  it("mit den im Excel nicht summierten SBAW-Zeilen sinkt der Gewinn", () => {
    // Vier Zeilen (Firmengründung, KFZ Stapler, Strohdämmung, KFZ Kran) tragen
    // 43.649,34 € Kosten, haben im Excel aber keine Jahressummen-Formel.
    const g = berechneGuV({ ...basis, sbaw: 181783.22 });
    expect(g.egt).toBeCloseTo(98647.32, 2);
    expect(g.gewinn).toBeCloseTo(75958.44, 2);
  });

  it("Betriebsleistung 0 erzeugt keine Division durch Null", () => {
    const g = berechneGuV({
      umsatz: 0, sonstigeErtraege: 0, wareneinkauf: 0, personalkosten: 0,
      abschreibung: 0, gwg: 0, sbaw: 0, zinsertrag: 0, zinsaufwand: 0,
    });
    expect(g.zeilen.every(z => z.prozent === null || Number.isFinite(z.prozent))).toBe(true);
  });
});

describe("Abschreibung", () => {
  const m = (monat: number, nd: number | null, gwg = false) =>
    [{ bezeichnung: "M", jahr: 2025, monat, betrag: nd ? 13000 : 800, nutzungsdauer: nd, ist_gwg: gwg }];

  it("1. Halbjahr volle, 2. Halbjahr halbe Jahres-AfA", () => {
    expect(afaFuerJahr(m(3, 13), 2025).abschreibung).toBeCloseTo(1000, 2);
    expect(afaFuerJahr(m(9, 13), 2025).abschreibung).toBeCloseTo(500, 2);
  });

  it("GWG sofort und nicht in der AfA", () => {
    const r = afaFuerJahr(m(9, null, true), 2025);
    expect(r.gwg).toBe(800);
    expect(r.abschreibung).toBe(0);
  });

  it("nach Ablauf der Nutzungsdauer nichts mehr", () => {
    expect(afaFuerJahr(
      [{ bezeichnung: "M", jahr: 2020, monat: 3, betrag: 13000, nutzungsdauer: 3, ist_gwg: false }],
      2025).abschreibung).toBe(0);
  });

  it("Summe über die Laufzeit ergibt den Anschaffungswert", () => {
    const anschaffung = [{ bezeichnung: "M", jahr: 2025, monat: 9, betrag: 12000, nutzungsdauer: 3, ist_gwg: false }];
    const gesamt = [2025, 2026, 2027, 2028]
      .reduce((s, j) => s + afaFuerJahr(anschaffung, j).abschreibung, 0);
    expect(gesamt).toBeCloseTo(12000, 2);
  });
});

describe("Kreditraten", () => {
  it("summiert laufende Kredite, ignoriert inaktive, endet mit der Laufzeit", () => {
    const r = kreditReihe([
      { rate_monatlich: 726, start_jahr: 2025, start_monat: 1, laufzeit_monate: 24, aktiv: true },
      { rate_monatlich: 4500, start_jahr: 2025, start_monat: 1, laufzeit_monate: null, aktiv: true },
      { rate_monatlich: 999, start_jahr: 2025, start_monat: 1, laufzeit_monate: 12, aktiv: false },
    ], 2025, 36);
    expect(r[1]).toBe(5226);
    expect(r[30]).toBe(4500);
  });
});

describe("Liquiditätsplan", () => {
  it("kumuliert den Endbestand über die Monate", () => {
    const zu = leereReihe(); addiere(zu, 1, 16562); addiere(zu, 2, 12120); addiere(zu, 3, 103311);
    const ab = leereReihe(); addiere(ab, 1, 42420); addiere(ab, 2, 49975); addiere(ab, 3, 97982);
    const l = berechneLiquiditaet({
      kundenzahlungen: zu, zinsertraege: {}, uebrigeErloese: {}, kreditlinienNeu: {},
      sbaw: ab, wareneinkauf: {}, personal: {}, investitionen: {}, kreditraten: {},
      anfangsbestand: 0, anzahlMonate: 3,
    }, 2025);
    expect(l[0].saldo).toBeCloseTo(-25858, 2);
    expect(l[1].endbestand).toBeCloseTo(-63713, 2);
    expect(l[2].endbestand).toBeCloseTo(-58384, 2);
    expect(`${l[2].jahr}-${l[2].monat}`).toBe("2025-3");
  });
});

describe("Zeitachse", () => {
  it("rechnet Jahr/Monat in einen laufenden Index um", () => {
    expect(monatsIndex(2025, 1, 2025)).toBe(1);
    expect(monatsIndex(2027, 12, 2025)).toBe(36);
  });
  it("grenzt Jahressummen richtig ab", () => {
    const r = leereReihe(); addiere(r, 1, 100); addiere(r, 13, 200); addiere(r, 25, 300);
    expect(summeReihe(r, 13, 24)).toBe(200);
  });
});
