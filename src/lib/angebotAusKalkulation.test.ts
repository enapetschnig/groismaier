// ============================================================================
// Die Zusagen der Übernahme Kalkulation → Angebot, an denen Geld hängt.
// Jede davon ist schon einmal gebrochen worden — deshalb stehen sie hier fest.
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  buildAngebotItems, calcProjekt, newEmptyState, newMaterialRow, newModule,
  DEFAULT_BETRIEBSDATEN, round2, NEBENKOSTEN_TEXT, bereichsZeilen, type KalkulationState, type KalkModule,
} from "./kalkulationEngine";
import { belegzeileAusKalk, istKalkulationsZeile, type KalkZeile } from "./kalkZuBeleg";
import { belegSummen } from "./belegSummen";

/** Aufbau mit Material und Arbeitszeit — erzeugt Betrag UND Selbstkosten. */
function aufbau(id: number, name: string, opt: Partial<KalkModule> = {}, ek = 10, vk = 13.5): KalkModule {
  const m = newModule(id);
  m.name = name; m.area = 10; m.workers = 1; m.days = 1;
  m.materialRows = [{ ...newMaterialRow(), category: "Platten", product: name, ekPrice: ek, vkPrice: vk }];
  return Object.assign(m, opt);
}
const rechne = (st: KalkulationState) => {
  const projekt = calcProjekt(st, DEFAULT_BETRIEBSDATEN);
  return { projekt, ...buildAngebotItems(projekt) };
};
/** Die Positionen so, wie sie im Beleg landen. */
const alsBeleg = (items: any[]) => items.map((n, i) => belegzeileAusKalk(n as KalkZeile, i + 1));
const netto = (items: any[]) => belegSummen(alsBeleg(items) as any, { mwst_satz: 20 } as any).nettoSumme;

describe("Kalkulation → Angebot: Summen", () => {
  it("Angebotssumme = Projektsumme (ohne optionale Aufbauten)", () => {
    const st = newEmptyState();
    st.modules = [aufbau(1, "Wand"), aufbau(2, "Dach", { isOptional: true }, 20, 27), aufbau(3, "Boden")];
    const { projekt, items } = rechne(st);
    // Der optionale Aufbau steht als INFOPOSITION mit Betrag am Beleg …
    const info = items.find((i) => i.ist_info && i.ist_gruppensumme)!;
    expect(info.gesamtpreis).toBeGreaterThan(0);
    // … zählt aber nicht mit: Angebot = Projekt ohne Optional.
    expect(netto(items)).toBeCloseTo(round2(projekt.ohneOptional.gesamtAdj), 1);
    // Gegenprobe: mit dem optionalen Aufbau wäre es die volle Projektsumme.
    expect(round2(projekt.ohneOptional.gesamtAdj + info.gesamtpreis)).toBeCloseTo(round2(projekt.totalGesamt), 1);
  });

  it("Detailzeilen tragen nie einen Betrag — sonst wäre jeder Aufbau doppelt", () => {
    const st = newEmptyState();
    st.modules = [aufbau(1, "Wand")];
    const { items } = rechne(st);
    const details = items.filter((i) => i.gruppe && !i.ist_gruppensumme);
    expect(details.length).toBeGreaterThan(0);
    for (const d of details) expect(d.gesamtpreis).toBe(0);
    const sammel = items.filter((i) => i.ist_gruppensumme);
    expect(netto(items)).toBeCloseTo(round2(sammel.reduce((s, x) => s + x.gesamtpreis, 0)), 2);
  });

  it("mit Kapiteln bleibt die Summe gleich — Überschriften kosten nichts", () => {
    const bauen = (mitKapitel: boolean) => {
      const st = newEmptyState();
      st.modules = [
        aufbau(1, "Dach A", mitKapitel ? { kapitel: "Dach" } : {}),
        aufbau(2, "Wand", mitKapitel ? { kapitel: "Wand" } : {}, 100, 140),
        aufbau(3, "Dach B", mitKapitel ? { kapitel: "Dach" } : {}, 50, 70),
      ];
      return rechne(st);
    };
    const ohne = bauen(false), mit = bauen(true);
    expect(netto(mit.items)).toBeCloseTo(netto(ohne.items), 2);
    expect(netto(mit.items)).toBeCloseTo(round2(mit.projekt.totalGesamt), 1);
  });
});

