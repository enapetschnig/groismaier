/**
 * Tests der Aufbau-Kalkulation — Material, Lohn, Aufschlag, Verdienst.
 *
 * Die Kalkulation ist die Grundlage jedes Angebots; ein Fehler hier wandert
 * unbemerkt in den Preis. Deshalb liegen die Rechenwege hier fest.
 */
import { describe, it, expect } from "vitest";
import {
  calcMaterialRow, calcLohnkosten, calcLohnSelbstkosten, calcArbeitsstunden,
  calcFahrtkosten, calcTransport,
  istVolumenEinheit, DEFAULT_BETRIEBSDATEN, round2, calcRiegelPreisProM2,
  zeilenPatchFuerEk, zeilenPatchFuerVk, zeilenVkIstManuell,
  buildAngebotItems, calcProjekt, newEmptyState, newMaterialRow, newModule,
  type MaterialRow, type Betriebsdaten,
} from "./kalkulationEngine";

const bd: Betriebsdaten = { ...DEFAULT_BETRIEBSDATEN };

const zeile = (p: Partial<MaterialRow>): MaterialRow => ({
  category: "Platten", product: "Testartikel",
  ekPrice: 0, vkPrice: 0, actualVK: null,
  manual: false, calc: false, lmPerQm: 0, dimension: 0, dimension2: 0,
  ...p,
});

const modul = { area: 100, wallHeight: 2.5, insulationThickness: 20, aufbauKategorie: "Wand" as const };

