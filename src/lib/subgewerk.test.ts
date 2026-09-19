import { describe, it, expect } from "vitest";
import { calcProjekt, DEFAULT_BETRIEBSDATEN, newEmptyState, newModule, newMaterialRow, normalizeKalkulationState, subgewerkSumme } from "./kalkulationEngine";

describe("Subgewerke (Kundenwunsch 19.09.2026)", () => {
  const bau = () => {
    const st = newEmptyState(); st.modules = [];
    const eigen = newModule(1); eigen.name = "Dach"; eigen.area = 100; eigen.days = 2; eigen.workers = 2;
    eigen.materialRows = [{ ...newMaterialRow(), category: "Platten", product: "OSB", ekPrice: 10, vkPrice: 14 }];
    const sub = newModule(2); sub.name = "Endbeschichten (Maler)"; sub.area = 450; sub.istSubgewerk = true;
    sub.materialRows = [{ ...newMaterialRow(), category: "Maler", product: "Beschichtung", ekPrice: 38, vkPrice: 51.3 }];
    const subOpt = newModule(3); subOpt.name = "Alternative Sub"; subOpt.area = 10; subOpt.istSubgewerk = true; subOpt.isOptional = true;
    subOpt.materialRows = [{ ...newMaterialRow(), category: "x", product: "y", ekPrice: 1, vkPrice: 2 }];
    st.modules.push(eigen, sub, subOpt);
    return st;
  };
  it("summiert nur die gekennzeichneten, nicht optionalen Aufbauten", () => {
    const pr = calcProjekt(bau(), DEFAULT_BETRIEBSDATEN);
    const s = subgewerkSumme(pr);
    expect(s.anzahl).toBe(1);
    expect(s.optionalAnzahl).toBe(1);
    const subZeile = pr.zeilen.find((z) => z.module.name.startsWith("Endbeschichten"))!;
    expect(s.vk).toBeCloseTo(subZeile.gesamtAdj, 2);
    expect(s.ek).toBeCloseTo(subZeile.verdienst.materialEk + subZeile.verdienst.dienstleistungen, 2);
    expect(s.ek).toBeCloseTo(38 * 450, 2);
    expect(s.vk).toBeGreaterThan(s.ek);
  });
  it("Kennzeichen überlebt Speichern/Laden, fehlt bei Alt-Daten", () => {
    const wieder = normalizeKalkulationState(JSON.parse(JSON.stringify(bau())));
    expect(wieder.modules.map((m) => m.istSubgewerk)).toEqual([undefined, true, true]);
    expect(subgewerkSumme(calcProjekt(newEmptyState(), DEFAULT_BETRIEBSDATEN))).toEqual({ vk: 0, ek: 0, anzahl: 0, optionalAnzahl: 0 });
  });
});
