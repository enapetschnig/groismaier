/**
 * Gemeinsame Regeln für "eigene Arbeitsstunden" — an EINER Stelle, damit
 * Stundenabgleich (Projekt + Nachkalkulation) und alle weiteren
 * Auswertungen dieselbe Sprache sprechen.
 */

/** Einheit ist eine Stunden-Einheit (Std, Std., h, Stunde, Stunden)? */
export const istStundenEinheit = (einheit: string | null | undefined) =>
  /^(std|std\.|h|stunde|stunden)$/i.test(String(einheit || "").trim());

/**
 * Name eines klassischen eigenen Lohn-/Gerätesatzes: Facharbeiterstunde,
 * Regiestunde, Lehrling Stunde, Baumeisterstunde, Kranfahrer, LKW mit Hiab,
 * Maschinenstunde …
 *
 * Bewusst NICHT erfasst: zugekaufte Leistungen, die zufällig eine
 * Std-Einheit tragen — z.B. „Fassadengerüst An-und Abtransport in Regie"
 * oder „Zellulose Helfer" (Fremdleistungen, keine eigenen Arbeitsstunden).
 */
export const istStundensatzName = (name: string | null | undefined) =>
  // "arbeitszeit": die Aufbau-Kalkulation schreibt die angebotenen Stunden
  // als Zeile „Arbeitszeit: X Tage × Y Arbeiter" (Einheit h, Menge =
  // Gesamtstunden) ins Angebot — ohne dieses Muster war das Stunden-Soll
  // bei allen Kalkulations-Angeboten 0 (Kundenwunsch Stundenabgleich).
  // Meldung 16.09.2026 (BV Schindelböck): „Zimmerer Vorarbeiter 50 Std." und
  // „Zimmerer Hilfsarbeiter 50 Std." zählten nicht — nur Facharbeiter und
  // Lehrling waren bekannt, das Soll stand bei 100 statt 200 Std. Jetzt jeder
  // Personalbegriff (…arbeiter deckt Vor-/Fach-/Hilfsarbeiter ab).
  /(stunden?\b|arbeitszeit|arbeiter|zimmerer|zimmermann|polier|monteur|partie|geselle|lehrling|baumeister|kranfahrer|hiab)/i.test(String(name || ""));

/**
 * Angebots-/Rechnungszeile = explizit angebotene eigene Arbeitszeit?
 * (z.B. „Facharbeiterstunde × 25 Std") — zählt 1:1 ins Stunden-Soll.
 */
export const istArbeitszeitZeile = (
  name: string | null | undefined,
  einheit: string | null | undefined,
) => istStundenEinheit(einheit) && istStundensatzName(name);
