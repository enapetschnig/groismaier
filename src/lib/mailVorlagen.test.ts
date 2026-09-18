import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { baueBelegMail, anredeFuer, signaturFuer, signaturTauschen, vorlageFuer, platzhalterEinsetzen, standardSignatur, STANDARD_MAIL_TEXT, type MailVorlagen } from "./mailVorlagen";

const CHRISTIAN = "christian.groismaier@cg-holzbau.at";
const OFFICE = "office@cg-holzbau.at";

describe("Beleg-Mail: Standard ohne eigene Vorlagen (wie bisher, aber mit Signatur)", () => {
  it("Anrede, Beleg, Signatur des Postfachs", () => {
    const m = baueBelegMail({ belegTyp: "rechnung", belegBezeichnung: "Rechnung", belegNummer: "2026-044", kundeAnrede: "Frau", kundeName: "Maria Salat", postfach: CHRISTIAN });
    expect(m.betreff).toBe("Rechnung 2026-044");
    expect(m.text.startsWith("Sehr geehrte Frau Salat,\n\nanbei erhalten Sie Rechnung 2026-044.")).toBe(true);
    expect(m.text).toContain("Christian Groismaier\nHolzbaumeister");
    expect(m.text.endsWith("-----------------------------------")).toBe(true);
    // Office: Firmensignatur ohne persönlichen Namen
    expect(baueBelegMail({ belegBezeichnung: "Angebot", belegNummer: "A-1", postfach: OFFICE }).text).not.toContain("Holzbaumeister");
  });
  it("Anrede-Fälle", () => {
    expect(anredeFuer("Herr", "Franz Schindelböck")).toBe("Sehr geehrter Herr Schindelböck,");
    expect(anredeFuer("Firma", "Wallner Holzhandel GmbH")).toBe("Sehr geehrte Damen und Herren,");
    expect(anredeFuer(null, "")).toBe("Sehr geehrte Damen und Herren,");
    expect(anredeFuer("Frau", "  ")).toBe("Sehr geehrte Damen und Herren,");
  });
  it("Entwurf ohne Nummer: kein doppeltes Leerzeichen, kein Leerzeichen vor dem Punkt", () => {
    const m = baueBelegMail({ belegBezeichnung: "Angebot", belegNummer: "", postfach: OFFICE });
    expect(m.betreff).toBe("Angebot");
    expect(m.text).toContain("anbei erhalten Sie Angebot.");
  });
});

describe("Eigene Vorlagen aus dem Admin", () => {
  const vorlagen: MailVorlagen = {
    texte: {
      mail: { mail_text: "{{anrede}}\n\nim Anhang {{belegbezeichnung}} {{nummer}} vom {{datum}}.\n\n{{signatur}}" },
      angebot: { mail_betreff: "Ihr Angebot {{nummer}} – Holzbau Groismaier", mail_text: "{{anrede}}\n\nvielen Dank für Ihre Anfrage, {{kunde_name}}. Anbei unser Angebot {{nummer}}.\n\n{{signatur}}" },
    },
    signaturen: { [CHRISTIAN]: "Liebe Grüße\nChristian" },
  };
  it("Belegtyp geht vor E-Mail-Standard, dieser vor eingebaut", () => {
    expect(vorlageFuer(vorlagen, "angebot", "mail_text")).toContain("vielen Dank für Ihre Anfrage");
    expect(vorlageFuer(vorlagen, "rechnung", "mail_text")).toContain("im Anhang");
    expect(vorlageFuer(vorlagen, "rechnung", "mail_betreff")).toBe("{{belegbezeichnung}} {{nummer}}");
    expect(vorlageFuer({ texte: {}, signaturen: {} }, "rechnung", "mail_text")).toBe(STANDARD_MAIL_TEXT);
  });
  it("Platzhalter werden ersetzt, eigene Signatur gewinnt", () => {
    const m = baueBelegMail({ belegTyp: "angebot", belegBezeichnung: "Angebot", belegNummer: "A-7", kundeAnrede: "Herr", kundeName: "Peter Ertl", postfach: CHRISTIAN, vorlagen, heute: new Date(2026, 8, 18) });
    expect(m.betreff).toBe("Ihr Angebot A-7 – Holzbau Groismaier");
    expect(m.text).toBe("Sehr geehrter Herr Ertl,\n\nvielen Dank für Ihre Anfrage, Peter Ertl. Anbei unser Angebot A-7.\n\nLiebe Grüße\nChristian");
    const r = baueBelegMail({ belegTyp: "rechnung", belegBezeichnung: "Rechnung", belegNummer: "2026-050", postfach: OFFICE, vorlagen, heute: new Date(2026, 8, 18) });
    expect(r.text).toContain("im Anhang Rechnung 2026-050 vom 18.9.2026.");
    expect(r.text.endsWith(standardSignatur(OFFICE))).toBe(true);
  });
  it("unbekannte Platzhalter werden leer, Groß/Klein egal", () => {
    expect(platzhalterEinsetzen("Hallo {{ KUNDE_NAME }} {{gibtsnicht}}!", { kunde_name: "Max" })).toBe("Hallo Max !");
  });
  it("Signatur beim Postfachwechsel tauschen — nur wenn der Text noch damit endet", () => {
    const alt = signaturFuer(CHRISTIAN, vorlagen), neu = signaturFuer(OFFICE, vorlagen);
    expect(signaturTauschen(`Hallo\n\n${alt}`, alt, neu)).toBe(`Hallo\n\n${neu}`);
    expect(signaturTauschen("Hallo\n\nselbst geschrieben", alt, neu)).toBe("Hallo\n\nselbst geschrieben");
  });
});
