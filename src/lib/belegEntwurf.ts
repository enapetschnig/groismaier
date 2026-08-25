/**
 * Entwurf oder ausgestellt? — eine Quelle der Wahrheit.
 *
 * Rechnungsartige Belege durchlaufen seit 08/2026 zwei Stufen: Ein ENTWURF ist
 * beliebig änderbar, trägt nur eine Platzhalter-Nummer (`ENTWURF-…`) und hat
 * KEINE laufende Nummer gezogen. Erst „Rechnung erstellen" macht daraus einen
 * ausgestellten Beleg.
 *
 * Daraus folgen drei Regeln, die überall gelten müssen:
 *   1. Ein Entwurf verlässt das Haus nicht (kein PDF, Druck, Export, Mail,
 *      E-Rechnung, keine Ablage im Projektordner).
 *   2. Ein Entwurf wechselt seinen Status nur über das Ausstellen — kein
 *      „auf bezahlt setzen", keine Zahlungsbuchung.
 *   3. Ein Entwurf zählt in keiner Auswertung mit (Umsatz, offene Posten,
 *      Nachkalkulation).
 */

/** Belegarten mit Ausstellungspflicht (Steuerdokumente). */
export const RECHNUNGSARTIGE_BELEGE = new Set([
  "rechnung",
  "anzahlungsrechnung",
  "schlussrechnung",
  "gutschrift",
]);

/** Präfix der Platzhalter-Nummer, solange nichts ausgestellt ist. */
export const ENTWURF_NUMMER_PRAEFIX = "ENTWURF-";

/**
 * Darf dieser Belegtyp überhaupt eine Platzhalter-Nummer tragen?
 *
 * NUR rechnungsartige Belege — sie allein kennen die zweite Stufe
 * („Rechnung erstellen"), die den Platzhalter gegen die laufende Nummer
 * tauscht. Angebote, Auftragsbestätigungen und Lieferscheine starten zwar
 * ebenfalls im Status „entwurf" (nur für die Belegliste), haben aber keinen
 * Erstellen-Schritt: Mit Platzhalter blieben sie für immer ohne Nummer und
 * ließen sich weder drucken noch senden (Kundenmeldung 25.08.2026).
 */
export function darfPlatzhalterNummerTragen(typ: string | null | undefined): boolean {
  return RECHNUNGSARTIGE_BELEGE.has(String(typ || ""));
}

/** Ist der Beleg ein noch nicht ausgestellter Entwurf? */
export function istEntwurfBeleg(
  typ: string | null | undefined,
  status: string | null | undefined,
): boolean {
  return RECHNUNGSARTIGE_BELEGE.has(String(typ || "")) && String(status || "") === "entwurf";
}

/** Trägt der Beleg nur eine Platzhalter-Nummer (noch keine laufende Nummer)? */
export function hatPlatzhalterNummer(nummer: string | null | undefined): boolean {
  return String(nummer || "").startsWith(ENTWURF_NUMMER_PRAEFIX);
}

/**
 * Belegnummer für die Anzeige: Platzhalter werden nie gezeigt.
 * @param leerWert was statt der Platzhalter-Nummer erscheinen soll
 */
export function nummerFuerAnzeige(
  nummer: string | null | undefined,
  leerWert = "Entwurf",
): string {
  if (hatPlatzhalterNummer(nummer)) return leerWert;
  return nummer || "—";
}

/**
 * Darf der Beleg ausgegeben werden (drucken, exportieren, senden)?
 * Nur wenn er gespeichert, ausgestellt und seither unverändert ist.
 */
export function darfAusgegebenWerden(opts: {
  istNeu: boolean;
  istGeaendert: boolean;
  typ: string | null | undefined;
  status: string | null | undefined;
  nummer?: string | null;
}): boolean {
  if (opts.istNeu || opts.istGeaendert) return false;
  if (istEntwurfBeleg(opts.typ, opts.status)) return false;
  // Sicherheitsnetz: eine Platzhalter-Nummer bedeutet immer „nicht ausgestellt",
  // auch wenn der Status durch einen Altbestand oder Fehler anders aussieht.
  if (hatPlatzhalterNummer(opts.nummer)) return false;
  return true;
}
