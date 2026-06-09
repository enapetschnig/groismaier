/**
 * Normalisiert einen String für umlaut-insensitive Suche:
 * - Kleinbuchstaben
 * - Umlaute → ae/oe/ue/ss
 * - Akzente entfernt (Müller → mueller, Café → cafe)
 * - Mehrfach-Whitespace → ein Leerzeichen
 */
export function normalizeSearch(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Akzente entfernen
    .replace(/\s+/g, " ")
    .trim();
}

/** Prüft ob `haystack` die `needle` enthält — umlaut-insensitive */
export function matchesSearch(haystack: string | null | undefined, needle: string): boolean {
  if (!needle?.trim()) return true;
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}
