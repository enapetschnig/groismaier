import { describe, it, expect } from "vitest";
import { zielMasse, bildFuerPdf, MAX_KANTE_PX } from "./bildFuerPdf";

describe("Fotos fuer das PDF verkleinern", () => {
  it("rechnet auf die lange Kante herunter und haelt das Seitenverhaeltnis", () => {
    // Typisches Handy-Foto 4032x3024
    const a = zielMasse(4032, 3024);
    expect(Math.max(a.breite, a.hoehe)).toBe(MAX_KANTE_PX);
    expect(a.breite / a.hoehe).toBeCloseTo(4032 / 3024, 3);
    // Hochformat
    const b = zielMasse(3024, 4032);
    expect(Math.max(b.breite, b.hoehe)).toBe(MAX_KANTE_PX);
    expect(b.hoehe).toBeGreaterThan(b.breite);
  });

  it("kleine Bilder bleiben unveraendert", () => {
    expect(zielMasse(800, 600)).toEqual({ breite: 800, hoehe: 600 });
    expect(zielMasse(1400, 1050)).toEqual({ breite: 1400, hoehe: 1050 });
  });

  it("ohne Canvas (Node) kommt das Original zurueck statt eines Fehlers", async () => {
    const original = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const r = await bildFuerPdf(original);
    expect(r.dataUrl).toBe(original);
    expect(r.typ).toBe("JPEG");
  });

  it("PNG wird als PNG erkannt", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect((await bildFuerPdf(png)).typ).toBe("PNG");
  });
});