describe("Materialzeile", () => {
  it("Katalogpreis gilt als €/m² Aufbaufläche", () => {
    const r = calcMaterialRow(zeile({ ekPrice: 12, vkPrice: 18 }), modul, bd);
    expect(r.ekProM2).toBe(12);
    expect(r.vkProM2).toBe(18);
    expect(r.ekAbsolut).toBe(0);
  });

  it("fehlt der VK, wird er über den Faktor abgeleitet", () => {
    const r = calcMaterialRow(zeile({ ekPrice: 100, vkPrice: 0 }), modul, bd);
    expect(r.vkAbgeleitet).toBe(true);
    expect(r.vkProM2).toBeCloseTo(100 * bd.vkFaktor, 2);
  });

  it("Modus manuell: absoluter Betrag ohne Flächenbezug", () => {
    const r = calcMaterialRow(zeile({ manual: true, ekPrice: 2500, vkPrice: 3000 }), modul, bd);
    expect(r.ekAbsolut).toBe(2500);
    expect(r.vkAbsolut).toBe(3000);
    expect(r.ekProM2).toBe(0);
  });

  it("Modus Holz berechnen: Fläche × lfm/m² × b × h × €/m³", () => {
    // 100 m² × 2 lfm/m² × 0,10 m × 0,20 m × 500 €/m³ = 2.000 €
    const r = calcMaterialRow(
      zeile({ calc: true, lmPerQm: 2, dimension: 10, dimension2: 20, ekPrice: 500 }), modul, bd);
    expect(r.ekAbsolut).toBeCloseTo(2000, 2);
    expect(r.vkAbsolut).toBeCloseTo(2000, 2);
  });

  it("Dämmstoffe: €/m³ wird über die Dämmstärke auf €/m² gebracht", () => {
    // 20 cm Dämmstärke, 150 €/m³ → 0,20 × 150 = 30 €/m²
    const r = calcMaterialRow(
      zeile({ category: "Dämmstoffe", ekPrice: 150, vkPrice: 200 }), modul, bd);
    expect(r.ekProM2).toBeCloseTo(30, 2);
    expect(r.vkProM2).toBeCloseTo(40, 2);
  });

  it("Dämmstoffe ohne Preis liefern nichts statt NaN", () => {
    const r = calcMaterialRow(zeile({ category: "Dämmstoffe", ekPrice: 0, vkPrice: 0 }), modul, bd);
    expect(r.ekProM2).toBe(0);
    expect(r.vkProM2).toBe(0);
  });

  it("Zeile mit NUR Kategorie rechnet mit (Kundenentscheid 25.08.2026)", () => {
    // BV Knapp: frei getippte Positionen trugen den Namen nur in der
    // Kategorie — sie fielen still aus der Summe. Jetzt zählen sie.
    const r = calcMaterialRow(zeile({ product: "", ekPrice: 33, vkPrice: 52.5, vkManuell: true }), modul, bd);
    expect(r.ekProM2).toBe(33);
    expect(r.vkProM2).toBe(52.5);
  });

  it("die ganz leere Zeile bleibt leer", () => {
    const r = calcMaterialRow(zeile({ category: "", product: "", ekPrice: 5, vkPrice: 7 }), modul, bd);
    expect(r.ekProM2).toBe(0);
    expect(r.vkProM2).toBe(0);
  });

  // Christians Rechenweg (Mail 21.08.2026): KVH 60 mm × Wanddicke 240 mm ×
  // 3,5 lfm/m² × m³-Preis × Aufschlag — "das ist dann schon mit Verschnitt
  // und eventuellen Querhölzern". 620 €/m³: 0,06 × 0,24 × 3,5 × 620 = 31,25 €/m².
  it("KVH-Wand rechnet nach Christians Pauschal-Formel inkl. Aufschlag", () => {
    const wand = { ...modul, insulationThickness: 24 };
    const r = calcMaterialRow(zeile({ category: "Riegelkonstruktion", product: "KVH 60 mm", ekPrice: 620, vkPrice: 0 }), wand, bd);
    expect(r.ekProM2).toBeCloseTo(0.06 * 0.24 * 3.5 * 620, 4);       // 31,25 €/m²
    expect(r.vkProM2).toBeCloseTo(0.06 * 0.24 * 3.5 * 620 * 1.35, 4); // × Aufschlag 1,35
    expect(r.vkAbgeleitet).toBe(true);
  });

  it("KVH-Wand: NUR ein explizit manueller VK (€/m³) gewinnt vor dem Aufschlag", () => {
    // Ohne Flag zählt bei Riegel-Zeilen IMMER die Formel — das VK-Feld ist
    // dort gar nicht tippbar, ein Kopierwert darf nie gewinnen.
    const wand = { ...modul, insulationThickness: 24 };
    const r = calcMaterialRow(zeile({ category: "Riegelkonstruktion", product: "KVH 60 mm", ekPrice: 620, vkPrice: 900, vkManuell: true }), wand, bd);
    expect(r.vkProM2).toBeCloseTo(0.06 * 0.24 * 3.5 * 900, 4);
    const ohneFlag = calcMaterialRow(zeile({ category: "Riegelkonstruktion", product: "KVH 60 mm", ekPrice: 620, vkPrice: 900 }), wand, bd);
    expect(ohneFlag.vkProM2).toBeCloseTo(0.06 * 0.24 * 3.5 * 620 * 1.35, 4);
  });

  // Kundenfall (Mail 08/2026): Kategorie "Riegelkonstruktuion" (Tippfehler)
  // mit Artikel "KVH 60 mm" — die Erkennung muss über Kategorie UND
  // Artikelnamen greifen, sonst fließt der m³-Preis 1:1 als €/m² ein.
  it("Riegel-Formel greift über die Kategorie, auch mit Tippfehler", () => {
    const erwartet = calcRiegelPreisProM2(modul.insulationThickness, 20.5, bd);
    expect(erwartet).toBeGreaterThan(0);
    for (const kategorie of ["Riegelkonstruktion", "Riegelkonstruktuion", "riegelkonstruktion "]) {
      const r = calcMaterialRow(zeile({ category: kategorie, product: "KVH 60 mm", ekPrice: 20.5, vkPrice: 0 }), modul, bd);
      expect(r.ekProM2).toBeCloseTo(erwartet, 6);
    }
  });

  it("Riegel-Formel greift weiterhin über den Artikelnamen", () => {
    const erwartet = calcRiegelPreisProM2(modul.insulationThickness, 62.5, bd);
    const r = calcMaterialRow(zeile({ category: "Vollholz", product: "Riegelkonstruktion KVH", ekPrice: 62.5, vkPrice: 0 }), modul, bd);
    expect(r.ekProM2).toBeCloseTo(erwartet, 6);
  });

  it("Dämmstoff-Umrechnung übersteht Case-/Schreibvarianten der Kategorie", () => {
    for (const kategorie of ["Dämmstoffe", "dämmstoffe", "Dämmstoff", "Daemmstoffe", " Dämmstoffe "]) {
      const r = calcMaterialRow(zeile({ category: kategorie, ekPrice: 150, vkPrice: 200 }), modul, bd);
      expect(r.ekProM2).toBeCloseTo(30, 2);
      expect(r.vkProM2).toBeCloseTo(40, 2);
    }
  });

  it("Riegelbretter u.Ä. lösen die Riegelgeometrie NICHT aus", () => {
    const r = calcMaterialRow(zeile({ category: "Riegelbretter", ekPrice: 12, vkPrice: 18 }), modul, bd);
    expect(r.ekProM2).toBe(12);
    expect(r.vkProM2).toBe(18);
  });
});

