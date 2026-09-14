import { describe, it, expect } from "vitest";
import { zaKontoDelta } from "./zeitkonto";

const za = (stunden: number, datum = "2026-09-08") => ({ datum, stunden, taetigkeit: "Zeitausgleich" });
const arbeit = (stunden: number, datum = "2026-09-08") => ({ datum, stunden, taetigkeit: "Montage" });

describe("zaKontoDelta — was das Konto zurückbekommt", () => {
  it("ZA-Eintrag gelöscht: Abbuchung kommt zurück", () => {
    expect(zaKontoDelta(za(7.8), null)).toBe(7.8);
  });
  it("ZA-Eintrag wird zu Arbeit (Sebastian, 08.09.): Abbuchung kommt zurück", () => {
    expect(zaKontoDelta(za(7.8), arbeit(10))).toBe(7.8);
  });
  it("Stunden eines ZA-Eintrags geändert: nur die Differenz", () => {
    expect(zaKontoDelta(za(7.8), za(4))).toBe(3.8);
    expect(zaKontoDelta(za(4), za(7.8))).toBe(-3.8);
  });
  it("Arbeit wird nachträglich zu ZA: Abbuchung", () => {
    expect(zaKontoDelta(arbeit(10), za(7.8))).toBe(-7.8);
  });
  it("Arbeit bleibt Arbeit, Arbeit gelöscht: nichts", () => {
    expect(zaKontoDelta(arbeit(10), arbeit(8))).toBe(0);
    expect(zaKontoDelta(arbeit(10), null)).toBe(0);
    expect(zaKontoDelta(null, null)).toBe(0);
  });
  it("Stunden als Text und Leerraum in der Tätigkeit sind harmlos", () => {
    expect(zaKontoDelta({ datum: "2026-09-08", stunden: "7.80", taetigkeit: " Zeitausgleich " }, null)).toBe(7.8);
    expect(zaKontoDelta({ datum: "2026-09-08", stunden: null, taetigkeit: "Zeitausgleich" }, null)).toBe(0);
  });
  it("rundet auf Hundertstel", () => {
    expect(zaKontoDelta(za(7.8), za(4.123))).toBe(3.68);
  });
});