describe("Kalkulation → Angebot: Zuordnung je Aufbau", () => {
  it("die Selbstkosten gehören zum RICHTIGEN Aufbau, auch bei verschachtelten Kapiteln", () => {
    const st = newEmptyState();
    // Reihenfolge im Angebot (Dach A, Dach B, Wand) weicht bewusst von der
    // Reihenfolge in der Kalkulation (Dach A, Wand, Dach B) ab.
    st.modules = [
      aufbau(1, "Dach A", { kapitel: "Dach" }, 5, 7),
      aufbau(2, "Wand", { kapitel: "Wand" }, 100, 140),
      aufbau(3, "Dach B", { kapitel: "Dach" }, 50, 70),
    ];
    const { projekt, items } = rechne(st);
    expect(items.filter((i) => i.ist_gruppensumme).map((i) => i.gruppe)).toEqual(["Dach A", "Dach B", "Wand"]);
    for (const s of items.filter((i) => i.ist_gruppensumme)) {
      const eigen = projekt.zeilen.find((z) => z.module.name === s.gruppe)!;
      expect(s.ek_preis, `Selbstkosten von ${s.gruppe}`).toBeCloseTo(round2(eigen.verdienst.selbstkosten), 2);
    }
    // Und sie sind wirklich verschieden — der Test prüft also etwas.
    const werte = items.filter((i) => i.ist_gruppensumme).map((i) => i.ek_preis);
    expect(new Set(werte).size).toBe(3);
  });

  it("Selbstkosten überstehen den Weg in den Beleg", () => {
    const st = newEmptyState();
    st.modules = [aufbau(1, "Wand"), aufbau(2, "Dach", {}, 40, 54)];
    const { items } = rechne(st);
    for (const z of alsBeleg(items).filter((z) => z.ist_gruppensumme)) {
      expect(z.ek_preis).toBeGreaterThan(0);
      expect(z.ek_preis).toBeLessThan(z.gesamtpreis); // Selbstkosten < Verkauf
    }
  });
});

describe("Positionen neu übernehmen: nichts bleibt doppelt stehen", () => {
  const neueTexte = (items: any[]) =>
    new Set(items.filter((n) => !n.gruppe).map((n) => String(n.beschreibung || "").trim()));

  it("die Nebenkosten-Pauschale wird auch dann ersetzt, wenn sie diesmal entfällt", () => {
    // Beleg von früher: Aufbau + Nebenkosten-Pauschale mit Betrag.
    const alterBeleg = [
      { gruppe: "Wand", beschreibung: "Wand" },
      { gruppe: null, beschreibung: NEBENKOSTEN_TEXT },
      { gruppe: null, beschreibung: "Von Hand ergänzt: Bauendreinigung" },
    ];
    // Neuer Durchlauf ohne Nebenkosten (Differenz zu klein).
    const neu = [{ gruppe: "Wand", beschreibung: "Wand" }];
    const texte = neueTexte(neu);
    expect(istKalkulationsZeile(alterBeleg[1], texte, NEBENKOSTEN_TEXT)).toBe(true);   // fliegt raus
    expect(istKalkulationsZeile(alterBeleg[2], texte, NEBENKOSTEN_TEXT)).toBe(false);  // bleibt
  });

  it("umbenannte Kapitel lassen keine alte Überschrift zurück", () => {
    const alt = { gruppe: null, beschreibung: "Bereich: Rohbau" };
    const neu = [{ gruppe: null, beschreibung: "Bereich: Rohbau neu" }];
    expect(istKalkulationsZeile(alt, neueTexte(neu), NEBENKOSTEN_TEXT)).toBe(true);
  });

  it("von Hand ergänzte Positionen bleiben erhalten", () => {
    const texte = neueTexte([{ gruppe: "Wand", beschreibung: "Wand" }]);
    for (const t of ["Zusätzliche Fensterbank", "Regiestunden lt. Vereinbarung", "Bereichsleiter-Zuschlag"]) {
      expect(istKalkulationsZeile({ gruppe: null, beschreibung: t }, texte, NEBENKOSTEN_TEXT), t).toBe(false);
    }
  });
});

describe("Sammelangebot: ein Bereich je Kalkulation", () => {
  const kalkMitKapiteln = () => {
    const st = newEmptyState();
    st.modules = [aufbau(1, "Dach", { kapitel: "Holzbau" }), aufbau(2, "Wand", { kapitel: "Holzbau" }, 30, 40)];
    return rechne(st).items;
  };

  it("Überschrift, eindeutige Gruppen, bereich auf JEDER Zeile", () => {
    const zeilen = bereichsZeilen(kalkMitKapiteln(), "Knapp");
    expect(zeilen[0].beschreibung).toBe("Bereich: Knapp");
    expect(zeilen[0].gesamtpreis).toBe(0);
    for (const z of zeilen) expect(z.bereich, z.beschreibung).toBe("Knapp");
    for (const z of zeilen.filter((x) => x.gruppe)) expect(z.gruppe).toMatch(/ — Knapp$/);
  });

  it("Kapitel werden zur Unterueberschrift, kein zweiter Bereich im Bereich", () => {
    const zeilen = bereichsZeilen(kalkMitKapiteln(), "Knapp");
    const bereichsZeilenImBlock = zeilen.filter((z) => z.beschreibung.startsWith("Bereich: "));
    expect(bereichsZeilenImBlock).toHaveLength(1);           // nur die des Bereichs
    expect(zeilen.some((z) => z.beschreibung === "Holzbau")).toBe(true); // Kapitel als Textzeile
  });

  it("zwei Kalkulationen mit gleichem Aufbaunamen fallen nicht zusammen", () => {
    const a = bereichsZeilen(kalkMitKapiteln(), "Knapp");
    const b = bereichsZeilen(kalkMitKapiteln(), "Gruber");
    const gruppenA = new Set(a.filter((z) => z.gruppe).map((z) => z.gruppe));
    const gruppenB = new Set(b.filter((z) => z.gruppe).map((z) => z.gruppe));
    for (const g of gruppenA) expect(gruppenB.has(g)).toBe(false);
  });

  it("die Summe eines Bereichs bleibt die Summe der Kalkulation", () => {
    const items = kalkMitKapiteln();
    expect(netto(bereichsZeilen(items, "Knapp"))).toBeCloseTo(netto(items), 2);
  });
});

