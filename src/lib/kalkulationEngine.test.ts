/**
 * Tests der Aufbau-Kalkulation — Material, Lohn, Aufschlag, Verdienst.
 *
 * Die Kalkulation ist die Grundlage jedes Angebots; ein Fehler hier wandert
 * unbemerkt in den Preis. Deshalb liegen die Rechenwege hier fest.
 */
import { describe, it, expect } from "vitest";
import {
  calcMaterialRow, calcLohnkosten, calcLohnSelbstkosten, calcArbeitsstunden,
  istVolumenEinheit, DEFAULT_BETRIEBSDATEN, round2,
  type MaterialRow, type Betriebsdaten,
} from "./kalkulationEngine";

const bd: Betriebsdaten = { ...DEFAULT_BETRIEBSDATEN };

const zeile = (p: Partial<MaterialRow>): MaterialRow => ({
  category: "Platten", product: "Testartikel",
  ekPrice: 0, vkPrice: 0, actualVK: null,
  manual: false, calc: false, lmPerQm: 0, dimension: 0, dimension2: 0,
  ...p,
});

const modul = { area: 100, wallHeight: 2.5, insulationThickness: 20, aufbauKategorie: "Wand" as const };

describe("Materialzeile", () => {
  it("Katalogpreis gilt als €/m² Aufbaufläche", () => {
    const r = calcMaterialRow(zeile({ ekPrice: 12, vkPrice: 18 }), modul, bd);
    expect(r.ekProM2).toBe(12);
    expect(r.vkProM2).toBe(18);
    expect(r.ekAbsolut).toBe(0);
  });

  it("fehlt der VK, wird er über den Faktor abgeleitet", () => {
    const r = calcMaterialRow(zeile({ ekPrice: 100, vkPrice: 0 }), modul, bd);
    expect(r.vkAbgeleitet).toBe(true);
    expect(r.vkProM2).toBeCloseTo(100 * bd.vkFaktor, 2);
  });

  it("Modus manuell: absoluter Betrag ohne Flächenbezug", () => {
    const r = calcMaterialRow(zeile({ manual: true, ekPrice: 2500, vkPrice: 3000 }), modul, bd);
    expect(r.ekAbsolut).toBe(2500);
    expect(r.vkAbsolut).toBe(3000);
    expect(r.ekProM2).toBe(0);
  });

  it("Modus Holz berechnen: Fläche × lfm/m² × b × h × €/m³", () => {
    // 100 m² × 2 lfm/m² × 0,10 m × 0,20 m × 500 €/m³ = 2.000 €
    const r = calcMaterialRow(
      zeile({ calc: true, lmPerQm: 2, dimension: 10, dimension2: 20, ekPrice: 500 }), modul, bd);
    expect(r.ekAbsolut).toBeCloseTo(2000, 2);
    expect(r.vkAbsolut).toBeCloseTo(2000, 2);
  });

  it("Dämmstoffe: €/m³ wird über die Dämmstärke auf €/m² gebracht", () => {
    // 20 cm Dämmstärke, 150 €/m³ → 0,20 × 150 = 30 €/m²
    const r = calcMaterialRow(
      zeile({ category: "Dämmstoffe", ekPrice: 150, vkPrice: 200 }), modul, bd);
    expect(r.ekProM2).toBeCloseTo(30, 2);
    expect(r.vkProM2).toBeCloseTo(40, 2);
  });

  it("Dämmstoffe ohne Preis liefern nichts statt NaN", () => {
    const r = calcMaterialRow(zeile({ category: "Dämmstoffe", ekPrice: 0, vkPrice: 0 }), modul, bd);
    expect(r.ekProM2).toBe(0);
    expect(r.vkProM2).toBe(0);
  });

  it("Zeile ohne Artikel bleibt leer", () => {
    const r = calcMaterialRow(zeile({ product: "" }), modul, bd);
    expect(r.ekProM2).toBe(0);
    expect(r.vkProM2).toBe(0);
  });
});

describe("Mengeneinheit", () => {
  it("erkennt Volumen-Einheiten", () => {
    for (const e of ["m³", "m3", "M³", "fm", "rm"]) expect(istVolumenEinheit(e)).toBe(true);
    for (const e of ["m²", "lfm", "Stk.", "", null]) expect(istVolumenEinheit(e)).toBe(false);
  });

  it("meldet einen €/m³-Artikel, der als €/m² eingesetzt wird", () => {
    // BSH kostet 668,25 €/m³. Als €/m² Wandfläche wäre das grober Unfug —
    // dafür gibt es den Modus Holz berechnen.
    const r = calcMaterialRow(
      zeile({ category: "BSH", product: "Fichte NSI", ekPrice: 495, vkPrice: 668.25, einheit: "m³" }),
      modul, bd);
    expect(r.einheitUnpassend).toBe(true);
  });

  it("m²-Artikel sind unauffällig", () => {
    const r = calcMaterialRow(zeile({ ekPrice: 12, vkPrice: 18, einheit: "m²" }), modul, bd);
    expect(r.einheitUnpassend).toBe(false);
  });

  it("Dämmstoffe rechnen m³ korrekt um und werden nicht gemeldet", () => {
    const r = calcMaterialRow(
      zeile({ category: "Dämmstoffe", ekPrice: 150, vkPrice: 200, einheit: "m³" }), modul, bd);
    expect(r.einheitUnpassend).toBeFalsy();
  });
});

describe("Lohn", () => {
  it("Lohnkosten = Tage × Stunden/Tag × Mittellohn × Arbeiter", () => {
    expect(calcLohnkosten(3, 10, bd)).toBeCloseTo(3 * 10 * bd.stundenProTag * bd.mittellohn, 2);
  });

  it("Selbstkosten nutzen den Selbstkostensatz, nicht den Mittellohn", () => {
    const erloes = calcLohnkosten(3, 10, bd);
    const kosten = calcLohnSelbstkosten(3, 10, bd);
    expect(kosten).toBeLessThan(erloes);
    expect(kosten).toBeCloseTo(3 * 10 * bd.stundenProTag * bd.selbstkostenLohn, 2);
  });

  it("Arbeitsstunden = Tage × Stunden/Tag × Arbeiter", () => {
    expect(calcArbeitsstunden(3, 10, bd)).toBeCloseTo(3 * 10 * bd.stundenProTag, 2);
  });

  it("ohne Arbeiter oder ohne Tage keine Kosten", () => {
    expect(calcLohnkosten(0, 10, bd)).toBe(0);
    expect(calcLohnkosten(3, 0, bd)).toBe(0);
  });

  it("Der Lohn-Verdienst ist die Spanne zwischen Mittellohn und Selbstkosten", () => {
    const verdienst = calcLohnkosten(2, 5, bd) - calcLohnSelbstkosten(2, 5, bd);
    expect(verdienst).toBeGreaterThan(0);
    expect(verdienst).toBeCloseTo(2 * 5 * bd.stundenProTag * (bd.mittellohn - bd.selbstkostenLohn), 2);
  });
});

describe("Rundung", () => {
  it("round2 rundet kaufmännisch und stabil", () => {
    expect(round2(0.005)).toBe(0.01);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1);
  });
});
