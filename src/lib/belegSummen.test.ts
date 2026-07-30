/**
 * Tests der Belegsummen — die Zahlen, die beim Kunden auf der Rechnung stehen.
 *
 * Mehrere Fälle bilden echte Fehler nach, die im Gesamtaudit gefunden wurden;
 * sie stehen hier, damit sie nicht wiederkommen.
 */
import { describe, it, expect } from "vitest";
import {
  belegSummen, zeilenBetrag, berechneZeilenpreis, istDetailzeile,
  type BelegPosition,
} from "./belegSummen";

const pos = (p: Partial<BelegPosition>): BelegPosition => ({
  menge: 1, einzelpreis: 0, rabatt_prozent: 0, gesamtpreis: null, ...p,
});

describe("Zeilenpreis", () => {
  it("Menge × Einzelpreis", () => {
    expect(berechneZeilenpreis(3, 250)).toBe(750);
  });
  it("mit Zeilenrabatt", () => {
    expect(berechneZeilenpreis(10, 100, 10)).toBe(900);
  });
  it("rundet kaufmännisch auf zwei Stellen", () => {
    expect(berechneZeilenpreis(3, 33.333)).toBe(100);
    expect(berechneZeilenpreis(1, 0.005)).toBe(0.01);
  });
  it("Menge 0 ergibt 0, nicht NaN", () => {
    expect(berechneZeilenpreis(0, 100)).toBe(0);
    expect(berechneZeilenpreis(null, null)).toBe(0);
  });
});

describe("Aufbau-Gruppen", () => {
  const sammel = pos({ gruppe: "Aufbau 1", ist_gruppensumme: true, menge: 1, einzelpreis: 19305, gesamtpreis: 19305 });
  const detail = pos({ gruppe: "Aufbau 1", menge: 270, einzelpreis: 71.5, gesamtpreis: 0 });

  it("erkennt Detailzeilen", () => {
    expect(istDetailzeile(detail)).toBe(true);
    expect(istDetailzeile(sammel)).toBe(false);
    expect(istDetailzeile(pos({ menge: 1, einzelpreis: 10 }))).toBe(false);
  });

  it("Detailzeile geht mit 0 in die Summe, egal was Menge × Preis ergäbe", () => {
    // 270 × 71,50 = 19.305 — genau dieser Betrag steckt schon in der Sammelzeile.
    expect(zeilenBetrag(detail)).toBe(0);
  });

  it("Aufbau zählt EINMAL — der Fehler mit der doppelten Rechnungssumme", () => {
    // Echter Fall aus Angebot AN26052: zwei Aufbauten à 19.305 €, je fünf
    // Detailzeilen. Gedruckt wurden einmal 92.664 € statt 46.332 €.
    const items = [
      sammel, detail, detail, detail, detail, detail,
      { ...sammel, gruppe: "Aufbau 2" }, { ...detail, gruppe: "Aufbau 2" },
      { ...detail, gruppe: "Aufbau 2" }, { ...detail, gruppe: "Aufbau 2" },
      { ...detail, gruppe: "Aufbau 2" }, { ...detail, gruppe: "Aufbau 2" },
    ];
    const s = belegSummen(items, { mwst_satz: 20 });
    expect(s.nettoSumme).toBeCloseTo(38610, 2);
    expect(s.bruttoSumme).toBeCloseTo(46332, 2);
  });

  it("verliert eine Zeile ihre Gruppe, darf die Summe NICHT explodieren", () => {
    // Beim Import aus dem Angebot gingen gruppe/ist_gruppensumme verloren.
    // Der gespeicherte gesamtpreis (0) rettet die Summe trotzdem.
    const ohneGruppe = { ...detail, gruppe: null, ist_gruppensumme: false };
    expect(zeilenBetrag(ohneGruppe)).toBe(0);
  });
});

describe("Kopfrabatt", () => {
  const items = [pos({ menge: 1, einzelpreis: 100000, gesamtpreis: 100000 })];

  it("Prozentrabatt auf die Positionssumme", () => {
    const s = belegSummen(items, { mwst_satz: 20, rabatt_prozent: 10 });
    expect(s.rabattWert).toBe(10000);
    expect(s.nettoSumme).toBe(90000);
    expect(s.mwstBetrag).toBe(18000);
    expect(s.bruttoSumme).toBe(108000);
  });

  it("Betragsrabatt, wenn kein Prozentsatz gesetzt ist", () => {
    const s = belegSummen(items, { mwst_satz: 20, rabatt_betrag: 2500 });
    expect(s.nettoSumme).toBe(97500);
  });

  it("Prozentsatz hat Vorrang vor dem Betrag", () => {
    const s = belegSummen(items, { mwst_satz: 20, rabatt_prozent: 10, rabatt_betrag: 2500 });
    expect(s.rabattWert).toBe(10000);
  });

  it("negativer Rabatt wirkt als Aufschlag", () => {
    const s = belegSummen(items, { mwst_satz: 20, rabatt_betrag: -5000 });
    expect(s.nettoSumme).toBe(105000);
  });
});

