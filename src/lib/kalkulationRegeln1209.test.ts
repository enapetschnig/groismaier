// Die vier Kalkulations-Meldungen vom 11./12.09.2026 als Tests:
//  1. Angebotssumme = ohne optionale Aufbauten (Meldung: 147.526 vs. 131.000)
//  2. Riegel-Zeile nimmt den kalkulierten Katalog-VK (Meldung: KVH-VK erscheint nicht)
//  3. Dämmstoff mit „Preis gilt je m²" wird nicht mit der Dämmstärke umgerechnet
//  4. Arbeitsgänge ersetzen Arbeiter × Tage — Lohn, Stunden und Selbstkosten
import { describe, it, expect } from "vitest";
import {
  DEFAULT_BETRIEBSDATEN, type Betriebsdaten, newModule, newMaterialRow, num,
  calcModule, calcMaterialRow, calcVerdienst, calcProjekt, normalizeKalkulationState,
  riegelVkRoh, zeilenVkRoh, arbeitsgangStunden, nutztArbeitsgaenge, buildAngebotItems,
} from "./kalkulationEngine";

const bd: Betriebsdaten = { ...DEFAULT_BETRIEBSDATEN };

describe("1. Angebotssumme ohne optionale Aufbauten", () => {
  it("trennt gesamt, optional und ohne optional", () => {
    const normal = { ...newModule(1), name: "Wand", area: 10, workers: 2, days: 1 };
    const opt = { ...newModule(2), name: "Terrasse", area: 10, workers: 1, days: 1, isOptional: true };
    const state = normalizeKalkulationState({ modules: [normal, opt] });
    const p = calcProjekt(state, bd);
    expect(p.optional.gesamtAdj).toBeGreaterThan(0);
    expect(p.ohneOptional.gesamtAdj).toBeCloseTo(p.totalGesamt - p.optional.gesamtAdj, 6);
    // Im Angebot ist der optionale Aufbau eine Infoposition (ist_info) — die
    // Summe der zählenden Sammelzeilen ist die Angebotssumme ohne optional.
    const { items } = buildAngebotItems(p);
    const zaehlend = items.filter((it) => it.ist_gruppensumme && !it.ist_info).reduce((s, it) => s + num(it.gesamtpreis), 0);
    const info = items.filter((it) => it.ist_gruppensumme && it.ist_info).reduce((s, it) => s + num(it.gesamtpreis), 0);
    expect(zaehlend).toBeCloseTo(p.ohneOptional.gesamtAdj, 2);
    expect(info).toBeCloseTo(p.optional.gesamtAdj, 2);
  });
});

describe("2. Riegel-Zeile: kalkulierter Katalog-VK zählt", () => {
  const riegel = () => ({ ...newMaterialRow(), category: "KVH", product: "Riegelkonstruktion 6/", ekPrice: 25, katalogEk: 25 });

  it("ohne eigenen VK: Ableitung aus dem EK (wie bisher)", () => {
    expect(riegelVkRoh({ ...riegel(), vkPrice: 0 })).toBe(0);
    expect(zeilenVkRoh({ ...riegel(), vkPrice: 0 }, bd)).toBe(0);
  });
  it("von Hand gesetzter VK zählt", () => {
    expect(riegelVkRoh({ ...riegel(), vkPrice: 40, vkManuell: true })).toBe(40);
  });
  it("kalkulierter Katalog-VK (Rechner-Ergebnis) zählt", () => {
    expect(riegelVkRoh({ ...riegel(), vkPrice: 40, katalogVk: 40, vkKalkuliert: true })).toBe(40);
  });
  it("ein NICHT kalkulierter Katalog-VK zählt weiterhin nicht — Regel vom 24.08. bleibt", () => {
    expect(riegelVkRoh({ ...riegel(), vkPrice: 530, katalogVk: 530 })).toBe(0);
    expect(riegelVkRoh({ ...riegel(), vkPrice: 530, katalogVk: 530, vkKalkuliert: false })).toBe(0);
  });
  it("ein kalkulierter, aber veralteter Zeilen-VK zählt nicht", () => {
    expect(riegelVkRoh({ ...riegel(), vkPrice: 33.75, katalogVk: 40, vkKalkuliert: true })).toBe(0);
    expect(riegelVkRoh({ ...riegel(), vkPrice: 33.75, katalogVk: null, vkKalkuliert: true })).toBe(0);
  });
  it("die Zeile rechnet mit dem kalkulierten Katalog-VK statt EK × Faktor", () => {
    const m = { area: 100, wallHeight: 0, insulationThickness: 28, aufbauKategorie: "Wand" as const };
    const ausEk = calcMaterialRow({ ...riegel(), vkPrice: 0 }, m, bd);
    const ausKatalog = calcMaterialRow({ ...riegel(), vkPrice: 40, katalogVk: 40, vkKalkuliert: true }, m, bd);
    expect(ausKatalog.vkProM2).toBeGreaterThan(ausEk.vkProM2);
    // 3,5 lfm/m² × 0,06 × 0,28 × 40 = 2,352 €/m² (Betriebsdaten-Standard)
    const erwartet = bd.riegelLfmProM2 * (bd.riegelBrettDicke / 100) * 0.28 * 40;
    expect(ausKatalog.vkProM2).toBeCloseTo(erwartet, 6);
  });
});

