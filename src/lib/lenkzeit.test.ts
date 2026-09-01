/**
 * Lenkzeitvergütung — die Regeln aus Christians Vorgabe vom 02.09.2026,
 * mit seinen eigenen Zahlen nachgerechnet.
 */
import { describe, it, expect } from "vitest";
import {
  istLenkzeitPflichtig, lenkzeitMinutenProTag, lenkzeitBetrag,
  lenkzeitText, lenkzeitJeMitarbeiter, LENKZEIT_SCHWELLE_MINUTEN,
} from "./lenkzeit";

describe("Schwelle 25 Minuten (eine Strecke)", () => {
  it("ab 25 min gibt es Vergütung, darunter nicht", () => {
    expect(LENKZEIT_SCHWELLE_MINUTEN).toBe(25);
    expect(istLenkzeitPflichtig(24)).toBe(false);   // „unter 25 min = normale Arbeitszeit"
    expect(istLenkzeitPflichtig(25)).toBe(true);    // „bei mindestens 25 min"
    expect(istLenkzeitPflichtig(50)).toBe(true);
    expect(istLenkzeitPflichtig(null)).toBe(false); // Projekt ohne Angabe
  });

  it("gerechnet wird Hin- UND Rückfahrt", () => {
    expect(lenkzeitMinutenProTag(25)).toBe(50);
    expect(lenkzeitMinutenProTag(40)).toBe(80);
    expect(lenkzeitMinutenProTag(20)).toBe(0);      // keine Sonderbuchung
  });
});

describe("Betrag je Buchung", () => {
  const saetze = { fahrer: 12, beifahrer: 8 };

  it("Fahrer bekommt mehr als der Beifahrer", () => {
    // 40 min eine Strecke → 80 min Lenkzeit
    const minuten = lenkzeitMinutenProTag(40);
    expect(lenkzeitBetrag(minuten, { istFahrer: true }, saetze)).toBe(16);      // 80/60 × 12
    expect(lenkzeitBetrag(minuten, { istBeifahrer: true }, saetze)).toBeCloseTo(10.67, 2);
  });

  it("ohne Häkchen und ohne Satz gibt es nichts", () => {
    expect(lenkzeitBetrag(80, {}, saetze)).toBe(0);
    expect(lenkzeitBetrag(80, { istFahrer: true }, { fahrer: 0, beifahrer: 0 })).toBe(0);
    expect(lenkzeitBetrag(0, { istFahrer: true }, saetze)).toBe(0);
  });

  it("beides angehakt: der Fahrer-Satz gewinnt", () => {
    expect(lenkzeitBetrag(60, { istFahrer: true, istBeifahrer: true }, saetze)).toBe(12);
  });
});

describe("Auswertung je Mitarbeiter (für die Lohnverrechnung)", () => {
  it("summiert Minuten getrennt und den Betrag korrekt", () => {
    const saetze = (uid: string) =>
      uid === "u1" ? { fahrer: 12, beifahrer: 8 } : { fahrer: 10, beifahrer: 6 };
    const summen = lenkzeitJeMitarbeiter([
      { userId: "u1", lenkzeitMinuten: 60, istFahrer: true },      // 12,00
      { userId: "u1", lenkzeitMinuten: 30, istFahrer: true },      //  6,00
      { userId: "u1", lenkzeitMinuten: 60, istBeifahrer: true },   //  8,00
      { userId: "u2", lenkzeitMinuten: 90, istBeifahrer: true },   //  9,00
      { userId: "u2", lenkzeitMinuten: 0, istFahrer: true },       // zählt nicht
    ], saetze);
    const u1 = summen.find((s) => s.userId === "u1")!;
    expect(u1.minutenFahrer).toBe(90);
    expect(u1.minutenBeifahrer).toBe(60);
    expect(u1.betrag).toBe(26);
    const u2 = summen.find((s) => s.userId === "u2")!;
    expect(u2.minutenBeifahrer).toBe(90);
    expect(u2.betrag).toBe(9);
  });

  it("zeigt Stunden lesbar an", () => {
    expect(lenkzeitText(50)).toBe("0:50 h");
    expect(lenkzeitText(80)).toBe("1:20 h");
    expect(lenkzeitText(0)).toBe("0:00 h");
  });
});
