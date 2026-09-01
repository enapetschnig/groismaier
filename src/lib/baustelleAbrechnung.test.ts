/**
 * Regeln der Baustellen-Abrechnung — die Stellen, an denen ein Fehler den
 * Kunden Geld kostet: Doppelverrechnung und Komma-Mengen.
 *
 * Die Auswahl-Logik ist bewusst hier als reine Funktionen nachgebaut und
 * gespiegelt zu BaustelleAbrechnenDialog.tsx (der Dialog selbst redet mit
 * Supabase und ist im Test nicht sinnvoll instanziierbar).
 */
import { describe, it, expect } from "vitest";
import { parseDecimal } from "./num";
import { verteileEingangsrechnung } from "./nachkalkulation";

/** Stunden zählen NUR im Regie-Block, wenn sie an einem Bericht hängen. */
const freieZeiten = (zeiten: { stunden: number; disturbance_id: string | null }[]) =>
  zeiten.filter((z) => !z.disturbance_id);

/** Materialbuchungen eines Regieberichts stehen schon im Regie-Block. */
const freieMaterialien = (m: { menge: string; disturbance_id: string | null }[]) =>
  m.filter((x) => !x.disturbance_id);

describe("Baustelle abrechnen — keine Doppelverrechnung", () => {
  it("Stunden aus Regieberichten erscheinen nicht zusätzlich im Zeit-Block", () => {
    const zeiten = [
      { stunden: 8, disturbance_id: "regie-1" },   // steckt im Regiebericht
      { stunden: 6, disturbance_id: "regie-1" },   // zweiter Mitarbeiter
      { stunden: 4.5, disturbance_id: null },      // normale Projektstunde
    ];
    const frei = freieZeiten(zeiten);
    expect(frei).toHaveLength(1);
    expect(frei.reduce((s, z) => s + z.stunden, 0)).toBe(4.5);
    // Gegenprobe: die Regie-Stunden sind nicht verloren, sie zählen dort
    expect(zeiten.reduce((s, z) => s + z.stunden, 0)).toBe(18.5);
  });

  it("Material eines Regieberichts steht nicht zusätzlich im Material-Block", () => {
    const buchungen = [
      { menge: "5", disturbance_id: "regie-1" },
      { menge: "2,5", disturbance_id: null },
    ];
    expect(freieMaterialien(buchungen)).toHaveLength(1);
  });

  it("Mengen mit österreichischem Komma werden nicht abgeschnitten", () => {
    // parseFloat("2,5") ergäbe 2 — das wären 20 % zu wenig auf der Rechnung.
    expect(parseDecimal("2,5")).toBe(2.5);
    expect(parseDecimal("12,75")).toBe(12.75);
    expect(parseDecimal("3")).toBe(3);
    expect(parseDecimal("")).toBeNull();
  });

  it("Regie-Stunden rechnen Stunden × Mitarbeiter", () => {
    const bericht = { stunden: 8, mitarbeiter: 3 };
    expect(bericht.stunden * Math.max(1, bericht.mitarbeiter)).toBe(24);
    // Alte Berichte ohne Mitarbeiter-Zeilen zählen einfach
    expect(8 * Math.max(1, 0)).toBe(8);
  });

  it("Anzahlungsabzug ist negativ und steuerfrei", () => {
    const anzahlung = { brutto: 12000 };
    const zeile = { einzelpreis: -anzahlung.brutto, menge: 1, mwst_exempt: true };
    expect(zeile.einzelpreis).toBeLessThan(0);
    expect(zeile.mwst_exempt).toBe(true);
    // Schlussrechnung: Auftrag 30.000 minus Anzahlung 12.000 brutto
    expect(30000 + zeile.menge * zeile.einzelpreis).toBe(18000);
  });
});

describe("Zukauf aus Eingangsrechnungen", () => {
  it("nimmt NUR den Anteil dieses Projekts — Lager bleibt draußen", () => {
    const rechnung = { id: "e1", project_id: "p1", betrag_netto: 5000, status: "offen" } as any;
    const zuordnungen = [
      { project_id: "p1", purchase_invoice_id: "e1", betrag_netto: 3000, beschreibung: "Holz BV Knapp" },
      { project_id: null, purchase_invoice_id: "e1", betrag_netto: 1200, ziel: "lager" },
    ] as any;
    const anteile = verteileEingangsrechnung(rechnung, zuordnungen);
    const fuerProjekt = anteile.filter((a) => a.project_id === "p1").reduce((s, a) => s + a.betrag, 0);
    // 3.000 zugeordnet + 800 Rest am Kopfprojekt; die 1.200 Lager NICHT
    expect(fuerProjekt).toBe(3800);
    expect(anteile.some((a) => a.betrag === 1200)).toBe(false);
  });

  it("abgelehnte Eingangsrechnungen zählen nie", () => {
    const abgelehnt = { id: "e2", project_id: "p1", betrag_netto: 999, status: "abgelehnt" } as any;
    expect(verteileEingangsrechnung(abgelehnt, [])).toEqual([]);
  });

  it("Aufschlag rechnet Einkauf auf Verkauf hoch", () => {
    const ek = 3800;
    const mitAufschlag = (v: number, prozent: number) => Math.round(v * (1 + prozent / 100) * 100) / 100;
    expect(mitAufschlag(ek, 0)).toBe(3800);
    expect(mitAufschlag(ek, 15)).toBe(4370);
    expect(mitAufschlag(ek, 35)).toBe(5130);
  });
});

describe("Verrechnetes bleibt sichtbar, aber abgewählt (01.09.2026)", () => {
  /** Vorauswahl-Regel des Dialogs, hier als reine Funktion gespiegelt. */
  const vorgewaehlt = (p: { erledigt?: boolean }) => !p.erledigt;

  it("bereits verrechnete Zeilen werden gezeigt, aber nicht angehakt", () => {
    const zeilen = [
      { id: "a", erledigt: false },
      { id: "b", erledigt: true },   // steht schon auf R-2026-041
    ];
    // Beide sichtbar — nichts wird versteckt
    expect(zeilen).toHaveLength(2);
    expect(zeilen.filter(vorgewaehlt).map((z) => z.id)).toEqual(["a"]);
  });

  it("Arbeitszeiten trennen offen und verrechnet je Mitarbeiter", () => {
    const zeiten = [
      { user_id: "u1", stunden: 8, verrechnet_in_invoice_id: null },
      { user_id: "u1", stunden: 4, verrechnet_in_invoice_id: null },
      { user_id: "u1", stunden: 6, verrechnet_in_invoice_id: "r1" },
    ];
    const gruppen = new Map<string, number>();
    for (const z of zeiten) {
      const key = `${z.user_id}|${z.verrechnet_in_invoice_id || ""}`;
      gruppen.set(key, (gruppen.get(key) || 0) + z.stunden);
    }
    // Zwei Zeilen: 12 h offen, 6 h verrechnet — keine vermischte Summe
    expect(gruppen.get("u1|")).toBe(12);
    expect(gruppen.get("u1|r1")).toBe(6);
  });

  it("Abzug: Anzahlungen vorgewählt, sonstige Rechnungen nicht", () => {
    const belege = [
      { typ: "anzahlungsrechnung", brutto: 12000 },
      { typ: "rechnung", brutto: 5000 },
    ];
    const zeilen = belege.map((b) => ({
      einzelpreis: -b.brutto,
      erledigt: b.typ !== "anzahlungsrechnung",
    }));
    expect(zeilen.filter(vorgewaehlt)).toHaveLength(1);
    expect(zeilen.filter(vorgewaehlt)[0].einzelpreis).toBe(-12000);
  });
});
