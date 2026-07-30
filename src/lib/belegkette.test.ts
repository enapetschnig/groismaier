/**
 * Belegketten-Summen — bildet die bestätigten Befunde aus der
 * Mahnwesen-/Offene-Posten-Prüfung nach (Anzahlung doppelt gezählt,
 * Skonto blieb ewig offen, Gutschrift fehlte in den Summen).
 */
import { describe, it, expect } from "vitest";
import { kettenIndex, kettenSummen, offenerBetrag, type KettenBeleg } from "./belegkette";

const b = (p: Partial<KettenBeleg> & { id: string; typ: string }): KettenBeleg => ({
  status: "offen", netto_summe: 0, mwst_betrag: 0, brutto_summe: 0,
  bezahlt_betrag: 0, parent_invoice_id: null, ...p,
});

describe("Ketten-Gruppierung", () => {
  it("gruppiert AB, Anzahlung und Schlussrechnung unter einer Wurzel", () => {
    const belege = [
      b({ id: "ab", typ: "auftragsbestaetigung" }),
      b({ id: "ar", typ: "anzahlungsrechnung", parent_invoice_id: "ab" }),
      b({ id: "sr", typ: "schlussrechnung", parent_invoice_id: "ab" }),
      b({ id: "solo", typ: "rechnung" }),
    ];
    const gruppen = kettenIndex(belege);
    expect(gruppen.size).toBe(2);
    expect(gruppen.get("ab")?.map((x) => x.id)).toEqual(["ab", "ar", "sr"]);
    expect(gruppen.get("solo")?.map((x) => x.id)).toEqual(["solo"]);
  });

  it("gruppiert Geschwister auch, wenn der Elternbeleg NICHT mitgeladen ist", () => {
    // Offene Posten laden nur Rechnungstypen — die AB fehlt. Anzahlung und
    // Schlussrechnung zeigen auf dieselbe Eltern-ID und müssen trotzdem in
    // einer Kette landen (sonst greift die Netto-Deduplizierung nie).
    const gruppen = kettenIndex([
      b({ id: "ar", typ: "anzahlungsrechnung", parent_invoice_id: "ab-fehlt" }),
      b({ id: "sr", typ: "schlussrechnung", parent_invoice_id: "ab-fehlt" }),
    ]);
    expect(gruppen.size).toBe(1);
    expect(gruppen.get("ab-fehlt")?.map((x) => x.id)).toEqual(["ar", "sr"]);
  });

  it("Netto-Deduplizierung greift auch OHNE mitgeladene AB", () => {
    const s = kettenSummen([
      b({ id: "ar", typ: "anzahlungsrechnung", status: "bezahlt", parent_invoice_id: "ab-fehlt",
          netto_summe: 25000, mwst_betrag: 5000, brutto_summe: 30000, bezahlt_betrag: 30000 }),
      b({ id: "sr", typ: "schlussrechnung", parent_invoice_id: "ab-fehlt",
          netto_summe: 100000, mwst_betrag: 20000, brutto_summe: 90000 }),
    ]);
    expect(s.netto).toBe(100000);
    expect(s.offen).toBe(90000);
  });
});

describe("Ketten-Summen", () => {
  // Auftrag 100.000 netto: Anzahlung 30.000 (bezahlt), Schlussrechnung trägt
  // vollen Netto-Auftragswert, ihr Brutto ist der Restbetrag 90.000.
  const kette = [
    b({ id: "ab", typ: "auftragsbestaetigung", netto_summe: 100000 }),
    b({ id: "ar", typ: "anzahlungsrechnung", status: "bezahlt", parent_invoice_id: "ab",
        netto_summe: 25000, mwst_betrag: 5000, brutto_summe: 30000, bezahlt_betrag: 30000 }),
    b({ id: "sr", typ: "schlussrechnung", status: "offen", parent_invoice_id: "ab",
        netto_summe: 100000, mwst_betrag: 20000, brutto_summe: 90000, bezahlt_betrag: 0 }),
  ];

  it("zählt die Anzahlung bei netto/mwst NICHT doppelt (Audit-Befund)", () => {
    const s = kettenSummen(kette);
    expect(s.netto).toBe(100000);   // nicht 125.000
    expect(s.mwst).toBe(20000);     // nicht 25.000
  });

  it("brutto/bezahlt/offen laufen roh — die SR trägt den Abzug schon", () => {
    const s = kettenSummen(kette);
    expect(s.brutto).toBe(120000);  // 30.000 + 90.000 = voller Auftrag brutto
    expect(s.bezahlt).toBe(30000);
    expect(s.offen).toBe(90000);
  });

  it("Anzahlung OHNE Schlussrechnung zählt voll", () => {
    const s = kettenSummen(kette.filter((x) => x.id !== "sr"));
    expect(s.netto).toBe(25000);
    expect(s.offen).toBe(0);
  });

  it("stornierte Schlussrechnung reaktiviert die Anzahlung in netto", () => {
    const s = kettenSummen(kette.map((x) => (x.id === "sr" ? { ...x, status: "storniert" } : x)));
    expect(s.netto).toBe(25000);
    expect(s.offen).toBe(0);
  });

  it("Gutschriften mindern die Summen (Audit-Befund: fehlten ganz)", () => {
    const s = kettenSummen([
      b({ id: "re", typ: "rechnung", netto_summe: 10000, mwst_betrag: 2000, brutto_summe: 12000 }),
      b({ id: "gs", typ: "gutschrift", netto_summe: 1000, mwst_betrag: 200, brutto_summe: 1200 }),
    ]);
    expect(s.netto).toBe(9000);
    expect(s.brutto).toBe(10800);
  });

  it("AB und Lieferschein erzeugen keine Forderung", () => {
    const s = kettenSummen([
      b({ id: "ab", typ: "auftragsbestaetigung", netto_summe: 50000, brutto_summe: 60000 }),
      b({ id: "ls", typ: "lieferschein", parent_invoice_id: "ab" }),
    ]);
    expect(s.brutto).toBe(0);
    expect(s.offen).toBe(0);
  });
});

describe("Offener Betrag je Beleg", () => {
  it("Status bezahlt = ausgeglichen, auch mit Skonto (Audit-Befund)", () => {
    // 3 % Skonto: 12.000 brutto, 11.640 eingegangen, Status bezahlt.
    // Vorher blieben die 360 € ewig als „offen" stehen.
    expect(offenerBetrag(b({ id: "x", typ: "rechnung", status: "bezahlt",
      brutto_summe: 12000, bezahlt_betrag: 11640 }))).toBe(0);
  });

  it("teilbezahlt zeigt den Rest", () => {
    expect(offenerBetrag(b({ id: "x", typ: "rechnung", status: "teilbezahlt",
      brutto_summe: 12000, bezahlt_betrag: 5000 }))).toBe(7000);
  });

  it("Überzahlung wird nicht negativ", () => {
    expect(offenerBetrag(b({ id: "x", typ: "rechnung", brutto_summe: 100, bezahlt_betrag: 150 }))).toBe(0);
  });
});
