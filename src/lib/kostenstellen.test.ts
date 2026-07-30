/**
 * Kostenstellen-Beschriftung.
 *
 * Der Befund dahinter: Die Stundenlisten zeigten nur `location_type` und
 * damit für JEDE Kostenstelle außer „Baustelle" das Wort „Firma". Mit den
 * neuen Kostenstellen Fuhrpark und Maschinen wären dort drei verschiedene
 * Dinge unter derselben Beschriftung gelandet.
 */
import { describe, it, expect } from "vitest";
import { kostenstelleLabel, kostenstelleAnzeige, kostenstelleIcon } from "./kostenstellen";

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
