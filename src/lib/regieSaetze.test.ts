import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { regieSaetzeText, setzeRegieSaetzeEin, eurSatz, type RegieSatz } from "./regieSaetze";

const satz = (gruppe: "personal" | "fahrzeug", bezeichnung: string, betrag: number, einheit: string, sort: number): RegieSatz =>
  ({ id: bezeichnung, gruppe, bezeichnung, betrag, einheit, sort, aktiv: true });

const saetze: RegieSatz[] = [
  satz("personal", "Vorarbeiter", 85, "Std", 10),
  satz("personal", "Facharbeiter", 75, "Std", 20),
  satz("personal", "Hilfsarbeiter", 70, "Std", 30),
  satz("personal", "Lehrling 1. LJ", 35, "Std", 40),
  satz("fahrzeug", "Montagebus", 1.2, "km", 10),
  satz("fahrzeug", "Montagebus mit Anhänger", 1.5, "km", 20),
  satz("fahrzeug", "2-Achs-LKW mit Anhänger", 2, "km", 30),
  satz("fahrzeug", "2-Achs-LKW mit Anhänger inkl. Maut", 2.5, "km", 40),
];

describe("Regie-Sätze im Angebotstext", () => {
  it("Beträge stehen im österreichischen Format", () => {
    expect(eurSatz(85)).toBe("€ 85,00");
    expect(eurSatz(1.2)).toBe("€ 1,20");
    expect(eurSatz(2)).toBe("€ 2,00");
  });

  it("Personal zuerst, Fahrzeuge danach, in der gepflegten Reihenfolge", () => {
    const zeilen = regieSaetzeText(saetze).split("\n").filter(Boolean);
    expect(zeilen[0]).toBe("Vorarbeiter: € 85,00/Std");
    expect(zeilen[3]).toBe("Lehrling 1. LJ: € 35,00/Std");
    expect(zeilen[4]).toBe("Montagebus: € 1,20/km");
    expect(zeilen[7]).toBe("2-Achs-LKW mit Anhänger inkl. Maut: € 2,50/km");
  });

  it("der Platzhalter wird im Schlusstext ersetzt", () => {
    const text = "Kosten für Regiearbeiten:\n\n{{regiesaetze}}\n\nDie Regiepositionen werden nach tatsächlichem Aufwand abgerechnet.";
    const fertig = setzeRegieSaetzeEin(text, saetze);
    expect(fertig).not.toContain("{{regiesaetze}}");
    expect(fertig).toContain("Vorarbeiter: € 85,00/Std");
    expect(fertig).toContain("Die Regiepositionen werden nach tatsächlichem Aufwand abgerechnet.");
    // Der Rest des Textes bleibt unangetastet.
    expect(fertig.startsWith("Kosten für Regiearbeiten:")).toBe(true);
  });

  it("ohne Sätze bleibt kein Platzhalter im Angebot stehen", () => {
    const fertig = setzeRegieSaetzeEin("Vorher\n\n{{regiesaetze}}\n\nNachher", []);
    expect(fertig).not.toContain("{{");
    expect(fertig).toContain("Vorher");
    expect(fertig).toContain("Nachher");
  });

  it("inaktive Sätze stehen nicht im Angebot", () => {
    const mitInaktiv = [...saetze, { ...satz("personal", "Alter Satz", 99, "Std", 99), aktiv: false }];
    expect(regieSaetzeText(mitInaktiv)).not.toContain("Alter Satz");
  });

  it("Text ohne Platzhalter bleibt unverändert", () => {
    const t = "Dieses Angebot ist 30 Tage gültig.";
    expect(setzeRegieSaetzeEin(t, saetze)).toBe(t);
  });
});
