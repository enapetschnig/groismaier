import { describe, it, expect } from "vitest";
import {
  istEntwurfBeleg,
  hatPlatzhalterNummer,
  nummerFuerAnzeige,
  darfAusgegebenWerden,
  darfPlatzhalterNummerTragen,
} from "./belegEntwurf";

describe("Beleg-Entwurf: was darf raus?", () => {
  it("erkennt einen Rechnungs-Entwurf", () => {
    expect(istEntwurfBeleg("rechnung", "entwurf")).toBe(true);
    expect(istEntwurfBeleg("schlussrechnung", "entwurf")).toBe(true);
    expect(istEntwurfBeleg("rechnung", "offen")).toBe(false);
  });

  it("Angebote sind nie Entwurfs-pflichtig — sie bleiben immer änderbar", () => {
    expect(istEntwurfBeleg("angebot", "entwurf")).toBe(false);
    expect(istEntwurfBeleg("lieferschein", "entwurf")).toBe(false);
  });

  it("erkennt die Platzhalter-Nummer", () => {
    expect(hatPlatzhalterNummer("ENTWURF-a3f9c2d1")).toBe(true);
    expect(hatPlatzhalterNummer("2026-044")).toBe(false);
  });

  it("zeigt nie eine Platzhalter-Nummer an", () => {
    expect(nummerFuerAnzeige("ENTWURF-a3f9c2d1")).toBe("Entwurf");
    expect(nummerFuerAnzeige("2026-044")).toBe("2026-044");
  });

  it("ein Entwurf verlässt das Haus NICHT", () => {
    expect(darfAusgegebenWerden({
      istNeu: false, istGeaendert: false, typ: "rechnung", status: "entwurf",
      nummer: "ENTWURF-a3f9c2d1",
    })).toBe(false);
  });

  it("ein ausgestellter, unveränderter Beleg darf raus", () => {
    expect(darfAusgegebenWerden({
      istNeu: false, istGeaendert: false, typ: "rechnung", status: "offen", nummer: "2026-044",
    })).toBe(true);
  });

  it("ungespeicherte Änderungen sperren die Ausgabe", () => {
    expect(darfAusgegebenWerden({
      istNeu: false, istGeaendert: true, typ: "rechnung", status: "offen", nummer: "2026-044",
    })).toBe(false);
  });

  it("Sicherheitsnetz: Platzhalter-Nummer sperrt auch bei Status 'offen'", () => {
    // Genau der Fall, der über die Statusspalte der Belegliste entstehen konnte:
    // Status wurde auf 'offen' gesetzt, ohne dass je eine Nummer gezogen wurde.
    expect(darfAusgegebenWerden({
      istNeu: false, istGeaendert: false, typ: "rechnung", status: "offen",
      nummer: "ENTWURF-a3f9c2d1",
    })).toBe(false);
  });

  it("ein gespeichertes Angebot darf raus (kein Ausstellen nötig)", () => {
    expect(darfAusgegebenWerden({
      istNeu: false, istGeaendert: false, typ: "angebot", status: "offen", nummer: "A-2026-034",
    })).toBe(true);
  });
});

describe("Platzhalter-Nummern: welche Belege dürfen ohne Nummer sein?", () => {
  it("nur rechnungsartige Belege dürfen eine Platzhalter-Nummer tragen", () => {
    for (const typ of ["rechnung", "anzahlungsrechnung", "schlussrechnung", "gutschrift"]) {
      expect(darfPlatzhalterNummerTragen(typ)).toBe(true);
    }
  });

  it("Angebot, AB und Lieferschein NIE — sie haben keinen Erstellen-Schritt", () => {
    // Kundenmeldung 25.08.2026: Ein Angebot mit ENTWURF-Nummer liess sich
    // nie drucken oder senden, weil es die zweite Stufe gar nicht kennt.
    for (const typ of ["angebot", "auftragsbestaetigung", "lieferschein"]) {
      expect(darfPlatzhalterNummerTragen(typ)).toBe(false);
    }
  });

  it("ein Angebot mit echter Nummer darf raus — auch im Status Entwurf", () => {
    expect(darfAusgegebenWerden({
      istNeu: false, istGeaendert: false, typ: "angebot", status: "entwurf", nummer: "A-2026-034",
    })).toBe(true);
  });
});
