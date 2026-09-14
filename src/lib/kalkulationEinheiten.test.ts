import { describe, it, expect } from "vitest";
import { mengenEinheit } from "./kalkulationEngine";

describe("mengenEinheit — Beschriftung folgt 'Im Angebot als' (14.09.2026)", () => {
  it("Laufmeter", () => {
    expect(mengenEinheit({ angebotEinheit: "lfm" })).toEqual({ einheit: "lfm", mengeLabel: "Länge in lfm", proLabel: "pro lfm", malText: "× Länge" });
  });
  it("Stück und m³", () => {
    expect(mengenEinheit({ angebotEinheit: "Stk." }).einheit).toBe("Stk");
    expect(mengenEinheit({ angebotEinheit: "m³" }).proLabel).toBe("pro m³");
  });
  it("auto, m², pauschal und fehlend bleiben Fläche", () => {
    for (const e of ["auto", "m²", "pauschal", undefined] as const) {
      expect(mengenEinheit({ angebotEinheit: e }).mengeLabel).toBe("Fläche in m²");
    }
    expect(mengenEinheit(null).einheit).toBe("m²");
  });
});
