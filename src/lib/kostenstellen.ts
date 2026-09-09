/**
 * Kostenstellen — Beschriftung und Symbol an EINER Stelle.
 *
 * Hintergrund: `time_entries.location_type` kennt per DB-CHECK nur zwei Werte
 * ('baustelle', 'werkstatt'). Die eigentliche Kostenstelle steht in
 * `time_entries.kostenstelle` und ist frei erweiterbar (Fuhrpark, Maschinen,
 * und alles, was im KFZ-Manager oder im Admin-Bereich dazukommt).
 *
 * Die Auswertungen zeigten bisher nur `location_type` — jede Kostenstelle
 * außer „Baustelle" erschien deshalb pauschal als „🏢 Firma". Fuhrpark- und
 * Maschinenstunden wären damit unsichtbar geblieben. Diese Datei liefert die
 * feine Beschriftung mit dem groben Wert als Rückfalloption.
 */

export interface KostenstelleOption {
  wert: string;
  label: string;
}

/** Symbole der bekannten Kostenstellen. Unbekannte bekommen einen Pin. */
export const KOSTENSTELLEN_ICONS: Record<string, string> = {
  baustelle: "🏗️",
  werkstatt: "🏢",
  lagerwerkstatt: "🧰",
  lagerplatz: "📦",
  fuhrpark: "🚚",
  maschinen: "⚙️",
  buero_chef: "💼",
  buero_verwaltung: "🗂️",
};

export const kostenstelleIcon = (wert: string | null | undefined): string =>
  KOSTENSTELLEN_ICONS[wert || ""] || "📍";

/**
 * Beschriftung einer Buchung.
 *
 * @param kostenstelle  Wert aus time_entries.kostenstelle (kann fehlen — alte
 *                      Buchungen entstanden vor Einführung der Spalte)
 * @param locationType  grober Wert als Rückfalloption
 * @param optionen      geladene Liste aus admin_config_options
 */
export const kostenstelleLabel = (
  kostenstelle: string | null | undefined,
  locationType: string | null | undefined,
  optionen: KostenstelleOption[] = []
): string => {
  if (kostenstelle) {
    const treffer = optionen.find((o) => o.wert === kostenstelle);
    if (treffer) return treffer.label;
    // Kostenstelle wurde inzwischen deaktiviert/gelöscht: Wert lesbar machen,
    // statt die Buchung ohne Ortsangabe stehen zu lassen.
    return kostenstelle.charAt(0).toUpperCase() + kostenstelle.slice(1).replace(/_/g, " ");
  }
  return locationType === "werkstatt" ? "Firma" : "Baustelle";
};

/** Symbol + Beschriftung, wie es in den Listen steht („🚚 Fuhrpark"). */
export const kostenstelleAnzeige = (
  kostenstelle: string | null | undefined,
  locationType: string | null | undefined,
  optionen: KostenstelleOption[] = []
): string => {
  const label = kostenstelleLabel(kostenstelle, locationType, optionen);
  const icon = kostenstelle
    ? kostenstelleIcon(kostenstelle)
    : locationType === "werkstatt" ? "🏢" : "🏗️";
  return `${icon} ${label}`;
};

// ----------------------------------------------------------------------------
// Wann gehört eine Buchung zu einem Projekt? (Kundenwunsch 09.09.2026)
//
// „bei der Stundenauswertung muss man auch speichern können, dass die Männer
//  Zeit in der Werkstatt für ein Projekt gearbeitet haben."
//
// Vorher war die Projektzuordnung an den ARBEITSORT gekoppelt (location_type
// baustelle/werkstatt) — wer Werkstatt wählte, verlor das Projekt. Das sind
// aber drei verschiedene Dinge:
//   project_id     → für welches Projekt wurde gearbeitet (Auswertung, Abrechnung)
//   kostenstelle   → auf welche Stelle laufen die Stunden (Kostenstellen-Bericht)
//   location_type  → Arbeitsort, historisch für Taggeld gedacht
// Vorgefertigt in der Werkstatt ist genauso Projektzeit wie Montage vor Ort.
// ----------------------------------------------------------------------------

/**
 * Kostenstellen, bei denen ein GERÄT die Stunden trägt und kein Projekt:
 * Fuhrpark- und Maschinenstunden würden sonst in der Projekt-Nachkalkulation
 * auftauchen, obwohl sie auf das Fahrzeug bzw. die Maschine laufen.
 */
export const GERAETE_KOSTENSTELLEN = ["fuhrpark", "maschinen"] as const;

/** Darf/soll diese Buchung einem Projekt zugeordnet werden? */
export const projektMoeglich = (kostenstelle: string | null | undefined): boolean =>
  !GERAETE_KOSTENSTELLEN.includes(String(kostenstelle || "") as typeof GERAETE_KOSTENSTELLEN[number]);

/**
 * Ist das Projekt Pflicht? Nur auf der Baustelle — dort gibt es keine Stunde
 * ohne Bauvorhaben. Werkstatt, Lager & Co. dürfen, müssen aber nicht.
 */
export const projektPflicht = (kostenstelle: string | null | undefined): boolean =>
  String(kostenstelle || "") === "baustelle";

/** Beschriftung des Projektfelds je Kostenstelle. */
export const projektFeldLabel = (kostenstelle: string | null | undefined): string =>
  projektPflicht(kostenstelle) ? "Projekt *" : "Projekt (optional)";

/** Erklärung unter dem Projektfeld — je nach Kostenstelle. */
export const projektFeldHinweis = (kostenstelle: string | null | undefined): string =>
  projektPflicht(kostenstelle)
    ? "Auf der Baustelle gehört jede Stunde zu einem Bauvorhaben."
    : "Auch Zeit in der Werkstatt oder im Lager kann auf ein Projekt laufen — sie zählt dann in der Projektauswertung und bei „Baustelle abrechnen\" mit.";
