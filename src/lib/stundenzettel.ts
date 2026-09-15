// ============================================================================
// Stundenzettel-Zahlen für den Monatsbericht eines Mitarbeiters
// (Excel-Export „mit Überstunden" + Kopfzahlen der Stundenauswertung).
//
// Vorbild ist der alte Stundenzettel des Betriebs (Screenshot Christoph,
// 15.09.2026):
//
//   Soll 163,8 | Ist 180,75 | Diff 16,95      gesamt ZA (Stunden): 89,45
//   Zeitausgleich ALT: 72,5  ZA verbraucht: 0  ZA aus diesem Monat: 16,95
//   Lenkzeitvergüt. Fahrer 64,36 € / Beifahrer 26,71 € → gesamt 91,56 €
//
// Genau diese Zeilen liefert `stundenzettelZahlen` — aus denselben
// Einträgen und derselben Tagesregel wie das Zeitkonto (hoursAccounting.
// tagesBilanz), damit Excel, Bildschirm und Monatsabschluss dieselben
// Zahlen zeigen. Nur Rechnung, keine Datenbank — deshalb gut testbar.
// ============================================================================
import { aggregateByDay, type TimeEntryLite } from "./hoursAccounting";
import { zeitraumSaldo } from "./zeitkonto";
import { lenkzeitBetrag, type LenkzeitSaetze } from "./lenkzeit";

export interface StundenzettelEintrag extends TimeEntryLite {
  lenkzeit_minuten?: number | null;
  ist_fahrer?: boolean | null;
  ist_beifahrer?: boolean | null;
}

export interface StundenzettelZahlen {
  /** Σ Tagessoll der gebuchten Tage (Urlaub zählt mit, wie am alten Zettel). */
  soll: number;
  /** Σ gebuchte Stunden (inkl. Urlaub/ZA-Stunden). */
  ist: number;
  /** Ist − Soll der Arbeitstage — „ZA aus diesem Monat". */
  ueberstunden: number;
  /** Genommener Zeitausgleich, ≤ 0 — „ZA verbraucht". */
  zeitausgleich: number;
  /** ueberstunden + zeitausgleich — geht beim Abschluss ins Konto. */
  saldo: number;
  gebuchteTage: number;
  /** Mo–Fr des Monats bis heute ohne Buchung (Feiertage kennt die App nicht). */
  werktageOhneBuchung: string[];
  /** ZA-Konto vor diesem Monat — „Zeitausgleich ALT". */
  kontoVorMonat: number;
  /** kontoVorMonat + saldo — „gesamt ZA". */
  kontoNachMonat: number;
  /** true: der Monat ist per Monatsabschluss gebucht; sonst voraussichtlich. */
  monatAbgeschlossen: boolean;
  lenkzeit: { minutenFahrer: number; minutenBeifahrer: number; betragFahrer: number; betragBeifahrer: number; betrag: number };
}

