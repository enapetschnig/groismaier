import { describe, it, expect } from "vitest";
import {
  tageSeit,
  lieferscheinWarnung,
  seitWann,
  statusNachUebergabe,
  darfUnterschreiben,
  gueltigeZeilen,
  mengeAusEingabe,
  LIEFERSCHEIN_MAHNGRENZE_TAGE,
} from "./lieferscheinUebergabe";

const heute = new Date(2026, 8, 12); // 12.09.2026

describe("tageSeit", () => {
  it("zaehlt ganze Tage bis heute", () => {
    expect(tageSeit("2026-09-12", heute)).toBe(0);
    expect(tageSeit("2026-09-11", heute)).toBe(1);
    expect(tageSeit("2026-08-29", heute)).toBe(14);
  });
  it("wird nie negativ und vertraegt Unsinn", () => {
    expect(tageSeit("2026-09-20", heute)).toBe(0);
    expect(tageSeit(null, heute)).toBe(0);
    expect(tageSeit("kein datum", heute)).toBe(0);
  });
  it("ignoriert die Uhrzeit eines Zeitstempels", () => {
    expect(tageSeit("2026-09-11T23:59:00+02:00", heute)).toBe(1);
  });
});

describe("lieferscheinWarnung", () => {
  it("warnt nur im Status offen", () => {
    expect(lieferscheinWarnung("entwurf", "2026-08-01", null, heute)).toBe("");
    expect(lieferscheinWarnung("verrechnet", "2026-08-01", null, heute)).toBe("");
  });
  it("warnt ab der Mahngrenze, vorher nicht", () => {
    expect(LIEFERSCHEIN_MAHNGRENZE_TAGE).toBe(14);
    expect(lieferscheinWarnung("offen", "2026-08-30", null, heute)).toBe("");          // 13 Tage
    expect(lieferscheinWarnung("offen", "2026-08-29", null, heute)).toBe("seit 14 Tagen nicht verrechnet");
  });
  it("zaehlt ab der Unterschrift, nicht ab dem Belegdatum", () => {
    // Beleg vom 1.8., aber erst am 10.9. uebergeben -> 2 Tage, keine Warnung
    expect(lieferscheinWarnung("offen", "2026-08-01", "2026-09-10T08:00:00Z", heute)).toBe("");
  });
});

describe("seitWann", () => {
  it("formuliert kurz", () => {
    expect(seitWann("2026-09-12", heute)).toBe("heute");
    expect(seitWann("2026-09-11", heute)).toBe("seit gestern");
    expect(seitWann("2026-09-02", heute)).toBe("seit 10 Tagen");
  });
});

describe("statusNachUebergabe", () => {
  it("macht aus Entwurf offen", () => {
    expect(statusNachUebergabe("entwurf")).toBe("offen");
    expect(statusNachUebergabe(null)).toBe("offen");
  });
  it("holt Verrechnetes und Storniertes nicht zurueck", () => {
    expect(statusNachUebergabe("verrechnet")).toBe("verrechnet");
    expect(statusNachUebergabe("storniert")).toBe("storniert");
  });
});

describe("darfUnterschreiben", () => {
  it("einmal und nicht bei Storno", () => {
    expect(darfUnterschreiben("entwurf", null)).toBe(true);
    expect(darfUnterschreiben("offen", null)).toBe(true);
    expect(darfUnterschreiben("offen", "data:image/png;base64,x")).toBe(false);
    expect(darfUnterschreiben("storniert", null)).toBe(false);
  });
});

describe("Positionszeilen", () => {
  it("laesst leere Zeilen weg", () => {
    const z = gueltigeZeilen([
      { menge: "2", einheit: "Stk", text: "Holzpaket KVH" },
      { menge: "5", einheit: "m", text: "   " },
      { menge: "", einheit: "Stk", text: "Schrauben" },
    ]);
    expect(z.map((x) => x.text)).toEqual(["Holzpaket KVH", "Schrauben"]);
  });
  it("liest Mengen mit Komma und faellt auf 1 zurueck", () => {
    expect(mengeAusEingabe("2,5")).toBe(2.5);
    expect(mengeAusEingabe("3")).toBe(3);
    expect(mengeAusEingabe("")).toBe(1);
    expect(mengeAusEingabe("abc")).toBe(1);
    expect(mengeAusEingabe("-4")).toBe(1);
  });
});
