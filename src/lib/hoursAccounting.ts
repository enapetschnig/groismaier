// Zentrale Saldo-Logik für Stundenauswertung.
//
// Kernregel: Überstunden und Minusstunden werden PRO TAG gerechnet,
// nicht pro time_entry. Bei mehreren Projekten am selben Tag würde
// eine per-Entry-Berechnung Math.max(0, 6h - 10h) = 0 zweimal liefern,
// obwohl der Tag in Summe 12h und damit +2h Überstunden hat.
//
// EINE Tagesregel für alles (15.09.2026, Meldung Christoph: „im Excel habe
// ich die ZA-Zeit dazugerechnet — die muss aber irgendwo wieder abgezogen
// werden, wenn er verbraucht wurde"): Bis dahin rechneten Stundenauswertung,
// Meine Stunden und der Excel-Export einen Zeitausgleich-Tag neutral (Saldo
// 0), das Zeitkonto zog ihn ab. Jetzt nutzen alle `tagesBilanz`:
//
//   Zeitausgleich-Stunden     → zeitausgleich −= Stunden; sie decken das
//                               Tagessoll in dieser Höhe ab
//   Urlaub/Krank/Feiertag/WB  → Tag neutral (Überstunden 0, ZA 0)
//   sonst                     → ueberstunden = Ist − (Soll − ZA-Stunden)
//
// Das Soll eines Tages ist immer das Tagessoll der Person (Mo–Fr), auch an
// Urlaubstagen — so wie es der alte Stundenzettel gehalten hat („Soll 163,8
// = 21 Tage × 7,8", Urlaub steht mit 7,8 h im Ist). Damit gilt an jedem
// nicht-neutralen Tag: Ist − Soll = Überstunden.

import { getNormalWorkingHours } from "@/lib/workingHours";
import { tagesSoll } from "@/lib/sollStunden";

export type TimeEntryLite = {
  datum: string;
  stunden: number | string | null;
  taetigkeit?: string | null;
};

export type DayBalance = {
  datum: string;          // YYYY-MM-DD
  ist: number;            // gebuchte Summe (alle Einträge des Tages, inkl. Urlaub/ZA)
  /** Tagessoll der Person: Mo–Fr, 0 am Wochenende — auch an Urlaubstagen. */
  soll: number;
  /** Ist − (Soll − ZA-Stunden); an neutralen Tagen 0. */
  ueberstunden: number;
  /** Genommener Zeitausgleich, negativ oder 0. */
  zeitausgleich: number;
  /** ueberstunden + zeitausgleich — das, was ins Zeitkonto geht. */
  saldo: number;
  /** Urlaub / Krankenstand / Feiertag / Weiterbildung am Tag → neutral. */
  istSonderzeit: boolean;
};

export const ZEITAUSGLEICH = "Zeitausgleich";

/**
 * Tätigkeiten mit Sonderregel. Zeitausgleich wird abgezogen, die anderen
 * stellen den Tag neutral.
 */
export const SONDER_TAETIGKEITEN = new Set([
  "Urlaub",
  "Krankenstand",
  "Feiertag",
  ZEITAUSGLEICH,
  "Weiterbildung",
]);

const r2 = (n: number) => Math.round(n * 100) / 100;
export const istZeitausgleich = (t: string | null | undefined): boolean => String(t || "").trim() === ZEITAUSGLEICH;
export const istNeutraleSonderzeit = (t: string | null | undefined): boolean =>
  !istZeitausgleich(t) && SONDER_TAETIGKEITEN.has(String(t || "").trim());

/** Tagessoll: persönlich (sollStunden) oder, ohne Angabe, Vollzeit 7,8 h. */
export function sollFuerTag(datum: string, sollJeTag?: number): number {
  const tag = new Date(datum + "T12:00:00");
  return sollJeTag === undefined ? getNormalWorkingHours(tag) : tagesSoll(tag, sollJeTag);
}

/** Die eine Tagesregel — für Zeitkonto, Auswertung, Meine Stunden und Excel. */
export function tagesBilanz(datum: string, dayEntries: TimeEntryLite[], sollJeTag?: number): DayBalance {
  const soll = sollFuerTag(datum, sollJeTag);
  const ist = dayEntries.reduce((s, e) => s + (Number(e.stunden) || 0), 0);
  const za = dayEntries.filter((e) => istZeitausgleich(e.taetigkeit)).reduce((s, e) => s + (Number(e.stunden) || 0), 0);
  const istSonderzeit = dayEntries.some((e) => istNeutraleSonderzeit(e.taetigkeit));
  const normalIst = dayEntries
    .filter((e) => !istZeitausgleich(e.taetigkeit) && !istNeutraleSonderzeit(e.taetigkeit))
    .reduce((s, e) => s + (Number(e.stunden) || 0), 0);
  const zeitausgleich = za > 0 ? r2(-za) : 0;   // kein negatives Null
  const ueberstunden = istSonderzeit ? 0 : r2(normalIst - Math.max(0, soll - za));
  return { datum, ist: r2(ist), soll, ueberstunden, zeitausgleich, saldo: r2(ueberstunden + zeitausgleich), istSonderzeit };
}

/**
 * Aggregiert beliebige time_entries nach Datum und liefert je Tag
 * Ist-, Soll- und Saldo-Stunden. Sortiert aufsteigend nach Datum.
 *
 * @param sollJeTag Tagessoll der Person (sollStunden.sollProTag) — ohne
 *   Angabe Vollzeit 7,8 h. Seit 14.09.2026 hat jede Person ihr eigenes Soll
 *   (Meldung Katrin: „auf 15 h eingestellt, nicht auf 39").
 */
export function aggregateByDay(entries: TimeEntryLite[], sollJeTag?: number): DayBalance[] {
  const grouped = new Map<string, TimeEntryLite[]>();
  for (const e of entries) {
    if (!e?.datum) continue;
    const list = grouped.get(e.datum) || [];
    list.push(e);
    grouped.set(e.datum, list);
  }
  const out: DayBalance[] = [];
  for (const [datum, dayEntries] of grouped) out.push(tagesBilanz(datum, dayEntries, sollJeTag));
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Saldo-Summe über die gegebenen Einträge — Auto-Saldo aus time_entries. */
export function totalAutoSaldo(entries: TimeEntryLite[], sollJeTag?: number): number {
  return r2(aggregateByDay(entries, sollJeTag).reduce((s, d) => s + d.saldo, 0));
}

/**
 * Formatierter Saldo mit Vorzeichen (für UI und Excel-Export).
 * +0,00 bei genau 0 — leer string nur explizit angefordert.
 */
export function formatSaldo(value: number, opts?: { hideZero?: boolean }): string {
  if (opts?.hideZero && Math.abs(value) < 0.005) return "";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}
