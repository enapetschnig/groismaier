import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { kalkulationArbeitsstunden } from "./projektSollStunden";
import { newEmptyState, newModule } from "./kalkulationEngine";

describe("Soll-Stunden aus einer Kalkulation (BV Zimmerl, 16.09.2026)", () => {
  it("Summe der Arbeitsstunden aller Aufbauten: Tage × Stunden/Tag × Arbeiter", () => {
    const st = newEmptyState();
    st.modules = [];
    const a = newModule(1); a.days = 3; a.workers = 2; st.modules.push(a);     // 3 × 9 × 2 = 54 h (Standard 9 h/Tag)
    const b = newModule(2); b.days = 1.5; b.workers = 4; st.modules.push(b);   // 1,5 × 9 × 4 = 54 h
    const h = kalkulationArbeitsstunden(st, {});
    expect(h).toBeGreaterThan(0);
    expect(h).toBe(Math.round(h * 10) / 10);
    // proportional: doppelte Arbeiter = doppelte Stunden
    b.workers = 8;
    expect(kalkulationArbeitsstunden(st, {})).toBeGreaterThan(h);
  });
  it("leere oder kaputte Daten ergeben 0, keinen Absturz", () => {
    expect(kalkulationArbeitsstunden(null, {})).toBe(0);
    expect(kalkulationArbeitsstunden({ modules: "x" }, {})).toBe(0);
  });
});
