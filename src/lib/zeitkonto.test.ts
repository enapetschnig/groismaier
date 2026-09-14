import { describe, it, expect } from "vitest";
import { zeitraumSaldo, laufenderSaldo, naechsterAbschluss, istAbgeschlossen } from "./zeitkonto";

// 2026-09-01 ist ein Dienstag; 05./06.09. Wochenende.
const e = (datum: string, stunden: number, taetigkeit = "Montage") => ({ datum, stunden, taetigkeit });

describe("zeitraumSaldo — die Rechnung des Monatsabschlusses", () => {
  it("Arbeitstag: Ist − 7,8", () => {
    const s = zeitraumSaldo([e("2026-09-01", 9)]);
    expect(s.ueberstunden).toBe(1.2); expect(s.zeitausgleich).toBe(0); expect(s.gesamt).toBe(1.2);
  });
  it("Freitag 5 h anwesend → −2,8; ganze Woche Mo–Do 9 h + Fr 5 h → +2,0", () => {
    expect(zeitraumSaldo([e("2026-09-04", 5)]).gesamt).toBe(-2.8);
    const woche = [e("2026-08-31", 9), e("2026-09-01", 9), e("2026-09-02", 9), e("2026-09-03", 9), e("2026-09-04", 5)];
    expect(zeitraumSaldo(woche).gesamt).toBe(2);
  });
  it("ganzer Zeitausgleich-Tag zählt −7,8 (kein Soll offen)", () => {
    const s = zeitraumSaldo([e("2026-09-04", 7.8, "Zeitausgleich")]);
    expect(s.zeitausgleich).toBe(-7.8); expect(s.ueberstunden).toBe(0); expect(s.gesamt).toBe(-7.8);
  });
  it("halber ZA + Arbeit: ZA −4, Rest-Soll 3,8 gegen 5 h gearbeitet", () => {
    const s = zeitraumSaldo([e("2026-09-01", 4, "Zeitausgleich"), e("2026-09-01", 5)]);
    expect(s.zeitausgleich).toBe(-4); expect(s.ueberstunden).toBe(1.2); expect(s.gesamt).toBe(-2.8);
  });
  it("nur 4 h ZA gebucht, sonst nichts: der Tag fehlt um 7,8", () => {
    expect(zeitraumSaldo([e("2026-09-01", 4, "Zeitausgleich")]).gesamt).toBe(-7.8);
  });
  it("Urlaub, Krankenstand, Feiertag sind neutral", () => {
    expect(zeitraumSaldo([e("2026-09-07", 7.8, "Urlaub")]).gesamt).toBe(0);
    expect(zeitraumSaldo([e("2026-09-07", 7.8, "Krankenstand"), e("2026-09-08", 10)]).gesamt).toBe(2.2);
  });
  it("Wochenende: Soll 0, alles Überstunden", () => {
    expect(zeitraumSaldo([e("2026-09-05", 4)]).gesamt).toBe(4);
  });
  it("mehrere Einträge am selben Tag werden zusammengezählt", () => {
    expect(zeitraumSaldo([e("2026-09-01", 4), e("2026-09-01", 4)]).gesamt).toBe(0.2);
  });
  it("Zeitraum-Grenzen von/bis sind inklusiv", () => {
    const es = [e("2026-08-31", 9), e("2026-09-01", 9), e("2026-09-30", 9), e("2026-10-01", 9)];
    const s = zeitraumSaldo(es, "2026-09-01", "2026-09-30");
    expect(s.tage).toBe(2); expect(s.gesamt).toBe(2.4);
  });
  it("Sebastian September 2026: nur der Eintrag vom 04.09. zählt als ZA", () => {
    const sept = [e("2026-09-01", 9), e("2026-09-02", 9.5), e("2026-09-03", 5.5), e("2026-09-04", 7.8, "Zeitausgleich"),
      e("2026-09-07", 7.5), e("2026-09-07", 1), e("2026-09-07", 1.25), e("2026-09-08", 10), e("2026-09-10", 10)];
    const s = zeitraumSaldo(sept);
    expect(s.zeitausgleich).toBe(-7.8);
    expect(s.ueberstunden).toBe(6.95);
    expect(s.gesamt).toBe(-0.85);
  });
});

describe("laufenderSaldo — alles nach dem Stichtag", () => {
  it("lässt abgeschlossene Tage weg", () => {
    const es = [e("2026-08-31", 12), e("2026-09-01", 9)];
    expect(laufenderSaldo(es, "2026-08-31").gesamt).toBe(1.2);
    expect(laufenderSaldo(es, null).gesamt).toBe(5.4);
  });
});

describe("naechsterAbschluss", () => {
  it("der Monat nach dem Stichtag, mit Jahreswechsel", () => {
    const s = naechsterAbschluss("2026-08-31", new Date(2026, 8, 14));
    expect(s).toMatchObject({ jahr: 2026, monat: 9, von: "2026-09-01", bis: "2026-09-30", label: "September 2026", abschliessbar: false });
    expect(naechsterAbschluss("2026-08-31", new Date(2026, 9, 1)).abschliessbar).toBe(true);
    expect(naechsterAbschluss("2026-12-31", new Date(2027, 1, 3))).toMatchObject({ jahr: 2027, monat: 1, bis: "2027-01-31", label: "Jänner 2027" });
  });
  it("ohne Stichtag: der Vormonat von heute", () => {
    expect(naechsterAbschluss(null, new Date(2026, 8, 14))).toMatchObject({ monat: 8, label: "August 2026", abschliessbar: true });
    expect(naechsterAbschluss(null, new Date(2026, 0, 5))).toMatchObject({ jahr: 2025, monat: 12 });
  });
});

describe("istAbgeschlossen", () => {
  it("sperrt Datum bis einschließlich Stichtag", () => {
    expect(istAbgeschlossen("2026-08-31", "2026-08-31")).toBe(true);
    expect(istAbgeschlossen("2026-09-01", "2026-08-31")).toBe(false);
    expect(istAbgeschlossen("2026-08-01", null)).toBe(false);
  });
});