export interface StundenzettelArgs {
  jahr: number;
  /** 1–12 */
  monat: number;
  /** Einträge NUR dieses Monats (mit Lenkzeit-Feldern). */
  monatEintraege: StundenzettelEintrag[];
  /** ALLE Einträge der Person — nötig, um den Kontostand vor dem Monat zu bestimmen. */
  alleEintraege: TimeEntryLite[];
  /** time_accounts.balance_hours — der abgeschlossene Stand bis `abgeschlossenBis`. */
  konto: number;
  abgeschlossenBis: string | null;
  sollJeTag?: number;
  saetze: LenkzeitSaetze;
  heute?: Date;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tagDavor = (isoDatum: string): string => { const d = new Date(isoDatum + "T12:00:00"); d.setDate(d.getDate() - 1); return iso(d); };
const tagDanach = (isoDatum: string): string => { const d = new Date(isoDatum + "T12:00:00"); d.setDate(d.getDate() + 1); return iso(d); };

/** Erster und letzter Tag eines Monats als ISO. */
export function monatsGrenzen(jahr: number, monat: number): { von: string; bis: string } {
  const letzter = new Date(jahr, monat, 0).getDate();
  const mm = String(monat).padStart(2, "0");
  return { von: `${jahr}-${mm}-01`, bis: `${jahr}-${mm}-${String(letzter).padStart(2, "0")}` };
}

/**
 * Kontostand VOR dem Monat, abgeleitet aus dem abgeschlossenen Stand:
 *   Stichtag ≥ Monatsanfang → der Monat (und alles bis zum Stichtag) steckt
 *                             schon im Konto: Konto − Saldo (Monatsanfang … Stichtag)
 *   Stichtag < Monatsanfang → das Konto endet vor dem Monat; dazwischen
 *                             liegt noch nicht Gebuchtes: Konto + Saldo
 *                             (Stichtag+1 … Monatsanfang−1)
 * Manuelle Konto-Korrekturen stecken im Konto und bleiben, wo sie sind —
 * ein Blick auf einen alten Monat zeigt den Stand, wie er sich aus den
 * Einträgen ergibt.
 */
export function kontoVorMonat(
  alleEintraege: TimeEntryLite[], konto: number, abgeschlossenBis: string | null,
  jahr: number, monat: number, sollJeTag?: number,
): number {
  const { von, bis } = monatsGrenzen(jahr, monat);
  if (abgeschlossenBis && abgeschlossenBis >= von) {
    return r2(konto - zeitraumSaldo(alleEintraege, von, abgeschlossenBis, sollJeTag).gesamt);
  }
  const ab = abgeschlossenBis ? tagDanach(abgeschlossenBis) : null;
  return r2(konto + zeitraumSaldo(alleEintraege, ab, tagDavor(von), sollJeTag).gesamt);
}

/** Werktage (Mo–Fr) des Monats bis einschließlich heute ohne Buchung. */
export function werktageOhneBuchung(jahr: number, monat: number, eintraege: TimeEntryLite[], heute: Date = new Date(), sollJeTag = 7.8): string[] {
  if (!(sollJeTag > 0)) return [];
  const gebucht = new Set(eintraege.map((e) => e.datum));
  const heuteIso = iso(heute);
  const out: string[] = [];
  const letzter = new Date(jahr, monat, 0).getDate();
  for (let t = 1; t <= letzter; t++) {
    const d = new Date(jahr, monat - 1, t);
    const tag = iso(d);
    if (tag > heuteIso) break;
    const w = d.getDay();
    if (w === 0 || w === 6) continue;
    if (!gebucht.has(tag)) out.push(tag);
  }
  return out;
}

export function stundenzettelZahlen(a: StundenzettelArgs): StundenzettelZahlen {
  const { von, bis } = monatsGrenzen(a.jahr, a.monat);
  const imMonat = a.monatEintraege.filter((e) => e.datum >= von && e.datum <= bis);
  const tage = aggregateByDay(imMonat, a.sollJeTag);
  const soll = r2(tage.reduce((s, d) => s + d.soll, 0));
  const ist = r2(tage.reduce((s, d) => s + d.ist, 0));
  const ueberstunden = r2(tage.reduce((s, d) => s + d.ueberstunden, 0));
  const zeitausgleich = r2(tage.reduce((s, d) => s + d.zeitausgleich, 0));
  const saldo = r2(ueberstunden + zeitausgleich);

  const vor = kontoVorMonat(a.alleEintraege, a.konto, a.abgeschlossenBis, a.jahr, a.monat, a.sollJeTag);

  const lenk = { minutenFahrer: 0, minutenBeifahrer: 0, betragFahrer: 0, betragBeifahrer: 0, betrag: 0 };
  for (const e of imMonat) {
    const min = Number(e.lenkzeit_minuten) || 0;
    if (min <= 0) continue;
    const betrag = lenkzeitBetrag(min, { istFahrer: e.ist_fahrer, istBeifahrer: e.ist_beifahrer }, a.saetze);
    if (e.ist_fahrer) { lenk.minutenFahrer += min; lenk.betragFahrer = r2(lenk.betragFahrer + betrag); }
    else if (e.ist_beifahrer) { lenk.minutenBeifahrer += min; lenk.betragBeifahrer = r2(lenk.betragBeifahrer + betrag); }
  }
  lenk.betrag = r2(lenk.betragFahrer + lenk.betragBeifahrer);

  return {
    soll, ist, ueberstunden, zeitausgleich, saldo,
    gebuchteTage: tage.length,
    werktageOhneBuchung: werktageOhneBuchung(a.jahr, a.monat, imMonat, a.heute, a.sollJeTag ?? 7.8),
    kontoVorMonat: vor,
    kontoNachMonat: r2(vor + saldo),
    monatAbgeschlossen: !!a.abgeschlossenBis && a.abgeschlossenBis >= bis,
    lenkzeit: lenk,
  };
}
