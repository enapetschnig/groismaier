// @vitest-environment happy-dom
/**
 * ÖNORM-A-2063-Parser — getestet mit den zwei ECHTEN Ausschreibungsdateien
 * (beide Schema-Versionen, zwei verschiedene AVA-Programme):
 *   fixtures/onlv_2021_bruecke.onlv     iTWO,  Schema 2021-03-01, 1 Position
 *   fixtures/onlv_2015_zimmermann.onlv  ABK8,  Schema 2015-07-15, 49 Positionen
 *     (Grafik-Base64 gekürzt — der Parser liest keine Grafikdaten)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOnlv, lvSummen, positionspreis, epGesamt, istBepreisbar, OnlvFehler } from "./onlv";

const lade = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

const bruecke = parseOnlv(lade("onlv_2021_bruecke.onlv"));
const zimmermann = parseOnlv(lade("onlv_2015_zimmermann.onlv"));

describe("Schema 2021-03-01 (iTWO, Brückenbau)", () => {
  it("liest die Kenndaten", () => {
    expect(bruecke.schemaVersion).toBe("2021-03-01");
    expect(bruecke.lvcode).toBe("002");
    expect(bruecke.lvbezeichnung).toBe("Brückenbau");
    expect(bruecke.auftraggeberName).toBe("Swietelsky AG");
    expect(bruecke.auftraggeberAdresse).toBe("Rudmanns 142, 3910 Zwettl");
    expect(bruecke.waehrung).toBe("EUR");
  });

  it("baut die Positionsnummer aus LG.ULG.Grundtext+Folge", () => {
    expect(bruecke.positionen).toHaveLength(1);
    const p = bruecke.positionen[0];
    expect(p.nummer).toBe("93.01.01A");
    expect(p.lgUeberschrift).toBe("Brückenbauarbeiten");
    expect(p.ulgUeberschrift).toBe("Brückenkonstruktion");
    expect(p.stichwort).toBe("Brückenkonstruktion Breitenwaida");
    expect(p.einheit).toBe("PA");
    expect(p.menge).toBe(1);
    expect(p.positionsart).toBe("normal");
  });

  it("erhält den Langtext mit Absätzen (Vertragsinhalt)", () => {
    const html = bruecke.positionen[0].langtextHtml;
    expect(html).toContain("<p>Herstellen, Liefern und Montieren");
    expect(html).toContain("moosgrün RAL 6005");
    // Keine Attribute, keine fremden Tags
    expect(html).not.toContain("<langtext");
    expect(html).not.toMatch(/<p [^>]/);
  });
});

describe("Schema 2015-07-15 (ABK, Zimmermann-LV)", () => {
  it("liest alle Positionen beider Bauarten (folge + ungeteilt)", () => {
    expect(zimmermann.schemaVersion).toBe("2015-07-15");
    expect(zimmermann.vorhaben).toBe("Wohnhaus Nesper-Adelhelm Bach");
    // 42 Folgepositionen + 7 ungeteilte
    expect(zimmermann.positionen).toHaveLength(49);
    expect(zimmermann.positionen.filter((p) => p.ftnr === null)).toHaveLength(7);
  });

  it("unterscheidet die Positionsarten", () => {
    const arten = zimmermann.positionen.reduce<Record<string, number>>((acc, p) => {
      acc[p.positionsart] = (acc[p.positionsart] || 0) + 1;
      return acc;
    }, {});
    // 16 Positionen tragen ein pzzv: 13 normal (11 normalposition-Tags +
    // 2 Wahl zählen extra), 2 Wahl, 1 Eventual — Rest ist Vertragstext.
    expect(arten.wahl).toBe(2);
    expect(arten.eventual).toBe(1);
    expect(arten.normal).toBe(13);
    expect(arten.text).toBe(33);
  });

  it("Textpositionen sind nicht bepreisbar, echte Positionen schon", () => {
    const echte = zimmermann.positionen.filter(istBepreisbar);
    expect(echte).toHaveLength(16);
    for (const p of echte) {
      expect(p.einheit).toBeTruthy();
      expect(p.menge).toBeGreaterThan(0);
    }
  });

  it("liest Vorbemerkungen auf ULG-Ebene", () => {
    expect(zimmermann.vorbemerkungen.length).toBeGreaterThan(0);
    const avb = zimmermann.vorbemerkungen.find((v) => v.html.includes("AVB"));
    expect(avb).toBeTruthy();
  });

  it("die Reihenfolge folgt der Datei", () => {
    const sorts = zimmermann.positionen.map((p) => p.sort);
    expect(sorts).toEqual([...sorts].sort((a, b) => a - b));
  });
});

describe("Fehlerfälle", () => {
  it("weist Nicht-ÖNORM-Dateien ab", () => {
    expect(() => parseOnlv("<html><body>hallo</body></html>")).toThrow(OnlvFehler);
    expect(() => parseOnlv("kein xml")).toThrow(OnlvFehler);
  });

  it("weist eine ÖNORM-Datei ohne Positionen ab", () => {
    expect(() =>
      parseOnlv('<onlv xmlns="http://www.oenorm.at/schema/A2063/2021-03-01"><ausschreibungs-lv></ausschreibungs-lv></onlv>')
    ).toThrow(OnlvFehler);
  });
});

describe("Summenlogik", () => {
  const pos = (art: "normal" | "wahl" | "eventual", menge: number, lohn: number, sonst: number) => ({
    positionsart: art, menge, einheit: "m2", ep_lohn: lohn, ep_sonstiges: sonst,
  });

  it("nur Normalpositionen zählen in die Angebotssumme", () => {
    const s = lvSummen([
      pos("normal", 130, 20, 15),   // 130 × 35 = 4.550
      pos("wahl", 30, 10, 10),      // 600 — getrennt
      pos("eventual", 40, 5, 5),    // 400 — getrennt
    ]);
    expect(s.netto).toBe(4550);
    expect(s.wahl).toBe(600);
    expect(s.eventual).toBe(400);
    expect(s.lohnanteil).toBe(2600); // 130 × 20
  });

  it("zählt bepreist vs. bepreisbar für die Fortschrittsanzeige", () => {
    const s = lvSummen([
      pos("normal", 10, 5, 5),
      { positionsart: "normal", menge: 10, einheit: "m2", ep_lohn: null, ep_sonstiges: null },
      { positionsart: "text", menge: null, einheit: null, ep_lohn: null, ep_sonstiges: null },
    ]);
    expect(s.bepreisbar).toBe(2);
    expect(s.bepreist).toBe(1);
  });

  it("Positionspreis rundet kaufmännisch auf Cent", () => {
    // 3,33 × 3 = 9,99; 0,105 × 100 = 10,5 — keine Gleitkomma-Artefakte
    expect(positionspreis({ positionsart: "normal", menge: 3, einheit: "m", ep_lohn: 1.11, ep_sonstiges: 2.22 })).toBe(9.99);
    expect(epGesamt({ positionsart: "normal", menge: 1, einheit: "m", ep_lohn: 0.1, ep_sonstiges: 0.2 })).toBe(0.3);
  });

  it("nur ein Preisanteil erfasst → zählt trotzdem als bepreist", () => {
    const s = lvSummen([pos("normal", 10, 0, 12)]);
    expect(s.netto).toBe(120);
    expect(s.bepreist).toBe(1);
  });
});
