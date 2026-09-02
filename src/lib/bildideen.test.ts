import { describe, it, expect } from "vitest";
import { baueBildPrompt, bildDateiname, BILD_VORLAGEN, BILD_GROESSEN } from "./bildideen";

describe("Bildideen — Prompt-Aufbau", () => {
  it("mit Foto: Wunsch wird eingefügt, Bestehendes bleibt", () => {
    const p = baueBildPrompt("ein Carport aus Lärche", 2);
    expect(p).toContain("Füge ein Carport aus Lärche");
    expect(p).toMatch(/Perspektive/);
    expect(p).toMatch(/Keine Texte/);
  });

  it("ohne Foto: reine Visualisierung aus dem Text", () => {
    const p = baueBildPrompt("Holzterrasse", 0);
    expect(p).toMatch(/^Fotorealistische Architektur-Visualisierung: Holzterrasse/);
    expect(p).not.toMatch(/Basis des Fotos/);
  });

  it("leerer Wunsch bekommt einen sinnvollen Standard", () => {
    expect(baueBildPrompt("   ", 1)).toContain("eine passende Holzbau-Erweiterung");
  });

  it("Vorlagen und Größen sind vollständig", () => {
    expect(BILD_VORLAGEN.length).toBeGreaterThanOrEqual(8);
    expect(new Set(BILD_VORLAGEN.map((v) => v.key)).size).toBe(BILD_VORLAGEN.length);
    expect(BILD_GROESSEN.quer).toBe("1536x1024");
  });

  it("Dateiname ist sicher und sprechend", () => {
    expect(bildDateiname("Carport für 2 Autos, Lärche!", new Date("2026-09-02T10:00:00Z")))
      .toBe("2026-09-02-carport-fuer-2-autos-laerche.png");
    expect(bildDateiname("", new Date("2026-09-02T10:00:00Z"))).toBe("2026-09-02-bildidee.png");
  });
});
