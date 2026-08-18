/**
 * Tests der Nachkalkulation — Soll-Auftragswert und verrechneter Erlös.
 * Beide Fälle bilden bestätigte Fehler aus dem Gesamtaudit nach.
 */
import { describe, it, expect } from "vitest";
import {
  waehleSollBelege, berechneVerrechnet, bereitsInSchlussrechnung,
  verteileEingangsrechnung, fremdkostenJeProjekt, type NkBeleg,
} from "./nachkalkulation";

const b = (p: Partial<NkBeleg> & { typ: string; status: string }): NkBeleg => ({
  id: Math.random().toString(36).slice(2), netto_summe: 0, parent_invoice_id: null, ...p,
});

describe("Soll-Auftragswert", () => {
  it("Auftragsbestätigung hat Vorrang vor dem Angebot", () => {
    const belege = [
      b({ id: "ang", typ: "angebot", status: "angenommen", netto_summe: 100000 }),
      b({ id: "ab", typ: "auftragsbestaetigung", status: "offen", netto_summe: 95000 }),
    ];
    const soll = waehleSollBelege(belege);
    expect(soll.map(x => x.id)).toEqual(["ab"]);
  });

  it("Angebot zählt weiter, NACHDEM daraus eine Rechnung wurde", () => {
    // Der Kernfehler: Beim Verrechnen wechselt der Status auf "verrechnet".
    // Vorher fiel damit das ganze Soll weg — Auftragswert 0, Marge unendlich.
    const belege = [b({ id: "ang", typ: "angebot", status: "verrechnet", netto_summe: 100000 })];
    expect(waehleSollBelege(belege)).toHaveLength(1);
  });

  it("angenommen, bezahlt und teilbezahlt zählen ebenfalls", () => {
    for (const status of ["angenommen", "bezahlt", "teilbezahlt"]) {
      expect(waehleSollBelege([b({ typ: "angebot", status, netto_summe: 1 })])).toHaveLength(1);
    }
  });

  it("abgelehnte, stornierte und Entwurfs-Angebote zählen nicht", () => {
    for (const status of ["abgelehnt", "storniert", "entwurf", "gesendet"]) {
      expect(waehleSollBelege([b({ typ: "angebot", status, netto_summe: 1 })])).toHaveLength(0);
    }
  });

  it("stornierte Auftragsbestätigung fällt zurück auf das Angebot", () => {
    const belege = [
      b({ id: "ang", typ: "angebot", status: "angenommen", netto_summe: 100000 }),
      b({ id: "ab", typ: "auftragsbestaetigung", status: "storniert", netto_summe: 95000 }),
    ];
    expect(waehleSollBelege(belege).map(x => x.id)).toEqual(["ang"]);
  });
});

describe("Verrechneter Erlös", () => {
  it("Anzahlung und Schlussrechnung derselben Kette zählen EINMAL", () => {
    // Auftrag 100.000. Anzahlung 30.000, Schlussrechnung führt den Abzug als
    // steuerbefreite Bruttozeile — ihre netto_summe ist der volle Auftragswert.
    const belege = [
      b({ id: "ab", typ: "auftragsbestaetigung", status: "offen", netto_summe: 100000 }),
      b({ id: "ar", typ: "anzahlungsrechnung", status: "bezahlt", netto_summe: 30000, parent_invoice_id: "ab" }),
      b({ id: "sr", typ: "schlussrechnung", status: "offen", netto_summe: 100000, parent_invoice_id: "ab" }),
    ];
    expect(bereitsInSchlussrechnung(belege).has("ar")).toBe(true);
    expect(berechneVerrechnet(belege).summe).toBe(100000);   // nicht 130.000
  });

  it("Anzahlung ohne Schlussrechnung zählt voll", () => {
    const belege = [
      b({ id: "ab", typ: "auftragsbestaetigung", status: "offen", netto_summe: 100000 }),
      b({ id: "ar", typ: "anzahlungsrechnung", status: "bezahlt", netto_summe: 30000, parent_invoice_id: "ab" }),
    ];
    expect(berechneVerrechnet(belege).summe).toBe(30000);
  });

  it("zwei Anzahlungen und eine Schlussrechnung ergeben den Auftragswert", () => {
    const belege = [
      b({ id: "ab", typ: "auftragsbestaetigung", status: "offen", netto_summe: 100000 }),
      b({ id: "a1", typ: "anzahlungsrechnung", status: "bezahlt", netto_summe: 30000, parent_invoice_id: "ab" }),
      b({ id: "a2", typ: "anzahlungsrechnung", status: "bezahlt", netto_summe: 20000, parent_invoice_id: "ab" }),
      b({ id: "sr", typ: "schlussrechnung", status: "offen", netto_summe: 100000, parent_invoice_id: "ab" }),
    ];
    expect(berechneVerrechnet(belege).summe).toBe(100000);
  });

  it("Anzahlung einer ANDEREN Kette bleibt bestehen", () => {
    const belege = [
      b({ id: "a1", typ: "anzahlungsrechnung", status: "bezahlt", netto_summe: 30000, parent_invoice_id: "ab1" }),
      b({ id: "sr", typ: "schlussrechnung", status: "offen", netto_summe: 50000, parent_invoice_id: "ab2" }),
    ];
    expect(berechneVerrechnet(belege).summe).toBe(80000);
  });

  it("Gutschriften mindern den Erlös", () => {
    const belege = [
      b({ typ: "rechnung", status: "bezahlt", netto_summe: 10000 }),
      b({ typ: "gutschrift", status: "offen", netto_summe: 1500 }),
    ];
    expect(berechneVerrechnet(belege).summe).toBe(8500);
  });

  it("stornierte Belege zählen nicht", () => {
    const belege = [
      b({ typ: "rechnung", status: "bezahlt", netto_summe: 10000 }),
      b({ typ: "rechnung", status: "storniert", netto_summe: 5000 }),
    ];
    expect(berechneVerrechnet(belege).summe).toBe(10000);
  });

  it("Angebote und Lieferscheine sind kein Erlös", () => {
    const belege = [
      b({ typ: "angebot", status: "angenommen", netto_summe: 100000 }),
      b({ typ: "lieferschein", status: "offen", netto_summe: 0 }),
      b({ typ: "rechnung", status: "offen", netto_summe: 7000 }),
    ];
    expect(berechneVerrechnet(belege).summe).toBe(7000);
  });

  it("Zeitraumfilter wirkt auf die gezählten Belege", () => {
    const belege = [
      b({ typ: "rechnung", status: "bezahlt", netto_summe: 1000, datum: "2026-01-15" }),
      b({ typ: "rechnung", status: "bezahlt", netto_summe: 2000, datum: "2026-05-15" }),
    ];
    const r = berechneVerrechnet(belege, (x) => (x.datum || "") >= "2026-04-01");
    expect(r.summe).toBe(2000);
    expect(r.gezaehlt).toHaveLength(1);
  });
});