describe("Mengeneinheit", () => {
  it("erkennt Volumen-Einheiten", () => {
    for (const e of ["m³", "m3", "M³", "fm", "rm"]) expect(istVolumenEinheit(e)).toBe(true);
    for (const e of ["m²", "lfm", "Stk.", "", null]) expect(istVolumenEinheit(e)).toBe(false);
  });

  it("meldet einen €/m³-Artikel, der als €/m² eingesetzt wird", () => {
    // BSH kostet 668,25 €/m³. Als €/m² Wandfläche wäre das grober Unfug —
    // dafür gibt es den Modus Holz berechnen.
    const r = calcMaterialRow(
      zeile({ category: "BSH", product: "Fichte NSI", ekPrice: 495, vkPrice: 668.25, einheit: "m³" }),
      modul, bd);
    expect(r.einheitUnpassend).toBe(true);
  });

  it("m²-Artikel sind unauffällig", () => {
    const r = calcMaterialRow(zeile({ ekPrice: 12, vkPrice: 18, einheit: "m²" }), modul, bd);
    expect(r.einheitUnpassend).toBe(false);
  });

  it("Dämmstoffe rechnen m³ korrekt um und werden nicht gemeldet", () => {
    const r = calcMaterialRow(
      zeile({ category: "Dämmstoffe", ekPrice: 150, vkPrice: 200, einheit: "m³" }), modul, bd);
    expect(r.einheitUnpassend).toBeFalsy();
  });
});

describe("Lohn", () => {
  it("Lohnkosten = Tage × Stunden/Tag × Mittellohn × Arbeiter", () => {
    expect(calcLohnkosten(3, 10, bd)).toBeCloseTo(3 * 10 * bd.stundenProTag * bd.mittellohn, 2);
  });

  it("Selbstkosten nutzen den Selbstkostensatz, nicht den Mittellohn", () => {
    const erloes = calcLohnkosten(3, 10, bd);
    const kosten = calcLohnSelbstkosten(3, 10, bd);
    expect(kosten).toBeLessThan(erloes);
    expect(kosten).toBeCloseTo(3 * 10 * bd.stundenProTag * bd.selbstkostenLohn, 2);
  });

  it("Arbeitsstunden = Tage × Stunden/Tag × Arbeiter", () => {
    expect(calcArbeitsstunden(3, 10, bd)).toBeCloseTo(3 * 10 * bd.stundenProTag, 2);
  });

  it("ohne Arbeiter oder ohne Tage keine Kosten", () => {
    expect(calcLohnkosten(0, 10, bd)).toBe(0);
    expect(calcLohnkosten(3, 0, bd)).toBe(0);
  });

  it("Der Lohn-Verdienst ist die Spanne zwischen Mittellohn und Selbstkosten", () => {
    const verdienst = calcLohnkosten(2, 5, bd) - calcLohnSelbstkosten(2, 5, bd);
    expect(verdienst).toBeGreaterThan(0);
    expect(verdienst).toBeCloseTo(2 * 5 * bd.stundenProTag * (bd.mittellohn - bd.selbstkostenLohn), 2);
  });
});

describe("Fahrten (Kundenwunsch 27.08.2026: Festbetrag / Mindestbetrag)", () => {
  it("km-Staffel wie bisher: (frei × Satz + Maut-km × Mautsatz) × 2 × Anzahl", () => {
    // 60 km bei 55 mautfreien: (55 × 0,8 + 5 × 1,25) × 2 × 2 Fahrten
    expect(calcFahrtkosten(60, 2, bd.busKm, bd.busKmMaut, bd.mautFreiKm))
      .toBeCloseTo((55 * 0.8 + 5 * 1.25) * 2 * 2, 2);
  });

  it("Mindestbetrag je Fahrt greift bei kurzen Strecken", () => {
    // 6 km Bus: 6 × 0,8 × 2 = 9,60 € je Fahrt → Mindestbetrag 30 € gewinnt.
    expect(calcFahrtkosten(6, 2, bd.busKm, bd.busKmMaut, bd.mautFreiKm, 30)).toBeCloseTo(60, 2);
    // Lange Strecke bleibt unberührt vom Mindestbetrag.
    expect(calcFahrtkosten(100, 1, bd.busKm, bd.busKmMaut, bd.mautFreiKm, 30))
      .toBeCloseTo(calcFahrtkosten(100, 1, bd.busKm, bd.busKmMaut, bd.mautFreiKm), 2);
  });

  it("Festbetrag des Aufbaus ersetzt die km-Rechnung komplett", () => {
    const t = calcTransport({ distanceKM: 6, busTrips: 2, lkwTrips: 1, fahrtenFest: 150 }, bd);
    expect(t.total).toBe(150);
    expect(t.pauschal).toBe(true);
    expect(t.bus).toBe(0);
    expect(t.lkw).toBe(0);
  });

  it("ohne Festbetrag rechnet der Aufbau wie bisher", () => {
    const t = calcTransport({ distanceKM: 6, busTrips: 2, lkwTrips: 0, fahrtenFest: 0 }, bd);
    expect(t.pauschal).toBeFalsy();
    expect(t.total).toBeCloseTo(6 * bd.busKm * 2 * 2, 2);
  });
});