describe("Umsatzsteuer", () => {
  const items = [pos({ menge: 1, einzelpreis: 1000, gesamtpreis: 1000 })];

  it.each([[0, 0], [10, 100], [13, 130], [20, 200]])(
    "Satz %i %% ergibt %i € USt", (satz, ust) => {
      const s = belegSummen(items, { mwst_satz: satz });
      expect(s.mwstBetrag).toBe(ust);
      expect(s.bruttoSumme).toBe(1000 + ust);
    });

  it("Reverse Charge: keine USt, Rechnungsbetrag = Netto", () => {
    const s = belegSummen(items, { mwst_satz: 20, reverse_charge: true });
    expect(s.mwstBetrag).toBe(0);
    expect(s.bruttoSumme).toBe(1000);
  });

  it("steuerfreier Beleg bleibt steuerfrei (0 % darf nicht zu 20 % werden)", () => {
    const s = belegSummen(items, { mwst_satz: 0 });
    expect(s.mwstBetrag).toBe(0);
    expect(s.bruttoSumme).toBe(1000);
  });
});

describe("Anzahlungs-Abzug auf der Schlussrechnung", () => {
  // Auftrag 100.000 netto, Anzahlung 30 % = 30.000 netto / 36.000 brutto.
  const leistung = pos({ menge: 1, einzelpreis: 100000, gesamtpreis: 100000 });
  const abzug = pos({ menge: 1, einzelpreis: -36000, gesamtpreis: -36000, mwst_exempt: true });

  it("Abzug ist brutto und wird nach der USt verrechnet", () => {
    const s = belegSummen([leistung, abzug], { mwst_satz: 20 });
    expect(s.positionenNetto).toBe(100000);
    expect(s.mwstBetrag).toBe(20000);
    expect(s.exemptBrutto).toBe(-36000);
    // 100.000 + 20.000 USt − 36.000 bereits gezahlt = 84.000
    expect(s.bruttoSumme).toBe(84000);
  });

  it("die Anzahlung wird nicht ein zweites Mal versteuert", () => {
    const s = belegSummen([leistung, abzug], { mwst_satz: 20 });
    expect(s.mwstBetrag).toBe(20000); // nicht 20 % von 64.000
  });

  it("mit Reverse Charge bleibt der Abzug erhalten", () => {
    const s = belegSummen([leistung, abzug], { mwst_satz: 20, reverse_charge: true });
    expect(s.mwstBetrag).toBe(0);
    expect(s.bruttoSumme).toBe(64000);
  });

  it("zwei Anzahlungen werden beide abgezogen", () => {
    const s = belegSummen([leistung, abzug, { ...abzug, gesamtpreis: -12000 }], { mwst_satz: 20 });
    expect(s.bruttoSumme).toBe(72000);
  });
});

describe("Randfälle", () => {
  it("leerer Beleg ergibt lauter Nullen", () => {
    const s = belegSummen([], { mwst_satz: 20 });
    expect(s.nettoSumme).toBe(0);
    expect(s.bruttoSumme).toBe(0);
  });

  it("Positionen ohne gespeicherten Betrag werden nachgerechnet", () => {
    const s = belegSummen([pos({ menge: 2.5, einzelpreis: 40 })], { mwst_satz: 20 });
    expect(s.nettoSumme).toBe(100);
  });

  it("Rundung: viele Kleinbeträge laufen nicht auseinander", () => {
    const items = Array.from({ length: 100 }, () => pos({ menge: 1, einzelpreis: 0.01, gesamtpreis: 0.01 }));
    const s = belegSummen(items, { mwst_satz: 20 });
    expect(s.nettoSumme).toBe(1);
    expect(s.bruttoSumme).toBe(1.2);
  });

  it("Gutschrift: durchgehend negative Beträge", () => {
    const s = belegSummen([pos({ menge: 1, einzelpreis: -500, gesamtpreis: -500 })], { mwst_satz: 20 });
    expect(s.nettoSumme).toBe(-500);
    expect(s.bruttoSumme).toBe(-600);
  });
});