describe("Kein Feld geht beim Übergang verloren", () => {
  /**
   * Der Ursprungsfehler: ein neues Feld (ist_info) wurde in einer von mehreren
   * Zuordnungen vergessen. Dieser Test füllt JEDES Feld einer Kalkulationszeile
   * mit einem erkennbaren Wert und prüft, dass es in der Belegzeile ankommt.
   * Kommt künftig ein Feld dazu, fällt hier auf, wenn es nicht durchgereicht wird.
   */
  const vollstaendig = {
    beschreibung: "Aufbau mit allem",
    menge: 12.5,
    einheit: "m²",
    einzelpreis: 99.5,
    gesamtpreis: 1243.75,
    gruppe: "Aufbau mit allem",
    bereich: "Knapp",
    auf_pdf: true,
    ist_gruppensumme: true,
    ist_info: true,
    ek_preis: 800,
  };

  it("jedes Feld kommt in der Belegzeile an", () => {
    const z = belegzeileAusKalk(vollstaendig as KalkZeile, 7);
    expect(z.position).toBe(7);
    expect(z.beschreibung).toBe(vollstaendig.beschreibung);
    expect(z.menge).toBe(vollstaendig.menge);
    expect(z.einheit).toBe(vollstaendig.einheit);
    expect(z.einzelpreis).toBe(vollstaendig.einzelpreis);
    expect(z.gesamtpreis).toBe(vollstaendig.gesamtpreis);
    expect(z.gruppe).toBe(vollstaendig.gruppe);
    expect(z.bereich).toBe(vollstaendig.bereich);
    expect(z.auf_pdf).toBe(true);
    expect(z.ist_gruppensumme).toBe(true);
    expect(z.ist_info).toBe(true);
    expect(z.ek_preis).toBe(vollstaendig.ek_preis);
    // Wachhund: sobald die Kalkulationszeile ein Feld mehr hat, muss es hier
    // geprüft werden — sonst kann es unbemerkt verloren gehen wie ist_info.
    expect(Object.keys(vollstaendig).sort()).toEqual([
      "auf_pdf", "bereich", "beschreibung", "einheit", "einzelpreis",
      "ek_preis", "gesamtpreis", "gruppe", "ist_gruppensumme", "ist_info", "menge",
    ]);
  });

  it("die echte Kalkulation liefert keine Felder, die niemand abholt", () => {
    const st = newEmptyState();
    st.modules = [aufbau(1, "Wand", { kapitel: "Rohbau", vortext: "Vorher", nachtext: "Nachher", isOptional: true, note: "Notiz" })];
    const { items } = rechne(st);
    const bekannt = new Set(Object.keys(vollstaendig));
    for (const it of items) {
      for (const feld of Object.keys(it)) {
        expect(bekannt.has(feld), `Feld "${feld}" wird von der Kalkulation geliefert, aber nirgends abgeholt`).toBe(true);
      }
    }
  });
});

describe("Rundung: das Angebot weicht nicht von der Kalkulation ab", () => {
  it("auch bei vielen Aufbauten bleibt die Summe centgenau genug", () => {
    const st = newEmptyState();
    // 25 Aufbauten mit krummen Flächen und Preisen — hier häufen sich Rundungen.
    st.modules = Array.from({ length: 25 }, (_, i) => {
      const m = aufbau(i + 1, `Aufbau ${i + 1}`, {}, 7.37 + i * 0.13, 9.9495 + i * 0.1755);
      m.area = 3.33 + i * 1.77;
      m.workers = 1 + (i % 3); m.days = 0.5 + (i % 4) * 0.25;
      m.distanceKM = 17 + i; m.busTrips = i % 3; m.craneHours = (i % 5) * 0.5;
      return m;
    });
    const { projekt, items } = rechne(st);
    const angebot = netto(items);
    const abweichung = Math.abs(round2(angebot - projekt.totalGesamt));
    console.log(`Projekt ${round2(projekt.totalGesamt)} € | Angebot ${angebot} € | Abweichung ${abweichung} €`);
    expect(abweichung).toBeLessThanOrEqual(0.5);
  });
});