describe("Rundung", () => {
  it("round2 rundet kaufmännisch und stabil", () => {
    expect(round2(0.005)).toBe(0.01);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1);
  });
});

describe("Formel-Verbindung in der Materialzeile (Kundenmeldung 24.08.2026)", () => {
  it("Christians KVH-Fall: EK 440 eintippen → 12,47 €/m² statt 11,13", () => {
    // Zeile trug noch den alten Katalog-VK 530 €/m³ — die Anzeige rechnete
    // 3,5 × 0,06 × 0,10 × 530 = 11,13. Nach der EK-Änderung muss der VK
    // mitrechnen: 440 × 1,35 = 594 → 3,5 × 0,06 × 0,10 × 594 = 12,47.
    const alt = zeile({ category: "Riegelkonstruktion", product: "KVH 60 mm", ekPrice: 392.59, vkPrice: 530, katalogEk: 392.59, katalogVk: 530 });
    const neu = { ...alt, ...zeilenPatchFuerEk(alt, 440, bd) };
    const r = calcMaterialRow(neu, { ...modul, insulationThickness: 10 }, bd);
    expect(round2(r.vkProM2)).toBeCloseTo(12.47, 2);
  });

  it("von Hand gesetzter Zeilen-VK bleibt bei EK-Änderung stehen", () => {
    const alt = zeile({ ekPrice: 100, vkPrice: 200, vkManuell: true });
    const patch = zeilenPatchFuerEk(alt, 120, bd);
    expect(patch.vkPrice).toBeUndefined();
  });

  it("Alt-Zeile: VK weicht von der Formel ab → gilt als manuell (CLT 141)", () => {
    // CLT-Fall: EK 105, VK von Hand 141 (Formel wäre 141,75) — bleibt stehen.
    const alt = zeile({ ekPrice: 105, vkPrice: 141 });
    expect(zeilenVkIstManuell(alt, bd)).toBe(true);
    const patch = zeilenPatchFuerEk(alt, 120, bd);
    expect(patch.vkPrice).toBeUndefined();
    const r = calcMaterialRow(alt, modul, bd);
    expect(r.vkProM2).toBe(141);
  });

  it("VERALTETER Kopier-VK rechnet NICHT mehr mit: Riegel-Zeile immer EK × Faktor", () => {
    // Kundenmeldung 24.08. (zweiter Anlauf, "steht immer noch 11,13"):
    // Zeile trug EK 440 und den alten Katalog-VK 530 — OHNE dass irgendwer
    // neu tippt, muss die Rechnung 3,5 × 0,06 × 0,10 × 440 × 1,35 = 12,47
    // liefern. Der VK ist bei Riegel-Zeilen gar nicht tippbar.
    const stale = zeile({ category: "Riegelkonstruktion", product: "KVH 60 mm", ekPrice: 440, vkPrice: 530, katalogVk: 530 });
    const r = calcMaterialRow(stale, { ...modul, insulationThickness: 10 }, bd);
    expect(round2(r.vkProM2)).toBeCloseTo(12.47, 2);
    // Auch ganz ohne Vergleichswert (Alt-Zeile):
    const alt = zeile({ category: "Riegelkonstruktion", product: "KVH 60 mm", ekPrice: 440, vkPrice: 530 });
    expect(round2(calcMaterialRow(alt, { ...modul, insulationThickness: 10 }, bd).vkProM2)).toBeCloseTo(12.47, 2);
  });

  it("normale Zeile: Kopier-VK gleich Formelwert → EK-Änderung rechnet mit", () => {
    // Katalog-Kopie (VK == EK × 1,35): Zeile hängt an der Formel. Der Chef
    // ändert den EK → Patch UND Rechnung liefern den neuen VK.
    const kopie = zeile({ ekPrice: 105, vkPrice: 141.75, katalogVk: 141.75 });
    expect(zeilenVkIstManuell(kopie, bd)).toBe(false);
    const neu = { ...kopie, ...zeilenPatchFuerEk(kopie, 110, bd) };
    expect(neu.vkPrice).toBeCloseTo(148.5, 4);
    expect(calcMaterialRow(neu, modul, bd).vkProM2).toBeCloseTo(148.5, 2);
  });

  it("VK-Feld leeren aktiviert die Formel sofort wieder", () => {
    const alt = zeile({ ekPrice: 105, vkPrice: 200, vkManuell: true });
    const patch = zeilenPatchFuerVk(alt, null, bd);
    expect(patch.vkPrice).toBeCloseTo(105 * 1.35, 4);
    expect(patch.vkManuell).toBe(false);
  });

  it("CLT-Fall: EK ändern rechnet die m²-Summe neu (VK folgt)", () => {
    const alt = zeile({ category: "CLT Deckenelemente", ekPrice: 105, vkPrice: 141.75, katalogVk: 141.75 });
    const neu = { ...alt, ...zeilenPatchFuerEk(alt, 110, bd) };
    const r = calcMaterialRow(neu, modul, bd);
    expect(r.vkProM2).toBeCloseTo(110 * 1.35, 2);
  });
});