describe("3. Dämmstoff: Preis gilt je m²", () => {
  const m = { area: 220, wallHeight: 0, insulationThickness: 8, aufbauKategorie: "" as const };
  const daemm = () => ({ ...newMaterialRow(), category: "Dämmstoffe", product: "Trittschall 20 mm", ekPrice: 6.8, vkPrice: 9.18, vkManuell: true });

  it("ohne Schalter wie bisher: × Dämmstärke", () => {
    const r = calcMaterialRow(daemm(), m, bd);
    expect(r.vkProM2).toBeCloseTo(9.18 * 0.08, 6);   // 0,7344
  });
  it("mit Schalter: der Preis bleibt je m²", () => {
    const r = calcMaterialRow({ ...daemm(), preisJeM2: true }, m, bd);
    expect(r.vkProM2).toBeCloseTo(9.18, 6);
    expect(r.ekProM2).toBeCloseTo(6.8, 6);
  });
  it("der Schalter überlebt Speichern und Laden", () => {
    const mod = { ...newModule(1), materialRows: [{ ...daemm(), preisJeM2: true }] };
    const st = normalizeKalkulationState({ modules: [mod] });
    expect(st.modules[0].materialRows[0].preisJeM2).toBe(true);
    const st2 = normalizeKalkulationState({ modules: [{ ...newModule(1), materialRows: [daemm()] }] });
    expect(st2.modules[0].materialRows[0].preisJeM2).toBeUndefined();
  });
});

describe("4. Arbeitsgänge", () => {
  it("Std × Mann je Zeile", () => {
    expect(arbeitsgangStunden({ stunden: 2.5, mann: 2 })).toBe(5);
    expect(arbeitsgangStunden({ stunden: 6, mann: 3.5 })).toBe(21);
  });
  it("ohne Arbeitsgänge rechnet der Aufbau wie bisher", () => {
    const m = { ...newModule(1), workers: 2, days: 3 };
    expect(nutztArbeitsgaenge(m)).toBe(false);
    const erg = calcModule(m, bd);
    expect(erg.laborHours).toBe(2 * 3 * bd.stundenProTag);
    expect(erg.laborCosts).toBeCloseTo(erg.laborHours * bd.mittellohn, 6);
  });
  it("mit Arbeitsgängen zählt deren Stundensumme — Arbeiter × Tage wird ignoriert", () => {
    const m = {
      ...newModule(1), workers: 9, days: 9,
      arbeitszeiten: [
        { stunden: 2.5, mann: 2, text: "Abbruch" },
        { stunden: 8, mann: 4, text: "Riegelbau" },
        { stunden: 6, mann: 3.5, text: "Außenhülle schließen" },
      ],
    };
    expect(nutztArbeitsgaenge(m)).toBe(true);
    const erg = calcModule(m, bd);
    expect(erg.laborHours).toBe(5 + 32 + 21);
    expect(erg.laborCosts).toBeCloseTo(58 * bd.mittellohn, 6);
    const v = calcVerdienst(m, erg, 1, bd);
    expect(v.lohnSelbstkosten).toBeCloseTo(58 * bd.selbstkostenLohn, 6);
  });
  it("leere Zeilen (ohne Stunden) zählen nicht — dann gilt wieder Arbeiter × Tage", () => {
    const m = { ...newModule(1), workers: 1, days: 1, arbeitszeiten: [{ stunden: 0, mann: 2, text: "nur Text" }] };
    expect(nutztArbeitsgaenge(m)).toBe(false);
    expect(calcModule(m, bd).laborHours).toBe(bd.stundenProTag);
  });
  it("Arbeitsgänge überleben Speichern und Laden; leere Liste wird weggelassen", () => {
    const st = normalizeKalkulationState({ modules: [{ ...newModule(1), arbeitszeiten: [{ stunden: 8, mann: 4, text: "Riegelbau" }] }] });
    expect(st.modules[0].arbeitszeiten).toEqual([{ stunden: 8, mann: 4, text: "Riegelbau" }]);
    const st2 = normalizeKalkulationState({ modules: [{ ...newModule(1), arbeitszeiten: [] }] });
    expect(st2.modules[0].arbeitszeiten).toBeUndefined();
  });
  it("im Angebot steht die Stundensumme statt Tage × Arbeiter", () => {
    const m = { ...newModule(1), name: "Dach", area: 50, arbeitszeiten: [{ stunden: 8, mann: 4, text: "Riegelbau" }] };
    const p = calcProjekt(normalizeKalkulationState({ modules: [m] }), bd);
    const { items } = buildAngebotItems(p);
    const zeile = items.find((it) => String(it.beschreibung).startsWith("Arbeitszeit:"));
    expect(zeile?.beschreibung).toBe("Arbeitszeit: 32 Std. (1 Arbeitsgang)");
  });
});
