// ============================================================================
// Seitenumbrüche im Beleg-PDF (Kundenmeldung 07.09.2026: „hier bleibt gerade
// eine ganze Seite frei — das darf nicht passieren").
//
// Ein Kapitel/Bereich erzwingt KEINE neue Seite mehr; die Kapitelüberschrift
// bleibt mit der ersten Position zusammen; der Summenblock steht nicht allein
// auf einer sonst leeren Seite. Geprüft am echten PDF (pdfjs liest den Text
// je Seite zurück) mit einem Angebot in der Form der Gartenlaube-Kalkulation:
// drei Kapitel, sechs Aufbauten, sichtbare Artikel-Aufzählungen.
// ============================================================================
import { describe, it, expect, vi } from "vitest";
// Der Supabase-Client wird beim Import des Generators angelegt und versucht in
// Node eine Session aus dem (fehlenden) localStorage zu lesen — hier unnötig.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { generateInvoicePdf } from "./pdfGenerator";

type Zeile = {
  position: number; beschreibung: string; kurztext: string; langtext: string;
  menge: number; einheit: string; einzelpreis: number; gesamtpreis: number;
  gruppe: string | null; auf_pdf: boolean; ist_gruppensumme: boolean; ist_info: boolean;
  bereich: string | null; rabatt_prozent: number; mwst_exempt: boolean;
};

const zeilen: Zeile[] = [];
const add = (z: Partial<Zeile> & { beschreibung: string }) => {
  zeilen.push({
    position: zeilen.length + 1, kurztext: z.beschreibung, langtext: "",
    menge: 1, einheit: "Pauschale", einzelpreis: 0, gesamtpreis: 0,
    gruppe: null, auf_pdf: true, ist_gruppensumme: false, ist_info: false,
    bereich: null, rabatt_prozent: 0, mwst_exempt: false,
    ...z,
  });
};
const kapitel = (name: string) => add({ beschreibung: `Bereich: ${name}`, menge: 0, einheit: "", bereich: name });
const aufbau = (bereich: string, name: string, betrag: number, details: string[]) => {
  add({ beschreibung: name, einzelpreis: betrag, gesamtpreis: betrag, gruppe: name, ist_gruppensumme: true, bereich });
  for (const d of details) add({ beschreibung: d, gruppe: name, bereich, menge: 1, einheit: "Stk.", einzelpreis: 12.5 });
};

kapitel("Allgemein");
aufbau("Allgemein", "Entwurf und Arbeitsvorbereitung", 1819, []);
aufbau("Allgemein", "Vorbereitungen am Grundstück", 3958.5, ["Anliefern der benötigten Baugeräte wie Bagger, Rüttelplatte und Kleingerät"]);
kapitel("Fundamente");
aufbau("Fundamente", "Schraubfundamente (13,00 m²)", 4287.88, []);
kapitel("Holzbau");
aufbau("Holzbau", "Bodenplatte Holz (24,00 m²)", 5626.48, ["BSH Konstruktion Fi NSI ca 1,5 m³", "Bodenbelag Glatt 32/140 LA"]);
aufbau("Holzbau", "Wandelemente (25,00 m²)", 7451.92, [
  "Liefern und Montieren von vorgefertigten Wandelementen in Holzriegelbauweise",
  "Dreischicht - FI - 19 AB", "Riegelkonstruktion 6/12", "DWD - 16 - 63,5x250",
  "Fassadenbahn SIGA Majvest 700 SOB", "Sparschalung 30 mm FI e-62,5 cm",
  "Sparschalung 30 mm FI e-62,5 cm", "Thermo Fichte 20/12HBG",
]);
aufbau("Holzbau", "Dachelemente (31,50 m²)", 6056.87, [
  "Liefern und Montieren von vorgefertigten Dachelementen", "Dreischicht - FI - 19 AB",
  "Riegelkonstruktion 6/20", "Stroh ohne Einblasen (für liegende Bauteile)",
  "25 mm Sägeraue Bretterschalung", "Flachdachfolie EPDM",
]);

const netto = zeilen.reduce((s, z) => s + z.gesamtpreis, 0);
const angebot: any = {
  typ: "angebot", nummer: "A-2026-999", datum: "2026-09-07", status: "entwurf",
  kunde_name: "Test Kunde", kunde_adresse: "Weg 1", kunde_plz: "4000", kunde_ort: "Linz",
  betreff: "Gartenlaube", netto_summe: netto, mwst_satz: 20, mwst_betrag: netto * 0.2, brutto_summe: netto * 1.2,
  zahlungsbedingungen: "", faelligkeitsdatum: null,
  vortext: "Wir freuen uns, Ihnen folgendes Angebot unterbreiten zu dürfen:",
  schlusstext: "Dieses Angebot ist 30 Tage gültig. Wir freuen uns auf Ihre Rückmeldung.",
};

async function seitenTexte(blob: Blob): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), disableFontFace: true }).promise;
  const seiten: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    seiten.push(tc.items.map((i: any) => i.str).join(" "));
  }
  return seiten;
}

describe("Beleg-PDF: Seitenumbrüche bei Kapiteln", () => {
  it("Kapitel erzwingen keine neue Seite — keine fast leere Seite, Summe nicht allein", async () => {
    const seiten = await seitenTexte(await generateInvoicePdf(angebot, zeilen as any));
    // Vorher: 4 Seiten, davon zwei mit je einer Position. Jetzt: höchstens 3.
    expect(seiten.length).toBeLessThanOrEqual(3);
    // Jede Seite trägt mindestens eine Position (Summenblock steht nie allein).
    const positionen = zeilen.filter((z) => z.ist_gruppensumme).map((z) => z.beschreibung.split(" (")[0]);
    for (const [i, text] of seiten.entries()) {
      expect(positionen.some((p) => text.includes(p)), `Seite ${i + 1} ohne Position: ${text.slice(0, 120)}`).toBe(true);
    }
    // Kapitelüberschrift und erste Position bleiben zusammen.
    for (const [name, erste] of [["Fundamente", "Schraubfundamente"], ["Holzbau", "Bodenplatte Holz"]]) {
      const seite = seiten.find((t) => t.includes(erste));
      expect(seite, `${erste} nicht gefunden`).toBeDefined();
      expect(seite!.includes(name)).toBe(true);
    }
  }, 30000);
});