describe("Vortext je Aufbau (Kundenwunsch 25.08.2026)", () => {
  it("Einleitungstext steht UNTER der Position, vor den Artikeln", () => {
    const st = newEmptyState();
    const m = newModule(1);
    m.name = "Dachaufbau"; m.area = 100; m.vortext = "Ausführung lt. Besprechung";
    m.materialRows = [{ ...newMaterialRow(), category: "Platten", product: "OSB", ekPrice: 10, vkPrice: 13.5 }];
    st.modules = [m];
    const projekt = calcProjekt(st, DEFAULT_BETRIEBSDATEN);
    const { items } = buildAngebotItems(projekt);
    const iText = items.findIndex((x) => x.beschreibung === "Ausführung lt. Besprechung");
    const iSammel = items.findIndex((x) => x.ist_gruppensumme);
    expect(iText).toBeGreaterThanOrEqual(0);
    // Kunden-Korrektur 25.08.2026: Position zuerst, der Text darunter.
    expect(iText).toBeGreaterThan(iSammel);
    const iArtikel = items.findIndex((x) => x.beschreibung === "OSB");
    if (iArtikel >= 0) expect(iText).toBeLessThan(iArtikel); // vor der Aufzählung
    expect(items[iText].gruppe).toBe(items[iSammel].gruppe); // gleiche Gruppe
    expect(items[iText].gesamtpreis).toBe(0);       // reine Textzeile
    expect(items[iText].menge).toBe(0);
    expect(items[iText].einheit).toBe("");
    // Summen unverändert: der Vortext kostet nichts
    const summe = items.reduce((s, x) => s + x.gesamtpreis, 0);
    expect(round2(summe)).toBeCloseTo(round2(projekt.totalGesamt), 1);
  });

  it("angehakte Artikel erscheinen sichtbar, Nachtext steht nach der Aufzählung", () => {
    const st = newEmptyState();
    const m = newModule(1);
    m.name = "AW Putz"; m.area = 100;
    m.vortext = "Liefern und Montieren von folgendem Aufbau:";
    m.nachtext = "inkl. Befestigungsmaterial";
    m.materialRows = [
      { ...newMaterialRow(), category: "Platten", product: "OSB", ekPrice: 10, vkPrice: 13.5, imAngebot: true },
      { ...newMaterialRow(), category: "Dämmstoffe", product: "Stroh", ekPrice: 100, vkPrice: 135 },
    ];
    st.modules = [m];
    const { items } = buildAngebotItems(calcProjekt(st, DEFAULT_BETRIEBSDATEN));
    const osb = items.find((x) => x.beschreibung === "OSB")!;
    const stroh = items.find((x) => x.beschreibung === "Stroh")!;
    expect(osb.auf_pdf).toBe(true);      // angehakt → sichtbare Aufzählung
    expect(stroh.auf_pdf).toBe(false);   // nicht angehakt → intern wie bisher
    const iNach = items.findIndex((x) => x.beschreibung === "inkl. Befestigungsmaterial");
    const iStroh = items.findIndex((x) => x.beschreibung === "Stroh");
    expect(iNach).toBeGreaterThan(iStroh); // Nachtext NACH der Artikel-Aufzählung
    expect(items[iNach].gesamtpreis).toBe(0);
    expect(items[iNach].auf_pdf).toBe(true);
  });
});

