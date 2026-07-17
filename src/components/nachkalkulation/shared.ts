// ============================================================================
// Nachkalkulation & Firmenzahlen — gemeinsame Helfer
// ----------------------------------------------------------------------------
// Formatierung, Beleg-Typ-Mengen und ein Pagination-Helper, damit auch
// Tabellen > pgrst.db_max_rows (5000) vollständig geladen werden.
// ============================================================================

/** Zahlbare Rechnungstypen (Kunde → wir). Gutschrift bewusst ausgeschlossen. */
export const PAYABLE_INVOICE_TYPES = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);

/** Ampel-Farben (Status-Palette; nie für Serien wiederverwendet). */
export const AMPEL = {
  gruen: "bg-[#0ca30c]",
  gelb: "bg-[#fab219]",
  rot: "bg-[#d03b3b]",
  neutral: "bg-gray-300 dark:bg-gray-600",
} as const;

/** Ampel-Einstufung nach Marge: grün ≥ 20 %, gelb 5–20 %, rot < 5 %. */
export function ampelClass(marge: number | null): string {
  if (marge === null) return AMPEL.neutral;
  if (marge >= 20) return AMPEL.gruen;
  if (marge >= 5) return AMPEL.gelb;
  return AMPEL.rot;
}

export function ampelLabel(marge: number | null): string {
  if (marge === null) return "Keine Basis (nichts verrechnet / kein Auftrag)";
  if (marge >= 20) return "Marge ≥ 20 %";
  if (marge >= 5) return "Marge 5–20 %";
  return "Marge < 5 %";
}

const eurFmt = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });

/** "€ 1.234,56" */
export function formatEUR(n: number): string {
  return eurFmt.format(Number.isFinite(n) ? n : 0);
}

/** Kompakte Achsen-Beschriftung: 0 / 500 / 12k / 1,2 Mio. */
export function formatEURAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("de-AT", { maximumFractionDigits: 1 })} Mio`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

/** "123,5 h" */
export function formatStunden(n: number): string {
  return `${n.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

/** "12,3 %" */
export function formatProzent(n: number | null): string {
  if (n === null) return "—";
  return `${n.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/**
 * Eingangsrechnungs-Netto: gespeichertes Netto, sonst aus Brutto und
 * USt-Satz (Default 20 %) zurückgerechnet — so wie der Upload-Dialog
 * das Netto beim Speichern berechnet.
 */
export function purchaseNetto(row: { betrag_netto: number | null; betrag_brutto: number; ust_satz: number | null }): number {
  if (row.betrag_netto !== null && row.betrag_netto !== undefined) return Number(row.betrag_netto);
  const ust = row.ust_satz ?? 20;
  return Number(row.betrag_brutto) / (1 + ust / 100);
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Lädt eine Tabelle vollständig in 1000er-Seiten (stabile Sortierung im
 * Builder nicht vergessen, z.B. .order("id")). Wirft bei Supabase-Fehlern.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Zerlegt eine ID-Liste in Chunks (für .in()-Filter mit URL-Längen-Limit). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** "YYYY-MM"-Schlüssel eines ISO-Datums (Belegdatum "YYYY-MM-DD" oder voll). */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}