describe("Eingangsrechnungen auf Projekte verteilen", () => {
  const r = { id: "er1", project_id: "P1", status: "offen", betrag_netto: 5000 };

  it("ohne Zuordnung zählt alles zum Projekt der Rechnung", () => {
    const a = verteileEingangsrechnung(r, []);
    expect(a).toEqual([{ project_id: "P1", betrag: 5000, istAnteil: false }]);
  });

  it("ein Teilbetrag lässt den REST beim Hauptprojekt (Audit-Befund)", () => {
    // Früher fiel der Kopfbetrag komplett weg — 4.500 € verschwanden.
    const a = verteileEingangsrechnung(r, [
      { purchase_invoice_id: "er1", project_id: "P2", betrag_netto: 500 },
    ]);
    expect(a.reduce((s, x) => s + x.betrag, 0)).toBe(5000);
    expect(a.find(x => x.project_id === "P2")?.betrag).toBe(500);
    expect(a.find(x => x.project_id === "P1")?.betrag).toBe(4500);
  });

  it("vollständig zugeordnet: kein Restbetrag", () => {
    const a = verteileEingangsrechnung(r, [
      { purchase_invoice_id: "er1", project_id: "P2", betrag_netto: 2000 },
      { purchase_invoice_id: "er1", project_id: "P3", betrag_netto: 3000 },
    ]);
    expect(a).toHaveLength(2);
    expect(a.reduce((s, x) => s + x.betrag, 0)).toBe(5000);
  });

  it("negative Zeilen (Retouren) bleiben erhalten und mindern ihr Projekt", () => {
    const a = verteileEingangsrechnung(
      { id: "er2", project_id: "P1", status: "offen", betrag_netto: 4500 },
      [
        { purchase_invoice_id: "er2", project_id: "P2", betrag_netto: 5000 },
        { purchase_invoice_id: "er2", project_id: "P2", betrag_netto: -500 },
      ]);
    expect(a.filter(x => x.project_id === "P2").reduce((s, x) => s + x.betrag, 0)).toBe(4500);
    expect(a.reduce((s, x) => s + x.betrag, 0)).toBe(4500);
  });

  it("abgelehnte Rechnungen zählen nirgends", () => {
    expect(verteileEingangsrechnung({ ...r, status: "abgelehnt" }, [])).toHaveLength(0);
  });

  it("Rechnung ohne Projekt und ohne Zuordnung verschwindet nicht in ein falsches Projekt", () => {
    expect(verteileEingangsrechnung({ id: "x", project_id: null, status: "offen", betrag_netto: 900 }, [])).toHaveLength(0);
  });

  it("Fremdkosten je Projekt summieren über mehrere Rechnungen", () => {
    const m = fremdkostenJeProjekt(
      [r, { id: "er3", project_id: "P2", status: "offen", betrag_netto: 1200 }],
      [{ purchase_invoice_id: "er1", project_id: "P2", betrag_netto: 500 }]);
    expect(m.get("P1")).toBe(4500);
    expect(m.get("P2")).toBe(1700);
  });

  // Kundenwunsch 08/2026: Teilbeträge können aufs LAGER gebucht werden.
  it("Lager-Teilbeträge zählen zu keinem Projekt, mindern aber den Rest", () => {
    const a = verteileEingangsrechnung(r, [
      { purchase_invoice_id: "er1", project_id: "P2", betrag_netto: 500, ziel: "projekt" },
      { purchase_invoice_id: "er1", project_id: null, betrag_netto: 1500, ziel: "lager" },
    ]);
    expect(a.find(x => x.project_id === "P2")?.betrag).toBe(500);
    // Rest beim Hauptprojekt: 5000 − 500 − 1500 (Lager) = 3000
    expect(a.find(x => x.project_id === "P1")?.betrag).toBe(3000);
    expect(a.reduce((s, x) => s + x.betrag, 0)).toBe(3500);
  });

  it("Rechnung komplett aufs Lager (kein Projekt) taucht in keinem Projekt auf", () => {
    const a = verteileEingangsrechnung(
      { id: "er4", project_id: null, status: "offen", betrag_netto: 800 },
      [{ purchase_invoice_id: "er4", project_id: null, betrag_netto: 300, ziel: "lager" }]);
    expect(a).toHaveLength(0);
  });
});