describe("Angebots-Einheit je Aufbau (Kundenwunsch 26.08.2026)", () => {
  const bauAufbau = (patch: Partial<ReturnType<typeof newModule>>) => {
    const m = newModule(1);
    return {
      ...m, name: "Turmdrehkran", area: 1,
      materialRows: [{ ...newMaterialRow(), category: "ÖKran", product: "Montage + Demontage", ekPrice: 2600, vkPrice: 2600, vkManuell: true }],
      ...patch,
    };
  };
  const items = (m: ReturnType<typeof newModule>) => {
    const st = newEmptyState();
    st.modules = [m];
    return buildAngebotItems(calcProjekt(st, DEFAULT_BETRIEBSDATEN)).items;
  };

  it("Pauschale: keine Menge, keine Flaeche im Text", () => {
    // Genau Christians Fall: Fläche 1 ergab bisher "Turmdrehkran (1,00 m²)"
    const summe = items(bauAufbau({ angebotEinheit: "pauschal" })).find((i) => i.ist_gruppensumme)!;
    expect(summe.einheit).toBe("Pauschale");
    expect(summe.menge).toBe(1);
    expect(summe.beschreibung).toBe("Turmdrehkran");   // ohne "(1,00 m²)"
    expect(summe.gesamtpreis).toBeCloseTo(2600, 2);
  });

  it("BESTANDSSCHUTZ: ohne Angabe rechnet alles exakt wie bisher", () => {
    const alt = items(bauAufbau({}));                       // angebotEinheit fehlt
    const auto = items(bauAufbau({ angebotEinheit: "auto" }));
    expect(alt.map((i) => [i.beschreibung, i.menge, i.einheit, i.gesamtpreis]))
      .toEqual(auto.map((i) => [i.beschreibung, i.menge, i.einheit, i.gesamtpreis]));
    const summe = alt.find((i) => i.ist_gruppensumme)!;
    expect(summe.einheit).toBe("m²");                        // wie gehabt
    expect(summe.gesamtpreis).toBeCloseTo(2600, 2);
  });

  it("eigene Einheit: Flaeche bleibt die Menge, Betrag unveraendert", () => {
    const m = bauAufbau({ angebotEinheit: "lfm", area: 40 });
    const summe = items(m).find((i) => i.ist_gruppensumme)!;
    expect(summe.einheit).toBe("lfm");
    expect(summe.menge).toBe(40);
    expect(round2(summe.menge * summe.einzelpreis)).toBeCloseTo(summe.gesamtpreis, 2);
  });

  it("Summe des Angebots bleibt in jeder Variante gleich", () => {
    const gesamt = (e: any) => items(bauAufbau({ angebotEinheit: e })).reduce((s, i) => s + i.gesamtpreis, 0);
    const werte = [gesamt(undefined), gesamt("auto"), gesamt("pauschal"), gesamt("m²"), gesamt("Stk.")];
    for (const w of werte) expect(round2(w)).toBeCloseTo(round2(werte[0]), 2);
  });

  it("optionaler Aufbau wird zur INFOPOSITION (Kundenwunsch 28.08.2026)", () => {
    const summe = items(bauAufbau({ isOptional: true })).find((i) => i.ist_gruppensumme)!;
    expect(summe.beschreibung.startsWith("INFOPOSITION: ")).toBe(true);
    expect(summe.ist_info).toBe(true);
    // Der Betrag bleibt an der Zeile stehen — nur die Belegsumme (belegSummen)
    // lässt ihn aus.
    expect(summe.gesamtpreis).toBeCloseTo(2600, 2);
  });

  it("nicht-optionale Aufbauten bleiben ohne ist_info", () => {
    const summe = items(bauAufbau({})).find((i) => i.ist_gruppensumme)!;
    expect(summe.ist_info).toBeFalsy();
    expect(summe.beschreibung.includes("INFOPOSITION")).toBe(false);
  });
});
