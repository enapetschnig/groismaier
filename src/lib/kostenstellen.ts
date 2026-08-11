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
