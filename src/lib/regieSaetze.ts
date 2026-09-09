// ============================================================================
// Regie-Sätze (Kundenwunsch 09.09.2026)
//
// Die Sätze für Regiearbeiten stehen an EINER Stelle (Tabelle regie_saetze)
// und werden von dort überall verwendet:
//   - im Schlusstext jedes Angebots (Platzhalter {{regiesaetze}}),
//   - als Vorschlag beim Abrechnen von Regieberichten,
//   - als Nachschlagewerk beim Erfassen.
// Ändert der Chef einen Satz, stimmt er damit überall — genau das war der
// Wunsch („dass man die Preise dann immer ändern kann und die Preise auch
// synchron sind").
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

export interface RegieSatz {
  id: string;
  gruppe: "personal" | "fahrzeug";
  bezeichnung: string;
  betrag: number;
  /** "Std" oder "km" — steht so im Angebot. */
  einheit: string;
  sort: number;
  aktiv: boolean;
}

const tabelle = () => (supabase.from("regie_saetze" as never) as any);

export async function ladeRegieSaetze(nurAktive = true): Promise<RegieSatz[]> {
  let q = tabelle().select("id, gruppe, bezeichnung, betrag, einheit, sort, aktiv").order("gruppe").order("sort");
  if (nurAktive) q = q.eq("aktiv", true);
  const { data } = await q;
  return (((data as any[]) || []).map((r) => ({
    id: String(r.id),
    gruppe: r.gruppe === "fahrzeug" ? "fahrzeug" : "personal",
    bezeichnung: String(r.bezeichnung || ""),
    betrag: Number(r.betrag) || 0,
    einheit: String(r.einheit || "Std"),
    sort: Number(r.sort) || 0,
    aktiv: r.aktiv !== false,
  })) as RegieSatz[]);
}

/** „€ 85,00" — österreichisches Format, wie überall im Beleg. */
export const eurSatz = (betrag: number): string =>
  `€ ${betrag.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Die Sätze als Textblock für den Schlusstext eines Angebots.
 *
 * Bewusst eine Zeile je Satz statt zweispaltig: Der Schlusstext wird im PDF
 * als Fließtext gesetzt (Proportionalschrift), da würden mit Leerzeichen
 * ausgerichtete Spalten verrutschen. Leere Liste = leerer Block, damit im
 * Angebot keine verwaiste Überschrift steht.
 */
export function regieSaetzeText(saetze: RegieSatz[]): string {
  const aktive = saetze.filter((s) => s.aktiv && s.bezeichnung.trim());
  if (aktive.length === 0) return "";
  const zeile = (s: RegieSatz) => `${s.bezeichnung}: ${eurSatz(s.betrag)}/${s.einheit}`;
  const personal = aktive.filter((s) => s.gruppe === "personal").sort((a, b) => a.sort - b.sort);
  const fahrzeuge = aktive.filter((s) => s.gruppe === "fahrzeug").sort((a, b) => a.sort - b.sort);
  const bloecke: string[] = [];
  if (personal.length > 0) bloecke.push(personal.map(zeile).join("\n"));
  if (fahrzeuge.length > 0) bloecke.push(fahrzeuge.map(zeile).join("\n"));
  return bloecke.join("\n\n");
}

/** Platzhalter, der im Schlusstext durch die Sätze ersetzt wird. */
export const REGIE_PLATZHALTER = /\{\{\s*regiesaetze\s*\}\}/gi;

/**
 * Ersetzt {{regiesaetze}} im Text. Gibt es keine Sätze, verschwindet der
 * Platzhalter samt der Leerzeile darum — kein „{{regiesaetze}}" im Angebot.
 */
export function setzeRegieSaetzeEin(text: string, saetze: RegieSatz[]): string {
  if (!text) return text;
  const block = regieSaetzeText(saetze);
  if (!REGIE_PLATZHALTER.test(text)) { REGIE_PLATZHALTER.lastIndex = 0; return text; }
  REGIE_PLATZHALTER.lastIndex = 0;
  if (!block) return text.replace(REGIE_PLATZHALTER, "").replace(/\n{3,}/g, "\n\n").trim();
  return text.replace(REGIE_PLATZHALTER, block);
}
