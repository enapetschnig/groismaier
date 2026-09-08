// ============================================================================
// Der ganze Weg: Kalkulation → Angebot → „Positionen neu übernehmen".
// Kundenmeldung 08.09.2026: Nach dem Neu-Übernehmen zählte die INFOPOSITION
// wieder in die Angebotssumme. Dieser Test hält beide Wege deckungsgleich.
// ============================================================================
import { describe, it, expect } from "vitest";
import { belegzeileAusKalk, istInfoTextOhneKennzeichen, type KalkZeile } from "./kalkZuBeleg";
import { buildAngebotItems, calcProjekt, newEmptyState, newMaterialRow, newModule, DEFAULT_BETRIEBSDATEN, round2 } from "./kalkulationEngine";
import { belegSummen } from "./belegSummen";

/** Kalkulation wie bei Christian: ein normaler Aufbau + eine optionale Variante. */
function kalkulation() {
  const st = newEmptyState();
  const normal = newModule(1);
  normal.name = "Innenwand - 100 mm"; normal.area = 101;
  normal.materialRows = [{ ...newMaterialRow(), category: "Platten", product: "OSB", ekPrice: 10, vkPrice: 13.5 }];
  const optional = newModule(2);
  optional.name = "Innenwand - 100 mm (Kopie)"; optional.area = 101; optional.isOptional = true;
  optional.materialRows = [{ ...newMaterialRow(), category: "Platten", product: "OSB", ekPrice: 12, vkPrice: 16.2 }];
  st.modules = [normal, optional];
  return st;
}

describe("Kalkulation → Beleg: Infoposition überlebt jeden Weg", () => {
  const projekt = calcProjekt(kalkulation(), DEFAULT_BETRIEBSDATEN);
  const { items } = buildAngebotItems(projekt);

  it("die Kalkulation kennzeichnet den optionalen Aufbau", () => {
    const info = items.find((i) => i.ist_gruppensumme && i.ist_info);
    expect(info).toBeDefined();
    expect(info!.beschreibung).toContain("INFOPOSITION:");
    expect(info!.gesamtpreis).toBeGreaterThan(0);
  });

  it("Weg 1 und Weg 2 erzeugen dieselbe Zeile — inklusive ist_info", () => {
    const zeilen = items.map((n, i) => belegzeileAusKalk(n as KalkZeile, i + 1));
    const info = zeilen.find((z) => z.beschreibung.includes("INFOPOSITION:"))!;
    expect(info.ist_info).toBe(true);
    // Neu-Übernehmen mit erhaltener Sichtbarkeits-Vorgabe: ist_info bleibt.
    const nochmal = items.map((n, i) => belegzeileAusKalk(n as KalkZeile, i + 1, true));
    const infoNochmal = nochmal.find((z) => z.beschreibung.includes("INFOPOSITION:"))!;
    expect(infoNochmal.ist_info).toBe(true);
    // Alle Kennzeichen gleich, nur die Sichtbarkeit darf abweichen.
    for (const [a, b] of zeilen.map((z, i) => [z, nochmal[i]] as const)) {
      expect({ ...a, auf_pdf: null }).toEqual({ ...b, auf_pdf: null });
    }
  });

  it("die Infoposition zählt NICHT in die Belegsumme", () => {
    const zeilen = items.map((n, i) => belegzeileAusKalk(n as KalkZeile, i + 1));
    const summen = belegSummen(zeilen as any, { mwst_satz: 20 } as any);
    const info = zeilen.find((z) => z.ist_info)!;
    const ohneInfo = round2(zeilen.filter((z) => !z.ist_info && z.ist_gruppensumme).reduce((s, z) => s + z.gesamtpreis, 0));
    expect(summen.nettoSumme).toBeCloseTo(ohneInfo, 2);
    // Gegenprobe: ohne Kennzeichen wäre der Betrag drin — genau der Fehler.
    const kaputt = zeilen.map((z) => ({ ...z, ist_info: false }));
    const summenKaputt = belegSummen(kaputt as any, { mwst_satz: 20 } as any);
    expect(summenKaputt.nettoSumme - summen.nettoSumme).toBeCloseTo(info.gesamtpreis, 2);
    // Der Betrag bleibt an der Zeile stehen (er wird nur nicht addiert).
    expect(info.gesamtpreis).toBeGreaterThan(0);
  });

  it("Altbestand wird erkannt: INFOPOSITION im Text, aber Kennzeichen fehlt", () => {
    expect(istInfoTextOhneKennzeichen({ beschreibung: "INFOPOSITION: Flachdach", ist_info: false })).toBe(true);
    expect(istInfoTextOhneKennzeichen({ beschreibung: "INFOPOSITION: Flachdach", ist_info: true })).toBe(false);
    expect(istInfoTextOhneKennzeichen({ beschreibung: "Flachdach", ist_info: false })).toBe(false);
    expect(istInfoTextOhneKennzeichen({ beschreibung: null })).toBe(false);
  });
});
