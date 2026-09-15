import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { baueKalkulationAusLv, epAusKalkulation, angebotEinheitFuer, zuordnungAusKalkulation, lvPositionFuerAufbau } from "./lvKalkulation";
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

describe("Meldung 15.09.2026 (LV H38): geklonte Aufbauten landen auf der richtigen Position", () => {
  const positionen = [
    { id: "s1", positionsnummer: "5.3.1", menge: 1 },
    { id: "s2", positionsnummer: "5.3.2", menge: 1 },
    { id: "s3", positionsnummer: "5.3.3", menge: 1 },
    { id: "d1", positionsnummer: "5.3", menge: 10 },
  ];
  it("die Positionsnummer am Namensanfang gewinnt gegen den alten Verweis", () => {
    expect(lvPositionFuerAufbau({ name: "5.3.2 Massivstiege 1.OG-2.OG", lvPositionId: "s1" }, positionen)?.id).toBe("s2");
    expect(lvPositionFuerAufbau({ name: "5.3.3 Massivstiege (Kopie)", lvPositionId: undefined }, positionen)?.id).toBe("s3");
    // längste passende Nummer, nicht „5.3"
    expect(lvPositionFuerAufbau({ name: "5.3.1 Stiege", lvPositionId: undefined }, positionen)?.id).toBe("s1");
    // ohne Nummer im Namen: der Verweis
    expect(lvPositionFuerAufbau({ name: "Stiege EG", lvPositionId: "s2" }, positionen)?.id).toBe("s2");
    // weder noch
    expect(lvPositionFuerAufbau({ name: "Stiege EG", lvPositionId: undefined }, positionen)).toBeUndefined();
    // „5.30 …" ist nicht „5.3"
    expect(lvPositionFuerAufbau({ name: "5.30 Sonstiges", lvPositionId: undefined }, positionen)).toBeUndefined();
  });
  it("drei Stiegen mit demselben Verweis: jede Position bekommt ihren eigenen Preis", () => {
    const st = baueKalkulationAusLv(lv);
    st.modules = [];
    for (const [i, name] of ["5.3.1 Massivstiege EG-1.OG", "5.3.2 Massivstiege 1.OG-2.OG", "5.3.3 Massivstiege 2.OG-DG"].entries()) {
      const m = { ...baueKalkulationAusLv([{ id: "s1", positionsnummer: "5.3.1", stichwort: "x", einheit: "Stk.", menge: 1, positionsart: "normal" }]).modules[0] };
      m.id = i + 1; m.name = name; m.lvPositionId = "s1";   // Klon-Zustand vor dem Fix
      m.materialRows = [{ ...newMaterialRow(), manual: true, category: "Stiege", product: "Stiege", ekPrice: 1000 * (i + 1), vkPrice: 1000 * (i + 1) }];
      st.modules.push(m);
    }
    const z = zuordnungAusKalkulation(calcProjekt(st, DEFAULT_BETRIEBSDATEN), positionen);
    expect(z.ohneZuordnung).toEqual([]);
    expect(z.eps.map((e) => e.lvPositionId).sort()).toEqual(["s1", "s2", "s3"]);
    const s2 = z.eps.find((e) => e.lvPositionId === "s2")!;
    expect(s2.epLohn + s2.epSonstiges).toBeGreaterThan(z.eps.find((e) => e.lvPositionId === "s1")!.epLohn + z.eps.find((e) => e.lvPositionId === "s1")!.epSonstiges);
  });
  it("zwei Aufbauten für EINE Position werden summiert, Menge = LV-Menge", () => {
    const st = baueKalkulationAusLv([{ id: "d1", positionsnummer: "5.3", stichwort: "Decke", einheit: "m²", menge: 10, positionsart: "normal" }]);
    const a = st.modules[0]; a.name = "5.3 Decke Teil A"; a.area = 10;
    a.materialRows = [{ ...newMaterialRow(), manual: true, category: "x", product: "x", ekPrice: 100, vkPrice: 100 }];
    const b = { ...structuredClone(a), id: 2, name: "5.3 Decke Teil B", lvPositionId: undefined };
    st.modules.push(b);
    const z = zuordnungAusKalkulation(calcProjekt(st, DEFAULT_BETRIEBSDATEN), positionen);
    expect(z.eps).toHaveLength(1);
    expect(z.eps[0].lvPositionId).toBe("d1");
    expect(z.eps[0].epLohn + z.eps[0].epSonstiges).toBeCloseTo(200 / 10, 2);
  });
  it("Aufbau mit Betrag, aber ohne Position, wird gemeldet statt still verworfen", () => {
    const st = baueKalkulationAusLv(lv);
    st.modules[0].name = "Sonderaufbau"; st.modules[0].lvPositionId = undefined;
    st.modules[0].materialRows = [{ ...newMaterialRow(), manual: true, category: "x", product: "x", ekPrice: 50, vkPrice: 50 }];
    const z = zuordnungAusKalkulation(calcProjekt(st, DEFAULT_BETRIEBSDATEN), [{ id: "p1", positionsnummer: "01.01.01", menge: 120 }]);
    expect(z.ohneZuordnung).toEqual(["Sonderaufbau"]);
  });
});
