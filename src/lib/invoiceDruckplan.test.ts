/**
 * Druckplan der Positionstabelle: Was bekommt eine Nummer, was wird gedruckt?
 * Verankert die Regeln, auf die sich PDF und HTML gemeinsam stützen.
 */
import { describe, it, expect } from "vitest";
import { buildDruckplan, istTextzeile } from "./invoiceHtml";

const pos = (p: Partial<any>): any => ({
  position: 1, beschreibung: "Position", menge: 1, einheit: "Stk.",
  einzelpreis: 100, gesamtpreis: 100, ...p,
});
const text = (beschreibung: string, rest: Partial<any> = {}): any =>
  pos({ beschreibung, menge: 0, einheit: "", einzelpreis: 0, gesamtpreis: 0, ...rest });

describe("Textbausteine (Kundenmeldung 25.08.2026)", () => {
  it("erkennt reine Textzeilen — Einheit muss leer sein", () => {
    expect(istTextzeile(text("Sehr geehrte Damen und Herren,"))).toBe(true);
    // Genau der gemeldete Fehler: mit Einheit "Stk." wäre es eine Position
    // und der Beleg druckte "0,00 Stk.".
    expect(istTextzeile({ ...text("Hinweis"), einheit: "Stk." })).toBe(false);
    expect(istTextzeile(pos({ menge: 230, einheit: "m²", einzelpreis: 0, gesamtpreis: 0 }))).toBe(false);
  });

  it("Textbausteine bekommen KEINE Positionsnummer, Positionen zählen weiter", () => {
    const items = [
      text("Sehr geehrte Damen und Herren,"),
      pos({ position: 2, beschreibung: "AW Putz", gesamtpreis: 50839.08 }),
      text("Liefern und Montieren von folgendem Aufbau:"),
      pos({ position: 4, beschreibung: "Zusatzarbeiten", gesamtpreis: 850 }),
    ];
    const plan = buildDruckplan(items);
    const nummern = plan.filter((e) => e.art === "position").map((e: any) => e.nummer);
    expect(nummern).toEqual(["", "01", "", "02"]);
  });

  it("Bestandsschutz: Belege ohne Textzeilen/Gruppen behalten ihre Nummern", () => {
    const items = [
      pos({ position: 7, beschreibung: "Alt-Position A" }),
      pos({ position: 8, beschreibung: "Alt-Position B" }),
    ];
    const plan = buildDruckplan(items);
    expect(plan.map((e: any) => e.nummer)).toEqual(["07", "08"]);
  });

  it("Textbaustein in einer Aufbau-Gruppe bleibt sichtbar und nummernlos", () => {
    const items = [
      pos({ position: 1, beschreibung: "Dach", gruppe: "Dach", ist_gruppensumme: true, gesamtpreis: 1000 }),
      text("Liefern und Montieren:", { gruppe: "Dach" }),
      pos({ position: 3, beschreibung: "OSB", gruppe: "Dach", menge: 100, einheit: "m²", einzelpreis: 0, gesamtpreis: 0 }),
    ];
    const plan = buildDruckplan(items);
    const eintraege = plan.filter((e) => e.art === "position") as any[];
    expect(eintraege).toHaveLength(3);
    expect(eintraege[0].nummer).toBe("01");   // Sammelzeile
    expect(eintraege[1].nummer).toBe("");     // Textbaustein
    expect(eintraege[2].nummer).toBe("");     // Detailzeile
  });
});
