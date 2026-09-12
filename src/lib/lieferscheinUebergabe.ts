// ============================================================================
// Lieferschein-Übergabe: die Regeln an einer Stelle (Kundenwunsch 11.09.2026)
//
// „Für Lieferscheine braucht es eine Erinnerung, wenn welche offen stehen
//  bleiben … Fotos … ein Unterschrift-Feld, wo der Kunde oder Frächter
//  unterschreiben kann."
//
// Der Statusfluss eines Lieferscheins:
//   entwurf  → wird gerade vorbereitet
//   offen    → übergeben (unterschrieben oder „Übergeben" gedrückt), Ware ist
//              draußen, Abrechnung steht aus — DAS zählt die Erinnerung
//   verrechnet → in einer Rechnung gelandet (setzt der Rechnungs-Editor über
//              die Belegkette, siehe InvoiceDetail)
//
// Reine Funktionen, damit Liste, Startseite und Offene Posten dieselbe
// Regel benutzen und sich nicht auseinanderentwickeln.
// ============================================================================

/** Ab so vielen Tagen im Status „offen" wird der Hinweis rot. */
export const LIEFERSCHEIN_MAHNGRENZE_TAGE = 14;

/** Ganze Tage zwischen einem ISO-Datum und heute (nie negativ). */
export function tageSeit(datumISO: string | null | undefined, heute: Date = new Date()): number {
  if (!datumISO) return 0;
  const d = new Date(datumISO);
  if (Number.isNaN(d.getTime())) return 0;
  const start = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const jetzt = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return Math.max(0, Math.round((jetzt - start) / 86_400_000));
}

/**
 * Warntext für die Belegliste. Leer, solange nichts zu warnen ist.
 *
 * Gezählt wird ab der Übergabe (Unterschrift), nicht ab dem Belegdatum —
 * ein Lieferschein, der drei Tage im Entwurf lag, ist deshalb nicht drei
 * Tage „nicht verrechnet".
 */
export function lieferscheinWarnung(
  status: string | null | undefined,
  datum: string | null | undefined,
  unterschriftAm: string | null | undefined,
  heute: Date = new Date(),
): string {
  if (status !== "offen") return "";
  const tage = tageSeit(unterschriftAm || datum, heute);
  if (tage < LIEFERSCHEIN_MAHNGRENZE_TAGE) return "";
  return `seit ${tage} Tagen nicht verrechnet`;
}

/** Kurztext „vor 3 Tagen" / „heute" für Karten und Listen. */
export function seitWann(datumISO: string | null | undefined, heute: Date = new Date()): string {
  const t = tageSeit(datumISO, heute);
  if (t === 0) return "heute";
  if (t === 1) return "seit gestern";
  return `seit ${t} Tagen`;
}

/**
 * Welchen Status bekommt der Lieferschein nach der Übergabe?
 * Ein verrechneter oder stornierter bleibt, was er ist — eine späte
 * Unterschrift darf ihn nicht wieder in die Erinnerung zurückholen.
 */
export function statusNachUebergabe(status: string | null | undefined): string {
  const s = String(status || "");
  if (s === "verrechnet" || s === "storniert") return s;
  return "offen";
}

/** Darf zu diesem Lieferschein noch unterschrieben werden? */
export function darfUnterschreiben(
  status: string | null | undefined,
  unterschriftKunde: string | null | undefined,
): boolean {
  if (unterschriftKunde) return false;
  const s = String(status || "");
  return s !== "storniert";
}

/** Eine Positionszeile des Handy-Formulars. */
export interface LieferscheinZeile {
  menge: string;
  einheit: string;
  text: string;
}

/** Nur Zeilen mit Text zählen; Menge ohne Text ist ein Tippfehler. */
export function gueltigeZeilen(zeilen: LieferscheinZeile[]): LieferscheinZeile[] {
  return zeilen.filter((z) => z.text.trim().length > 0);
}

/** Menge aus dem Eingabefeld: leer = 1, Komma erlaubt. */
export function mengeAusEingabe(roh: string): number {
  const s = String(roh || "").trim().replace(",", ".");
  if (!s) return 1;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Foto fürs Hochladen verkleinern (läuft nur im Browser).
 *
 * Handy-Fotos haben 12 MP und 3–5 MB; auf dem Lieferschein-PDF werden sie
 * rund 8 cm breit gedruckt. 1600 px an der langen Kante reichen dafür mit
 * Reserve und machen aus 4 MB etwa 250 KB — der Upload am Hof über
 * Mobilfunk dauert dann Sekunden statt Minuten. Schlägt etwas fehl, geht
 * das Original hoch; ein Lieferschein darf nie an der Bildbearbeitung
 * scheitern.
 */
export async function bildFuerUpload(
  datei: File,
  maxKante = 1600,
  qualitaet = 0.85,
): Promise<Blob> {
  try {
    if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return datei;
    if (!datei.type.startsWith("image/")) return datei;
    const bitmap = await createImageBitmap(datei);
    const groesste = Math.max(bitmap.width, bitmap.height);
    if (groesste <= maxKante && datei.size < 600 * 1024) { bitmap.close(); return datei; }
    const faktor = Math.min(1, maxKante / groesste);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * faktor);
    canvas.height = Math.round(bitmap.height * faktor);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return datei; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((auf) => canvas.toBlob(auf, "image/jpeg", qualitaet));
    return blob && blob.size < datei.size ? blob : datei;
  } catch {
    return datei;
  }
}
