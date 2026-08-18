/**
 * Dateiname eines Beleg-Exports: trägt die freie Bezeichnung am Dokument
 * ("Anzahlungsrechnung") plus Nummer — genau so, wie der Beleg "getauft"
 * wurde (Kundenwunsch 08/2026). Beide Teile werden dateisystemtauglich
 * gemacht; die Nummer kann Anzeige-Zusätze tragen ("2026-044 (Entwurf)").
 */
const sauber = (s: string): string =>
  String(s || "")
    .trim()
    .replace(/[^\wäöüÄÖÜß-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

export function belegDateiBasis(
  bezeichnung: string | null | undefined,
  nummer: string | null | undefined,
  fallback = "Beleg",
): string {
  const b = sauber(bezeichnung || "");
  const n = sauber(nummer || "");
  return [b, n].filter(Boolean).join("_") || fallback;
}
