import { describe, it, expect } from "vitest";
import { belegDateiBasis } from "./belegDateiname";

describe("Entwurf: keine Platzhalter-Nummer im Dateinamen (09.09.2026)", () => {
  it("aus der Anzeige-Nummer wird schlicht Entwurf", () => {
    expect(belegDateiBasis("Rechnung", "wird beim Erstellen vergeben")).toBe("Rechnung_Entwurf");
    expect(belegDateiBasis("Rechnung", "ENTWURF-7d210670")).toBe("Rechnung_Entwurf");
    expect(belegDateiBasis("Angebot", "(Entwurf)")).toBe("Angebot_Entwurf");
  });
  it("echte Nummern bleiben unveraendert", () => {
    expect(belegDateiBasis("Rechnung", "2026-044")).toBe("Rechnung_2026-044");
    expect(belegDateiBasis("Anzahlungsrechnung", "2026-014")).toBe("Anzahlungsrechnung_2026-014");
  });
});
