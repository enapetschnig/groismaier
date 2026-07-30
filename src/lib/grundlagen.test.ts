/**
 * Grundlagen-Tests: Zahleneingabe, Datum, Arbeitszeit-Erkennung.
 *
 * Das sind die Stellen, an denen in dieser Software wiederholt Geld- und
 * Stundenfehler entstanden sind — österreichisches Komma, UTC-Verschiebung
 * und die Frage, was als eigene Arbeitsstunde zählt.
 */
import { describe, it, expect } from "vitest";
import { parseDecimal, toNumber, clamp, formatForInput } from "./num";
import { alsISO, heuteISO } from "./datum";
import { istStundenEinheit, istStundensatzName, istArbeitszeitZeile } from "./stunden";
import { getNormalWorkingHours, getDefaultWorkTimes, getWeeklyTargetHours, isNonWorkingDay } from "./workingHours";

describe("Zahleneingabe (österreichisch)", () => {
  it("liest Komma als Dezimaltrenner", () => {
    expect(parseDecimal("12,50")).toBe(12.5);
    expect(parseDecimal("0,05")).toBe(0.05);
    expect(parseDecimal("-3,75")).toBe(-3.75);
  });

  it("liest auch den Punkt als Dezimaltrenner", () => {
    expect(parseDecimal("12.50")).toBe(12.5);
  });

  it("versteht Tausenderpunkte", () => {
    expect(parseDecimal("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseDecimal("12.345")).toBeCloseTo(12345, 2);
  });

  it("liefert null statt NaN bei unlesbarer Eingabe", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });

  it("macht aus 12,50 NIEMALS 1250 — der klassische Faktor-100-Fehler", () => {
    expect(parseDecimal("12,50")).not.toBe(1250);
    expect(toNumber("12,50")).toBe(12.5);
  });

  it("toNumber fällt auf den Vorgabewert zurück", () => {
    expect(toNumber("", 7)).toBe(7);
    expect(toNumber("abc", 0)).toBe(0);
  });

  it("clamp begrenzt beidseitig", () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("formatForInput gibt österreichisches Komma zurück", () => {
    expect(formatForInput(12.5, 2)).toBe("12,50");
    expect(formatForInput(0, 2)).toBe("0,00");
  });

  it("Hin und zurück verliert keinen Wert", () => {
    for (const w of [0, 0.01, 12.5, 1234.56, 99999.99]) {
      expect(parseDecimal(formatForInput(w, 2))).toBeCloseTo(w, 2);
    }
  });
});

describe("Datum (örtlich, nicht UTC)", () => {
  it("gibt den lokalen Tag zurück, nicht den UTC-Vortag", () => {
    // Mitternacht österreichischer Zeit — toISOString() lieferte hier den 30.04.
    expect(alsISO(new Date(2026, 4, 1, 0, 0, 0))).toBe("2026-05-01");
  });

  it("Monatsanfang und Monatsende stimmen", () => {
    expect(alsISO(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(alsISO(new Date(2026, 1, 0))).toBe("2026-01-31");   // Tag 0 = letzter des Vormonats
    expect(alsISO(new Date(2026, 2, 0))).toBe("2026-02-28");
  });

  it("auch spät am Abend noch derselbe Tag", () => {
    expect(alsISO(new Date(2026, 6, 15, 23, 59, 0))).toBe("2026-07-15");
  });

  it("heuteISO liefert ein gültiges Datum im erwarteten Format", () => {
    expect(heuteISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(heuteISO()).toBe(alsISO(new Date()));
  });
});

describe("Arbeitsstunden-Erkennung", () => {
  it("erkennt Stunden-Einheiten", () => {
    for (const e of ["Std", "Std.", "h", "Stunde", "Stunden", "STD"]) {
      expect(istStundenEinheit(e)).toBe(true);
    }
    expect(istStundenEinheit("m²")).toBe(false);
    expect(istStundenEinheit("Pauschale")).toBe(false);
  });

  it("erkennt eigene Lohnsätze inklusive der Kalkulations-Arbeitszeitzeile", () => {
    expect(istStundensatzName("Facharbeiterstunde")).toBe(true);
    expect(istStundensatzName("Regiestunde")).toBe(true);
    expect(istStundensatzName("Arbeitszeit: 10 Tage × 3 Arbeiter")).toBe(true);
    expect(istStundensatzName("Lehrling Stunde")).toBe(true);
  });

  it("zählt nur Zeilen mit Stunden-Einheit UND Lohnsatz-Namen", () => {
    expect(istArbeitszeitZeile("Facharbeiterstunde", "Std")).toBe(true);
    expect(istArbeitszeitZeile("Arbeitszeit: 10 Tage × 3 Arbeiter", "h")).toBe(true);
    // Zugekaufte Leistung mit Std-Einheit ist KEINE eigene Arbeitsstunde
    expect(istArbeitszeitZeile("Fassadengerüst An- und Abtransport", "Std")).toBe(false);
    // Lohnsatz-Name, aber Pauschale
    expect(istArbeitszeitZeile("Facharbeiterstunde", "Pauschale")).toBe(false);
  });
});

describe("Regelarbeitszeit", () => {
  it("Montag bis Donnerstag mit Vorgabezeiten, Pause inklusive", () => {
    const montag = new Date(2026, 6, 27); // Mo
    const p = getDefaultWorkTimes(montag);
    expect(p).not.toBeNull();
    expect(p!.startTime).toBe("07:00");
    expect(p!.endTime).toBe("17:30");
    expect(p!.pauseMinutes).toBe(30);
    // Kernaussage: Brutto-Spanne minus Pause = ausgewiesene Netto-Stunden.
    const [sh, sm] = p!.startTime.split(":").map(Number);
    const [eh, em] = p!.endTime.split(":").map(Number);
    const netto = ((eh * 60 + em) - (sh * 60 + sm) - p!.pauseMinutes) / 60;
    expect(netto).toBeCloseTo(p!.totalHours, 2);
  });

  it("Freitag bis Sonntag ohne Vorgabe", () => {
    expect(getDefaultWorkTimes(new Date(2026, 6, 31))).toBeNull(); // Fr
    expect(getDefaultWorkTimes(new Date(2026, 7, 1))).toBeNull();  // Sa
    expect(getDefaultWorkTimes(new Date(2026, 7, 2))).toBeNull();  // So
  });

  it("Normalstunden passen zur Vorgabe desselben Tages", () => {
    for (const tag of [27, 28, 29, 30, 31]) {          // Mo–Fr
      const d = new Date(2026, 6, tag);
      const p = getDefaultWorkTimes(d);
      const soll = getNormalWorkingHours(d);
      // Wo es eine Vorgabe gibt, muss sie zur Stundenzahl passen; sonst 0.
      if (p) expect(soll).toBeCloseTo(p.totalHours, 2);
      else expect(soll).toBe(0);
    }
  });

  it("Wochensoll passt zur Summe der Tagesvorgaben", () => {
    // Mo–So einer vollen Woche aufsummieren und gegen das Wochensoll stellen.
    const woche = [27, 28, 29, 30, 31, 1, 2].map((t, i) =>
      i < 5 ? new Date(2026, 6, t) : new Date(2026, 7, t));
    const summe = woche.reduce((s, d) => s + getNormalWorkingHours(d), 0);
    expect(summe).toBeCloseTo(getWeeklyTargetHours(), 2);
  });

  it("Samstag und Sonntag gelten als arbeitsfrei", () => {
    expect(isNonWorkingDay(new Date(2026, 7, 1))).toBe(true);  // Sa
    expect(isNonWorkingDay(new Date(2026, 7, 2))).toBe(true);  // So
  });
});
