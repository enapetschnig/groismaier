import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { baueKalkulationAusLv, epAusKalkulation, angebotEinheitFuer } from "./lvKalkulation";
import { calcProjekt, DEFAULT_BETRIEBSDATEN, newMaterialRow, normalizeKalkulationState } from "./kalkulationEngine";

const lv = [
  { id: "p1", positionsnummer: "01.01.01", stichwort: "Sparren 10/20 liefern und montieren", einheit: "lfm", menge: 120, positionsart: "normal" },
  { id: "p2", positionsnummer: "01.01.02", stichwort: "Schalung 24 mm", einheit: "m²", menge: 85.5, positionsart: "normal" },
  { id: "t1", positionsnummer: "01", stichwort: "Holzbau", einheit: null, menge: null, positionsart: "text" },
  { id: "p3", positionsnummer: "01.02.01", stichwort: "Baustelleneinrichtung", einheit: "Pauschale", menge: 1, positionsart: "normal" },
];

describe("LV → Kalkulation", () => {
  it("je bepreisbarer Position ein Aufbau mit Menge, Einheit und Verweis", () => {
    const st = baueKalkulationAusLv(lv);
    expect(st.modules.map((m) => m.lvPositionId)).toEqual(["p1", "p2", "p3"]);
    expect(st.modules[0].name).toBe("01.01.01 Sparren 10/20 liefern und montieren");
    expect(st.modules[0].area).toBe(120);
    expect(st.modules[0].angebotEinheit).toBe("lfm");
    expect(st.modules[1].angebotEinheit).toBe("m²");
    expect(st.modules[2].angebotEinheit).toBe("pauschal");
    // Verweis überlebt das Normalisieren (Speichern/Laden)
    const wieder = normalizeKalkulationState(JSON.parse(JSON.stringify(st)));
    expect(wieder.modules.map((m) => m.lvPositionId)).toEqual(["p1", "p2", "p3"]);
  });

  it("Einheitspreise: Gesamt ÷ Menge, Lohn getrennt, unkalkulierte bleiben leer", () => {
    const st = baueKalkulationAusLv(lv);
    // Nur die Schalung kalkulieren: Material + Arbeit
    st.modules[1].materialRows = [{ ...newMaterialRow(), category: "Platten", product: "Schalung", ekPrice: 10, vkPrice: 13.5 }];
    st.modules[1].workers = 2; st.modules[1].days = 1;
    const projekt = calcProjekt(st, DEFAULT_BETRIEBSDATEN);
    const eps = epAusKalkulation(projekt);
    expect(eps).toHaveLength(1);
    const e = eps[0];
    expect(e.lvPositionId).toBe("p2");
    const zeile = projekt.zeilen.find((z) => z.module.lvPositionId === "p2")!;
    expect(e.epLohn + e.epSonstiges).toBeCloseTo(Math.round((zeile.gesamtAdj / 85.5) * 100) / 100, 1);
    expect(e.epLohn).toBeCloseTo(Math.round((zeile.laborAdj / 85.5) * 100) / 100, 2);
    expect(e.epLohn).toBeGreaterThan(0);
    expect(e.epSonstiges).toBeGreaterThan(0);
  });

  it("Einheiten-Zuordnung", () => {
    expect(angebotEinheitFuer("m2")).toBe("m²");
    expect(angebotEinheitFuer("Stk.")).toBe("Stk.");
    expect(angebotEinheitFuer("psch")).toBe("pauschal");
    expect(angebotEinheitFuer(null)).toBe("Stk.");
  });
});
