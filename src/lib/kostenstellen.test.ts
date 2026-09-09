/**
 * Kostenstellen-Beschriftung.
 *
 * Der Befund dahinter: Die Stundenlisten zeigten nur `location_type` und
 * damit für JEDE Kostenstelle außer „Baustelle" das Wort „Firma". Mit den
 * neuen Kostenstellen Fuhrpark und Maschinen wären dort drei verschiedene
 * Dinge unter derselben Beschriftung gelandet.
 */
import { describe, it, expect } from "vitest";
import { kostenstelleLabel, kostenstelleAnzeige, kostenstelleIcon, projektMoeglich, projektPflicht, projektFeldLabel, projektFeldHinweis } from "./kostenstellen";

const OPTIONEN = [
  { wert: "baustelle", label: "Baustelle" },
  { wert: "werkstatt", label: "Werkstatt" },
  { wert: "fuhrpark", label: "Fuhrpark" },
  { wert: "maschinen", label: "Maschinen" },
];

describe("Beschriftung", () => {
  it("nimmt die Kostenstelle, nicht den groben location_type", () => {
    // Kernfehler: fuhrpark wird als location_type 'werkstatt' gespeichert
    // (DB-CHECK lässt nur baustelle/werkstatt zu) — angezeigt werden muss
    // trotzdem „Fuhrpark".
    expect(kostenstelleLabel("fuhrpark", "werkstatt", OPTIONEN)).toBe("Fuhrpark");
    expect(kostenstelleLabel("maschinen", "werkstatt", OPTIONEN)).toBe("Maschinen");
    expect(kostenstelleLabel("werkstatt", "werkstatt", OPTIONEN)).toBe("Werkstatt");
  });

  it("fällt ohne Kostenstelle auf den groben Wert zurück (Altbuchungen)", () => {
    expect(kostenstelleLabel(null, "baustelle", OPTIONEN)).toBe("Baustelle");
    expect(kostenstelleLabel(null, "werkstatt", OPTIONEN)).toBe("Firma");
    expect(kostenstelleLabel(undefined, undefined, OPTIONEN)).toBe("Baustelle");
  });

  it("macht eine gelöschte Kostenstelle trotzdem lesbar", () => {
    // Wird eine Kostenstelle deaktiviert, dürfen die alten Buchungen nicht
    // ohne Ortsangabe dastehen.
    expect(kostenstelleLabel("alte_halle", "werkstatt", OPTIONEN)).toBe("Alte halle");
  });

  it("kommt auch ohne geladene Optionsliste zurecht", () => {
    expect(kostenstelleLabel("fuhrpark", "werkstatt")).toBe("Fuhrpark");
  });
});

describe("Symbole", () => {
  it("kennt die eingebauten Kostenstellen", () => {
    expect(kostenstelleIcon("baustelle")).toBe("🏗️");
    expect(kostenstelleIcon("fuhrpark")).toBe("🚚");
    expect(kostenstelleIcon("maschinen")).toBe("⚙️");
  });

  it("gibt selbst angelegten Kostenstellen einen Pin statt gar nichts", () => {
    expect(kostenstelleIcon("kranarbeiten")).toBe("📍");
    expect(kostenstelleIcon(null)).toBe("📍");
  });

  it("Anzeige verbindet Symbol und Beschriftung", () => {
    expect(kostenstelleAnzeige("fuhrpark", "werkstatt", OPTIONEN)).toBe("🚚 Fuhrpark");
    expect(kostenstelleAnzeige(null, "baustelle", OPTIONEN)).toBe("🏗️ Baustelle");
    expect(kostenstelleAnzeige(null, "werkstatt", OPTIONEN)).toBe("🏢 Firma");
  });
});

describe("Projektzuordnung je Kostenstelle (Kundenwunsch 09.09.2026)", () => {
  it("Werkstatt, Lager und Büro dürfen ein Projekt tragen", () => {
    for (const ks of ["werkstatt", "lagerwerkstatt", "lagerplatz", "buero_chef", "buero_verwaltung"]) {
      expect(projektMoeglich(ks), ks).toBe(true);
      expect(projektPflicht(ks), ks).toBe(false);
    }
  });

  it("auf der Baustelle ist das Projekt Pflicht", () => {
    expect(projektMoeglich("baustelle")).toBe(true);
    expect(projektPflicht("baustelle")).toBe(true);
  });

  it("Fuhrpark und Maschinen laufen auf das Geraet, nicht auf ein Projekt", () => {
    for (const ks of ["fuhrpark", "maschinen"]) {
      expect(projektMoeglich(ks), ks).toBe(false);
      expect(projektPflicht(ks), ks).toBe(false);
    }
  });

  it("unbekannte oder fehlende Kostenstelle: Projekt erlaubt, nicht verpflichtend", () => {
    for (const ks of [null, undefined, "", "sonstiges"]) {
      expect(projektMoeglich(ks as any)).toBe(true);
      expect(projektPflicht(ks as any)).toBe(false);
    }
  });

  it("Beschriftung passt zur Regel", () => {
    expect(projektFeldLabel("baustelle")).toBe("Projekt *");
    expect(projektFeldLabel("werkstatt")).toBe("Projekt (optional)");
    expect(projektFeldHinweis("werkstatt")).toMatch(/Werkstatt/);
  });
});
