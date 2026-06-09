/**
 * Zentralisiertes Status-Farb-System.
 * Einheitliche Farben für alle Status-Badges in der App.
 *
 * Farb-Semantik:
 * - Orange: Offen / in Bearbeitung / Wartend
 * - Blau: Gesendet / versendet / angenommen (in Gang)
 * - Grün: Bezahlt / abgeschlossen / erledigt
 * - Rot: Überfällig / abgelehnt / Problem
 * - Grau: Storniert / archiviert
 * - Gelb: Teilbezahlt / halb-erledigt
 */

export type StatusColorSet = {
  bg: string;      // Badge-Hintergrund
  text: string;    // Badge-Text
  dot: string;     // Farb-Dot für Listen
  border?: string; // Optional Border
};

const COLOR_PALETTE: Record<string, StatusColorSet> = {
  orange: { bg: "bg-orange-100", text: "text-orange-800", dot: "bg-orange-500" },
  blue:   { bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-500" },
  green:  { bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500" },
  red:    { bg: "bg-red-100",    text: "text-red-800",    dot: "bg-red-500" },
  gray:   { bg: "bg-gray-100",   text: "text-gray-700",   dot: "bg-gray-400" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
  purple: { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
};

// Mapping: Status-Name → Farbe
const STATUS_TO_COLOR: Record<string, keyof typeof COLOR_PALETTE> = {
  // Rechnungen
  offen: "orange",
  teilbezahlt: "yellow",
  bezahlt: "green",
  ueberfaellig: "red",
  ueberfällig: "red",
  storniert: "gray",
  archiviert: "gray",

  // Angebote
  entwurf: "gray",
  angenommen: "green",
  abgelehnt: "red",
  verrechnet: "blue",
  abgelaufen: "gray",

  // Projekte
  aktiv: "green",
  "in arbeit": "blue",
  in_arbeit: "blue",
  geplant: "orange",
  pausiert: "yellow",
  abgeschlossen: "green",
  erstkontakt: "orange",
  anfrage: "orange",

  // Bautagesberichte, Regieberichte
  unterschrieben: "blue",
  gesendet: "blue",
  nicht_gesendet: "orange",
  erledigt: "green",

  // Generic
  neu: "orange",
  in_bearbeitung: "blue",
  fertig: "green",
  fehler: "red",
};

/** Hauptfunktion: Status-String → Farb-Set */
export function getStatusColor(status: string | null | undefined): StatusColorSet {
  if (!status) return COLOR_PALETTE.gray;
  const normalized = status.toLowerCase().trim().replace(/\s+/g, "_");
  const colorKey = STATUS_TO_COLOR[normalized] ?? "gray";
  return COLOR_PALETTE[colorKey];
}

/** Tailwind-Klassen-String für ein Badge (bg + text) */
export function getStatusBadgeClasses(status: string | null | undefined): string {
  const c = getStatusColor(status);
  return `${c.bg} ${c.text}`;
}

/** Label-Normalisierung für Status-Anzeige */
export const STATUS_LABELS: Record<string, string> = {
  offen: "Offen",
  teilbezahlt: "Teilbezahlt",
  bezahlt: "Bezahlt",
  ueberfaellig: "Überfällig",
  storniert: "Storniert",
  archiviert: "Archiviert",
  entwurf: "Entwurf",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  verrechnet: "Verrechnet",
  abgelaufen: "Abgelaufen",
  aktiv: "Aktiv",
  "in arbeit": "In Arbeit",
  in_arbeit: "In Arbeit",
  geplant: "Geplant",
  pausiert: "Pausiert",
  abgeschlossen: "Abgeschlossen",
  erstkontakt: "Erstkontakt",
  anfrage: "Anfrage",
  unterschrieben: "Unterschrieben",
  gesendet: "Gesendet",
  nicht_gesendet: "Nicht gesendet",
  erledigt: "Erledigt",
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  fertig: "Fertig",
  fehler: "Fehler",
};

export function getStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const normalized = status.toLowerCase().trim().replace(/\s+/g, "_");
  return STATUS_LABELS[normalized] ?? status;
}
