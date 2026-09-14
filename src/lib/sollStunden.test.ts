import { describe, it, expect, vi } from "vitest";
// Reine Rechenlogik testen — der Supabase-Client würde in Node ohne localStorage schreien.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { sollProTag, tagesSoll, wochenstundenVon, arbeitstageVon, sollText } from "./sollStunden";

describe("Soll je Person (Teilzeit, Meldung 14.09.2026)", () => {
  it("Vollzeit bleibt 7,8 h je Tag", () => {
    expect(sollProTag({ wochenstunden: 39, arbeitstage_woche: 5 })).toBe(7.8);
    expect(sollProTag({})).toBe(7.8);
    expect(sollProTag(null)).toBe(7.8);
  });
  it("Katrin: 15 h auf 5 Tage = 3 h, auf 3 Tage = 5 h", () => {
    expect(sollProTag({ wochenstunden: 15, arbeitstage_woche: 5 })).toBe(3);
    expect(sollProTag({ wochenstunden: 15, arbeitstage_woche: 3 })).toBe(5);
  });
  it("Zahlen als Text mit Komma, Unsinn faellt auf Vollzeit zurueck", () => {
    expect(sollProTag({ wochenstunden: "32,5", arbeitstage_woche: "5" })).toBe(6.5);
    expect(wochenstundenVon({ wochenstunden: 0 })).toBe(39);
    expect(wochenstundenVon({ wochenstunden: -3 })).toBe(39);
    expect(arbeitstageVon({ arbeitstage_woche: 0 })).toBe(5);
    expect(arbeitstageVon({ arbeitstage_woche: 9 })).toBe(5);
  });
  it("Tagessoll nur Mo–Fr", () => {
    expect(tagesSoll(new Date(2026, 8, 14), 7.8)).toBe(7.8);  // Montag
    expect(tagesSoll(new Date(2026, 8, 18), 3)).toBe(3);      // Freitag
    expect(tagesSoll(new Date(2026, 8, 19), 7.8)).toBe(0);    // Samstag
  });
  it("Kopfzeilentext", () => {
    expect(sollText({ wochenstunden: 15, arbeitstage_woche: 5 })).toBe("15 h/Woche · 3 h je Tag");
    expect(sollText(null)).toBe("39 h/Woche · 7,8 h je Tag");
  });
});
