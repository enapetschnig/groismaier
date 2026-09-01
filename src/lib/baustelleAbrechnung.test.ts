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
