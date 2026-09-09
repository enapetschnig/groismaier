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

/**
 * Anzeige-Nummern, die keine Nummer sind — sie haben im Dateinamen nichts
 * verloren. Beim Entwurfsversand hieß der Anhang sonst
 * „wird_beim_Erstellen_vergeben.pdf" (Kundenmeldung 09.09.2026).
 */
const istKeineEchteNummer = (n: string): boolean =>
  /wird\s*beim\s*erstellen|vorläufig|vorlaeufig|^entwurf-|^\(?entwurf\)?$/i.test(n.trim());

export function belegDateiBasis(
  bezeichnung: string | null | undefined,
  nummer: string | null | undefined,
  fallback = "Beleg",
): string {
  const b = sauber(bezeichnung || "");
  const roh = String(nummer || "").trim();
  const n = istKeineEchteNummer(roh) ? "Entwurf" : sauber(roh);
  return [b, n].filter(Boolean).join("_") || fallback;
}
