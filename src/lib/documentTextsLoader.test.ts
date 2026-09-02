/**
 * Zahlungsfrist im Schlusstext-Baustein — Kundenmeldung 01.09.2026:
 * „die Zeile mit 14 Tagen bleibt immer drin" (bei „Zahlbar sofort").
 */
import { describe, it, expect } from "vitest";
import { zahlungsfristAusBeleg, fristInText, applyDocumentTextsToInvoice } from "./documentTextsLoader";

const BAUSTEIN = "Der ausgewiesene Restbetrag ist innerhalb {{tage}} Tagen fällig.";

describe("Zahlungsfrist aus dem Beleg", () => {
  it("»sofort« ergibt keine 14 Tage mehr", () => {
    const frist = zahlungsfristAusBeleg({ zahlungsbedingungen: "sofort" });
    expect(frist.art).toBe("sofort");
    expect(fristInText(BAUSTEIN, frist)).toBe("Der ausgewiesene Restbetrag ist sofort fällig.");
  });

  it("individuelles Datum wird ausformuliert", () => {
    const frist = zahlungsfristAusBeleg({ zahlungsbedingungen: "individuell", faellig_am: "2026-09-15" });
    expect(frist.art).toBe("datum");
    expect(fristInText(BAUSTEIN, frist)).toBe("Der ausgewiesene Restbetrag ist bis zum 15.9.2026 fällig.");
  });

  it("Zahl in den Bedingungen gewinnt, sonst Vorgabe", () => {
    expect(zahlungsfristAusBeleg({ zahlungsbedingungen: "30 Tage netto" }).tage).toBe(30);
    expect(zahlungsfristAusBeleg({ zahlungsbedingungen: "" }).tage).toBe(14);
    expect(zahlungsfristAusBeleg({ zahlungsbedingungen: "" }, 21).tage).toBe(21);
  });

  it("wirkt durch applyDocumentTextsToInvoice — auch wenn der Aufrufer 14 mitgibt", () => {
    const sofort = applyDocumentTextsToInvoice(
      { zahlungsbedingungen: "sofort", custom_closing_text: "" },
      { closing: BAUSTEIN },
      { tage: 14 },   // genau der bisherige Fehler
    ) as any;
    expect(sofort.custom_closing_text).toBe("Der ausgewiesene Restbetrag ist sofort fällig.");

    const dreissig = applyDocumentTextsToInvoice(
      { zahlungsbedingungen: "30 Tage", custom_closing_text: "" },
      { closing: BAUSTEIN },
      { tage: 14 },
    ) as any;
    expect(dreissig.custom_closing_text).toBe("Der ausgewiesene Restbetrag ist innerhalb 30 Tagen fällig.");
  });

  it("BESTANDSSCHUTZ: ein eigener Schlusstext am Beleg bleibt unangetastet", () => {
    const eigen = applyDocumentTextsToInvoice(
      { zahlungsbedingungen: "sofort", custom_closing_text: "Danke für den Auftrag." },
      { closing: BAUSTEIN },
    ) as any;
    expect(eigen.custom_closing_text).toBe("Danke für den Auftrag.");
  });
});
