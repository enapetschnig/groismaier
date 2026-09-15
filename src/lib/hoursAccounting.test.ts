import { describe, it, expect, vi } from "vitest";
// Reine Rechenlogik testen: der Supabase-Client wuerde in Node ohne localStorage schreien.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { aggregateByDay, totalAutoSaldo, tagesBilanz } from "./hoursAccounting";

// 2026-09-01 ist ein Dienstag; 05./06.09. Wochenende.
const e = (datum: string, stunden: number, taetigkeit = "Montage") => ({ datum, stunden, taetigkeit });

describe("tagesBilanz — dieselbe Regel wie das Zeitkonto (15.09.2026)", () => {
  it("Arbeitstag 9 h: +1,2", () => {
    expect(tagesBilanz("2026-09-01", [e("2026-09-01", 9)])).toMatchObject({ ist: 9, soll: 7.8, ueberstunden: 1.2, zeitausgleich: 0, saldo: 1.2 });
  });
  it("mehrere Projekte am Tag werden zusammengezählt (6 + 6 = +4,2, nicht 0)", () => {
    expect(tagesBilanz("2026-09-01", [e("2026-09-01", 6), e("2026-09-01", 6)]).saldo).toBe(4.2);
  });
  it("ganzer Zeitausgleich-Tag: −7,8 — und NICHT neutral wie früher", () => {
    const b = tagesBilanz("2026-09-04", [e("2026-09-04", 7.8, "Zeitausgleich")]);
    expect(b.saldo).toBe(-7.8);
    expect(b.zeitausgleich).toBe(-7.8);
    expect(b.istSonderzeit).toBe(false);
  });
  it("halber ZA (4 h) + 5 h Arbeit: ZA −4, Überstunden +1,2, Saldo −2,8", () => {
    expect(tagesBilanz("2026-09-01", [e("2026-09-01", 4, "Zeitausgleich"), e("2026-09-01", 5)])).toMatchObject({ zeitausgleich: -4, ueberstunden: 1.2, saldo: -2.8 });
  });
  it("Urlaub / Krankenstand / Feiertag / Weiterbildung: Saldo 0, Soll bleibt sichtbar", () => {
    for (const t of ["Urlaub", "Krankenstand", "Feiertag", "Weiterbildung"]) {
      expect(tagesBilanz("2026-09-01", [e("2026-09-01", 7.8, t)])).toMatchObject({ soll: 7.8, saldo: 0, istSonderzeit: true });
    }
    // Urlaub + trotzdem 3 h gearbeitet: bleibt neutral (kein Phantom-Plus)
    expect(tagesBilanz("2026-09-01", [e("2026-09-01", 7.8, "Urlaub"), e("2026-09-01", 3)]).saldo).toBe(0);
  });
  it("Wochenende: Soll 0, alles Überstunden; ZA am Wochenende zieht trotzdem ab", () => {
    expect(tagesBilanz("2026-09-05", [e("2026-09-05", 4)]).saldo).toBe(4);
    expect(tagesBilanz("2026-09-05", [e("2026-09-05", 4, "Zeitausgleich")]).saldo).toBe(-4);
  });
  it("persönliches Soll (Teilzeit 3 h)", () => {
    expect(tagesBilanz("2026-09-01", [e("2026-09-01", 2.5, "Büro")], 3).saldo).toBe(-0.5);
    expect(tagesBilanz("2026-09-01", [e("2026-09-01", 3, "Zeitausgleich")], 3).saldo).toBe(-3);
  });
  it("Strings und null als Stunden sind harmlos", () => {
    expect(tagesBilanz("2026-09-01", [{ datum: "2026-09-01", stunden: "9,0" as any }, { datum: "2026-09-01", stunden: null }]).ist).toBe(0);
    expect(tagesBilanz("2026-09-01", [{ datum: "2026-09-01", stunden: "9" }]).saldo).toBe(1.2);
  });
});

describe("aggregateByDay / totalAutoSaldo", () => {
  it("sortiert nach Datum und lässt Einträge ohne Datum weg", () => {
    const tage = aggregateByDay([e("2026-09-02", 8), e("2026-09-01", 9), { datum: "", stunden: 5 }]);
    expect(tage.map((t) => t.datum)).toEqual(["2026-09-01", "2026-09-02"]);
  });
  it("Sebastian September 2026: −0,85 wie im Zeitkonto", () => {
    const sept = [e("2026-09-01", 9), e("2026-09-02", 9.5), e("2026-09-03", 5.5), e("2026-09-04", 7.8, "Zeitausgleich"),
      e("2026-09-07", 7.5), e("2026-09-07", 1), e("2026-09-07", 1.25), e("2026-09-08", 10), e("2026-09-10", 10)];
    expect(totalAutoSaldo(sept)).toBe(-0.85);
  });
});
