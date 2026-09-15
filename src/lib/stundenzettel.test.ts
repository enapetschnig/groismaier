import { describe, it, expect, vi } from "vitest";
// Reine Rechenlogik testen — der Supabase-Client würde in Node ohne localStorage schreien.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: async () => ({ data: null, error: null }) }) } }));
import { stundenzettelZahlen, kontoVorMonat, werktageOhneBuchung } from "./stundenzettel";
import { aggregateByDay } from "./hoursAccounting";

// August 2026: 03.08. ist Montag, 21 Werktage. September: 01.09. Dienstag.
const e = (datum: string, stunden: number, taetigkeit = "Montage", lenk?: { min: number; fahrer?: boolean; beifahrer?: boolean }) => ({
  datum, stunden, taetigkeit,
  lenkzeit_minuten: lenk?.min ?? 0, ist_fahrer: !!lenk?.fahrer, ist_beifahrer: !!lenk?.beifahrer,
});
const saetze = { fahrer: 20, beifahrer: 10 };

describe("Tagesregel (hoursAccounting) — ZA wird abgezogen, nicht neutral", () => {
  it("ZA-Tag: Ist 7,8 · Soll 7,8 · Überstunden 0 · ZA −7,8 · Saldo −7,8", () => {
    const [t] = aggregateByDay([e("2026-09-04", 7.8, "Zeitausgleich")]);
    expect(t).toMatchObject({ ist: 7.8, soll: 7.8, ueberstunden: 0, zeitausgleich: -7.8, saldo: -7.8, istSonderzeit: false });
  });
  it("Urlaubstag: neutral, aber Soll zählt (wie am alten Zettel: 21 Tage × 7,8)", () => {
    const [t] = aggregateByDay([e("2026-08-03", 7.8, "Urlaub")]);
    expect(t).toMatchObject({ ist: 7.8, soll: 7.8, ueberstunden: 0, zeitausgleich: 0, saldo: 0, istSonderzeit: true });
  });
  it("Florian August 2026 wie am alten Zettel: Ist 180,75, Soll 163,8, Diff +16,95", () => {
    const august = [
      ...["03", "04", "05", "06", "07"].map((t) => e(`2026-08-${t}`, 7.8, "Urlaub")),
      e("2026-08-10", 9.25), e("2026-08-11", 9), e("2026-08-12", 9.25), e("2026-08-13", 9.25), e("2026-08-14", 5),
      e("2026-08-17", 9), e("2026-08-18", 9), e("2026-08-19", 10.25), e("2026-08-20", 9.5), e("2026-08-21", 7.5),
      // (27.08. am Foto unscharf: 9,0 ergibt exakt die Zettel-Summe 180,75)
      e("2026-08-24", 11.5), e("2026-08-25", 9.75), e("2026-08-26", 9.75), e("2026-08-27", 9), e("2026-08-28", 4.75),
      e("2026-08-31", 10),
    ];
    const z = stundenzettelZahlen({ jahr: 2026, monat: 8, monatEintraege: august, alleEintraege: august, konto: 89.45, abgeschlossenBis: "2026-08-31", saetze, heute: new Date(2026, 8, 15) });
    expect(z.ist).toBe(180.75);
    expect(z.soll).toBe(163.8);
    expect(z.ueberstunden).toBe(16.95);
    expect(z.zeitausgleich).toBe(0);
    expect(z.gebuchteTage).toBe(21);
    expect(z.werktageOhneBuchung).toEqual([]);
    // Konto 89,45 ist der Stand NACH August → vorher 72,50, wie „Zeitausgleich ALT" am Zettel
    expect(z.kontoVorMonat).toBe(72.5);
    expect(z.kontoNachMonat).toBe(89.45);
    expect(z.monatAbgeschlossen).toBe(true);
  });
});

