import { describe, it, expect } from "vitest";
import { erkenneSpalten, baueLvAusZellen, normalisiereEinheit, nummerTeile } from "./lvExcel";
import { lvSummen, istBepreisbar } from "./onlv";

// Typische Planer-Tabelle: Titelzeilen, Kopfzeile, LG-/ULG-Überschriften,
// Positionen mit österreichischen Zahlen, eine Summenzeile am Ende.
const blatt = [
  ["Leistungsverzeichnis Zubau Musterhaus"],
  [],
  ["Pos.Nr.", "Bezeichnung", "Menge", "Einh.", "EP", "GP"],
  ["01", "Holzbauarbeiten"],
  ["01.01", "Dachstuhl"],
  ["01.01.01", "Sparren 10/20 Fichte, liefern und montieren", "1.250,50", "lfm", "", ""],
  ["01.01.02", "Pfetten 16/24 BSH", "36", "m", "48,50", "1.746,00"],
  ["01.02", "Fassade"],
  ["01.02.01", "Lärchenschalung 24 mm, sägerau", "185,5", "m2", "", ""],
  ["", "Hinweis: Alle Maße am Bau prüfen"],
  ["", "Summe Holzbauarbeiten", "", "", "", "12.345,00"],
];

describe("LV aus Excel", () => {
  it("erkennt die Kopfzeile und die Spalten", () => {
    const { kopfZeile, zuordnung } = erkenneSpalten(blatt);
    expect(kopfZeile).toBe(2);
    expect(zuordnung).toEqual({ pos: 0, kurztext: 1, langtext: null, menge: 2, einheit: 3, ep: 4 });
  });

  it("baut Positionen mit Gliederung, Mengen und EP-Vorschlag", () => {
    const { kopfZeile, zuordnung } = erkenneSpalten(blatt);
    const lv = baueLvAusZellen(blatt, kopfZeile, zuordnung, "LV_Zubau.xlsx", "Tabelle1");
    expect(lv.programmsystem).toBe("Excel");
    expect(lv.vorhaben).toBe("LV_Zubau");
    const bepreisbar = lv.positionen.filter(istBepreisbar);
    expect(bepreisbar.map((p) => p.nummer)).toEqual(["01.01.01", "01.01.02", "01.02.01"]);
    const sparren = bepreisbar[0];
    expect(sparren.menge).toBe(1250.5);
    expect(sparren.einheit).toBe("lfm");
    expect(sparren.lg).toBe("01"); expect(sparren.lgUeberschrift).toBe("Holzbauarbeiten");
    expect(sparren.ulg).toBe("01"); expect(sparren.ulgUeberschrift).toBe("Dachstuhl");
    expect(sparren.grundtextNr).toBe("01");
    expect(sparren.positionsart).toBe("normal");
    expect(sparren.epSonstiges).toBeNull();
    const pfetten = bepreisbar[1];
    expect(pfetten.epSonstiges).toBe(48.5);
    const schalung = bepreisbar[2];
    expect(schalung.einheit).toBe("m²");
    expect(schalung.ulgUeberschrift).toBe("Fassade");
    // Überschriften und Hinweis sind Vertragstexte, die Summenzeile fehlt
    const texte = lv.positionen.filter((p) => !istBepreisbar(p)).map((p) => p.stichwort);
    expect(texte).toEqual(["Holzbauarbeiten", "Dachstuhl", "Fassade", "Hinweis: Alle Maße am Bau prüfen"]);
    expect(lv.positionen.some((p) => /Summe/.test(p.stichwort))).toBe(false);
    // HTML ist escaped, nicht roh
    expect(lv.positionen.every((p) => !p.langtextHtml.includes("<script"))).toBe(true);
    // Summen laufen wie beim ÖNORM-Import
    const summen = lvSummen(lv.positionen.map((p) => ({
      positionsart: p.positionsart, menge: p.menge, einheit: p.einheit, ep_lohn: null, ep_sonstiges: p.epSonstiges ?? null,
    })));
    expect(summen.netto).toBeCloseTo(36 * 48.5, 2);
  });

  it("rät Spalten ohne Kopfzeile am Inhalt", () => {
    const ohneKopf = [
      ["1.1", "Dachstuhl liefern und montieren", "12,5", "m2"],
      ["1.2", "Lattung 30/50", "300", "lfm"],
      ["1.3", "Kleinmaterial", "1", "psch"],
    ];
    const { kopfZeile, zuordnung } = erkenneSpalten(ohneKopf);
    expect(kopfZeile).toBe(-1);
    expect(zuordnung.pos).toBe(0);
    expect(zuordnung.kurztext).toBe(1);
    expect(zuordnung.menge).toBe(2);
    expect(zuordnung.einheit).toBe(3);
    const lv = baueLvAusZellen(ohneKopf, -1, zuordnung, "lv.xlsx");
    expect(lv.positionen.filter(istBepreisbar)).toHaveLength(3);
    expect(lv.positionen[2].einheit).toBe("Pauschale");
  });

  it("Einheiten und Nummern werden normalisiert", () => {
    expect(normalisiereEinheit("m2")).toBe("m²");
    expect(normalisiereEinheit("Stk")).toBe("Stk.");
    expect(normalisiereEinheit("Std.")).toBe("h");
    expect(normalisiereEinheit("")).toBeNull();
    expect(normalisiereEinheit("Paar")).toBe("Paar");
    expect(nummerTeile("01.02.03A")).toEqual(["01", "02", "03A"]);
    expect(nummerTeile("1-2-3")).toEqual(["1", "2", "3"]);
  });

  it("meldet leere Tabellen verständlich", () => {
    expect(() => baueLvAusZellen([["Pos", "Text"]], 0, { pos: 0, kurztext: 1, langtext: null, menge: null, einheit: null, ep: null }, "x.xlsx"))
      .toThrow(/keine Positionen/);
  });
});
