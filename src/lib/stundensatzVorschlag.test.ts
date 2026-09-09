import { describe, it, expect } from "vitest";
import { saetzeAusAngebot, satzFuer, qualifikationAus, istStundenPosition } from "./stundensatzVorschlag";
import type { RegieSatz } from "./regieSaetze";

const stammdaten: RegieSatz[] = [
  { id: "1", gruppe: "personal", bezeichnung: "Vorarbeiter", betrag: 85, einheit: "Std", sort: 10, aktiv: true },
  { id: "2", gruppe: "personal", bezeichnung: "Facharbeiter", betrag: 75, einheit: "Std", sort: 20, aktiv: true },
  { id: "3", gruppe: "personal", bezeichnung: "Hilfsarbeiter", betrag: 70, einheit: "Std", sort: 30, aktiv: true },
  { id: "4", gruppe: "personal", bezeichnung: "Lehrling 1. LJ", betrag: 35, einheit: "Std", sort: 40, aktiv: true },
  { id: "5", gruppe: "fahrzeug", bezeichnung: "Montagebus", betrag: 1.2, einheit: "km", sort: 10, aktiv: true },
];

describe("Stundensatz-Vorschlag: das Angebot gewinnt", () => {
  it("erkennt Stundenpositionen an der Einheit", () => {
    expect(istStundenPosition({ einheit: "h", einzelpreis: 70 })).toBe(true);
    expect(istStundenPosition({ einheit: "Std.", einzelpreis: 70 })).toBe(true);
    expect(istStundenPosition({ einheit: "Stunden", einzelpreis: 70 })).toBe(true);
    expect(istStundenPosition({ einheit: "m²", einzelpreis: 70 })).toBe(false);
    expect(istStundenPosition({ einheit: "h", einzelpreis: 0 })).toBe(false);
  });

  it("erkennt die Qualifikation im Text", () => {
    expect(qualifikationAus("Zimmerer Facharbeiter")).toBe("facharbeiter");
    expect(qualifikationAus("Vorarbeiter / Polier")).toBe("vorarbeiter");
    expect(qualifikationAus("Zimmerer Lehrling 1. LJ")).toBe("lehrling");
    expect(qualifikationAus("Hilfsarbeiter")).toBe("hilfsarbeiter");
    expect(qualifikationAus("Kranstunden")).toBeNull();
  });

  it("nimmt den Satz aus dem Angebot, auch wenn die Stammdaten anders sagen", () => {
    // Im Angebot wurden 82 € für den Facharbeiter zugesagt, Stammdaten sagen 75.
    const ausAngebot = saetzeAusAngebot([
      { beschreibung: "Zimmerer Facharbeiter", einheit: "h", einzelpreis: 82 },
      { beschreibung: "Zimmerer Lehrling 1. LJ", einheit: "h", einzelpreis: 38 },
      { beschreibung: "Außenwand", einheit: "m²", einzelpreis: 300 },
    ]);
    const fach = satzFuer("Regiestunden Facharbeiter", ausAngebot, stammdaten, 70);
    expect(fach.betrag).toBe(82);
    expect(fach.herkunft).toBe("angebot");
    const lehr = satzFuer("Lehrling", ausAngebot, stammdaten, 70);
    expect(lehr.betrag).toBe(38);
  });

  it("ohne passende Angebotszeile greifen die Stammdaten", () => {
    const ausAngebot = saetzeAusAngebot([{ beschreibung: "Zimmerer Facharbeiter", einheit: "h", einzelpreis: 82 }]);
    const vor = satzFuer("Vorarbeiter Regie", ausAngebot, stammdaten, 70);
    expect(vor.betrag).toBe(85);
    expect(vor.herkunft).toBe("stammdaten");
  });

  it("ohne erkennbare Qualifikation: der im Angebot am haeufigsten verwendete Satz", () => {
    const ausAngebot = saetzeAusAngebot([
      { beschreibung: "Montagestunden", einheit: "h", einzelpreis: 78 },
      { beschreibung: "Montagestunden", einheit: "h", einzelpreis: 78 },
      { beschreibung: "Sonderstunden", einheit: "h", einzelpreis: 95 },
    ]);
    const s = satzFuer("Regiearbeiten laut Bericht", ausAngebot, stammdaten, 70);
    expect(s.betrag).toBe(78);
    expect(s.herkunft).toBe("angebot");
  });

  it("ohne Angebot und ohne Stammdaten bleibt die Einstellung", () => {
    const s = satzFuer("Regiearbeiten", new Map(), [], 70);
    expect(s.betrag).toBe(70);
    expect(s.herkunft).toBe("einstellung");
  });

  it("Fahrzeug-Saetze werden nicht als Stundensatz vorgeschlagen", () => {
    const s = satzFuer("Montagebus", new Map(), stammdaten, 70);
    expect(s.betrag).toBe(70);      // nicht 1,20
    expect(s.herkunft).toBe("einstellung");
  });

  it("ein Angebot ohne Stundenpositionen liefert keine Saetze", () => {
    const ausAngebot = saetzeAusAngebot([{ beschreibung: "Außenwand", einheit: "m²", einzelpreis: 300 }]);
    expect(ausAngebot.size).toBe(0);
  });
});
