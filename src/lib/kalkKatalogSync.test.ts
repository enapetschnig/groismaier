import { describe, it, expect } from "vitest";
import { syncePreiseMitKatalog, type KatalogKategoriePreise } from "./kalkKatalogSync";
import { newModule, type MaterialRow } from "./kalkulationEngine";

const zeile = (p: Partial<MaterialRow>): MaterialRow => ({
  category: "Riegelkonstruktion", product: "KVH 60 mm",
  ekPrice: 620, vkPrice: 837, actualVK: null,
  manual: false, calc: false, lmPerQm: 0, dimension: 0, dimension2: 0,
  ...p,
});

const katalog = (ek: number, vk: number): KatalogKategoriePreise[] => [
  { name: "Riegelkonstruktion", artikel: [{ name: "KVH 60 mm", ek, vk }] },
];

const modulMit = (row: MaterialRow) => {
  const m = newModule(1);
  return { ...m, materialRows: [row] };
};

describe("Stammdaten-Preisabgleich (Kundenmeldung 21.08.2026)", () => {
  it("unveränderte Zeile folgt einer Stammdaten-Preisänderung", () => {
    const m = modulMit(zeile({ katalogEk: 620, katalogVk: 837 }));
    const r = syncePreiseMitKatalog([m], katalog(650, 877.5));
    expect(r.preisZeilen).toBe(1);
    const row = r.modules[0].materialRows[0];
    expect(row.ekPrice).toBe(650);
    expect(row.vkPrice).toBe(877.5);
    expect(row.katalogEk).toBe(650);
  });

  it("bewusst editierter Zeilenpreis bleibt stehen", () => {
    const m = modulMit(zeile({ ekPrice: 700, katalogEk: 620, katalogVk: 837 }));
    const r = syncePreiseMitKatalog([m], katalog(650, 877.5));
    const row = r.modules[0].materialRows[0];
    expect(row.ekPrice).toBe(700);      // Handeingabe gewinnt
    expect(row.vkPrice).toBe(877.5);    // unveränderter VK folgt trotzdem
  });

  it("Alt-Zeile ohne Vergleichswert übernimmt den Katalogpreis einmalig", () => {
    const m = modulMit(zeile({ ekPrice: 600, vkPrice: 810 })); // kein katalogEk/Vk
    const r = syncePreiseMitKatalog([m], katalog(650, 877.5));
    expect(r.preisZeilen).toBe(1);
    const row = r.modules[0].materialRows[0];
    expect(row.ekPrice).toBe(650);
    expect(row.katalogEk).toBe(650);
  });

  it("zweiter Lauf ändert nichts mehr (stabil, keine Endlosschleife)", () => {
    const m = modulMit(zeile({ katalogEk: 620, katalogVk: 837 }));
    const einmal = syncePreiseMitKatalog([m], katalog(650, 877.5));
    const zweimal = syncePreiseMitKatalog(einmal.modules, katalog(650, 877.5));
    expect(zweimal.preisZeilen).toBe(0);
    expect(zweimal.modules).toBe(einmal.modules); // identische Referenz
  });

  it("manuelle, berechnete und freie Zeilen bleiben unberührt", () => {
    const frei = zeile({ product: "Eigenbau-Artikel" });          // nicht im Katalog
    const manuell = zeile({ manual: true, katalogEk: 620 });
    const berechnet = zeile({ calc: true, katalogEk: 620 });
    const m = { ...newModule(1), materialRows: [frei, manuell, berechnet] };
    const r = syncePreiseMitKatalog([m], katalog(650, 877.5));
    expect(r.preisZeilen).toBe(0);
    expect(r.modules).toBe(r.modules);
    expect(r.modules[0].materialRows[0].ekPrice).toBe(620);
  });
});