describe("Kontostand vor dem Monat", () => {
  const alle = [e("2026-08-31", 9), e("2026-09-01", 9), e("2026-09-04", 7.8, "Zeitausgleich"), e("2026-10-01", 9)];
  it("laufender Monat (Stichtag 31.08.): Konto ist der Stand vor September", () => {
    expect(kontoVorMonat(alle, 50, "2026-08-31", 2026, 9)).toBe(50);
  });
  it("Monat danach (Oktober) bei Stichtag 31.08.: September-Saldo kommt dazu", () => {
    // September: +1,2 − 7,8 = −6,6 → vor Oktober 43,40
    expect(kontoVorMonat(alle, 50, "2026-08-31", 2026, 10)).toBe(43.4);
  });
  it("abgeschlossener Monat: Konto minus dessen Saldo", () => {
    expect(kontoVorMonat(alle, 43.4, "2026-09-30", 2026, 9)).toBe(50);
    expect(kontoVorMonat(alle, 43.4, "2026-09-30", 2026, 8)).toBe(50 - 1.2);
  });
  it("ohne Stichtag: alles vor dem Monat zählt", () => {
    expect(kontoVorMonat(alle, 0, null, 2026, 9)).toBe(1.2);
  });
});

describe("Monatszahlen mit Zeitausgleich und Lenkzeit", () => {
  it("ZA verbraucht wird ausgewiesen und vom Konto abgezogen", () => {
    const sept = [e("2026-09-01", 9), e("2026-09-04", 7.8, "Zeitausgleich"), e("2026-09-07", 10, "Montage", { min: 60, fahrer: true }), e("2026-09-08", 8, "Montage", { min: 90, beifahrer: true })];
    const z = stundenzettelZahlen({ jahr: 2026, monat: 9, monatEintraege: sept, alleEintraege: sept, konto: 50, abgeschlossenBis: "2026-08-31", saetze, heute: new Date(2026, 8, 9) });
    expect(z.ist).toBe(34.8);
    expect(z.soll).toBe(31.2);
    expect(z.ueberstunden).toBe(3.6);          // 1,2 + 0 + 2,2 + 0,2
    expect(z.zeitausgleich).toBe(-7.8);
    expect(z.saldo).toBe(-4.2);
    expect(z.kontoVorMonat).toBe(50);
    expect(z.kontoNachMonat).toBe(45.8);
    expect(z.monatAbgeschlossen).toBe(false);
    expect(z.werktageOhneBuchung).toEqual(["2026-09-02", "2026-09-03", "2026-09-09"]);
    expect(z.lenkzeit).toEqual({ minutenFahrer: 60, minutenBeifahrer: 90, betragFahrer: 20, betragBeifahrer: 15, betrag: 35 });
  });
  it("Teilzeit 3 h: Soll und Saldo mit persönlichem Tagessoll", () => {
    const z = stundenzettelZahlen({ jahr: 2026, monat: 9, monatEintraege: [e("2026-09-01", 2.5), e("2026-09-02", 3, "Zeitausgleich")], alleEintraege: [], konto: 0, abgeschlossenBis: "2026-08-31", saetze, sollJeTag: 3, heute: new Date(2026, 8, 2) });
    expect(z.soll).toBe(6);
    expect(z.ueberstunden).toBe(-0.5);
    expect(z.zeitausgleich).toBe(-3);
    expect(z.kontoNachMonat).toBe(-3.5);
  });
  it("Einträge außerhalb des Monats werden ignoriert", () => {
    const z = stundenzettelZahlen({ jahr: 2026, monat: 9, monatEintraege: [e("2026-08-31", 12), e("2026-09-01", 9)], alleEintraege: [], konto: 0, abgeschlossenBis: null, saetze, heute: new Date(2026, 8, 1) });
    expect(z.ist).toBe(9);
    expect(z.gebuchteTage).toBe(1);
  });
});

describe("werktageOhneBuchung", () => {
  it("nur Mo–Fr, nur bis heute, Wochenende nie", () => {
    expect(werktageOhneBuchung(2026, 9, [e("2026-09-01", 8)], new Date(2026, 8, 7))).toEqual(["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"]);
    expect(werktageOhneBuchung(2026, 9, [], new Date(2026, 7, 20))).toEqual([]);   // Monat noch nicht begonnen
    expect(werktageOhneBuchung(2026, 9, [], new Date(2026, 8, 7), 0)).toEqual([]);  // ohne Soll keine Lücken
  });
});
