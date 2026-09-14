// ============================================================================
// Zeitkonto (ZA-Konto) mit Monatsabschluss — Umstellung 14.09.2026
//
// Kundenvorgabe (Christoph, 14.09.): „das ZA-Konto wird erst erhöht, wenn ein
// Monat abgeschlossen ist … mit Ende August: Florian 89,45, Zsolt 74,60,
// Sebastian −39,10, Andreas −16,65 — diese Sachen sollten zur Zeit bei den
// jeweiligen ZA-Kontos stehen."
//
// Das Modell seither:
//   time_accounts.balance_hours  = der ABGESCHLOSSENE Stand (bis zu einem
//                                  Stichtag, app_settings.za_abgeschlossen_bis)
//   laufender Zeitraum           = alles danach, live aus den Einträgen —
//                                  wird angezeigt, aber nicht gebucht
//   Monatsabschluss (Admin)      = bucht den nächsten Monat ins Konto und
//                                  rückt den Stichtag vor
//
// Zeitausgleich-Tage werden NICHT mehr sofort abgebucht (bis 14.09. taten das
// Zeiterfassung und Abwesenheits-Dialog): Sie stehen als Eintrag im Monat
// und zählen beim Abschluss. Damit gibt es nur noch EINE Quelle für die
// Stunden eines Monats — die Einträge — und keine Buchung, die beim Löschen
// eines Eintrags stehen bleiben könnte (Befund vom selben Tag).
//
// Vorher: Konto + Auto-Saldo über ALLE Einträge seit jeher, live. Das ließ die
// Zahl täglich springen und war für den Chef nicht als „Stand" lesbar.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { getNormalWorkingHours } from "@/lib/workingHours";
import { SONDER_TAETIGKEITEN } from "./hoursAccounting";

export const ZA_ABGESCHLOSSEN_KEY = "za_abgeschlossen_bis";
export const ZEITAUSGLEICH = "Zeitausgleich";

export interface ZaEintragLite {
  datum: string;
  stunden: number | string | null;
  taetigkeit?: string | null;
}

export interface ZeitraumSaldo {
  /** Ist − Soll der Arbeitstage (Sonderzeiten neutral). */
  ueberstunden: number;
  /** Genommener Zeitausgleich, negativ. */
  zeitausgleich: number;
  /** ueberstunden + zeitausgleich — das, was ins Konto geht. */
  gesamt: number;
  tage: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const istZa = (t: string | null | undefined) => String(t || "").trim() === ZEITAUSGLEICH;
const istAndereSonder = (t: string | null | undefined) =>
  !istZa(t) && SONDER_TAETIGKEITEN.has(String(t || "").trim());

/**
 * Saldo eines Zeitraums aus Einträgen — die Rechnung des Monatsabschlusses.
 *
 * Je Tag:
 *   Zeitausgleich-Stunden     → zeitausgleich −= Stunden; sie decken das
 *                               Tagessoll (7,8 h) in dieser Höhe ab
 *   Urlaub/Krank/Feiertag/WB  → Tag neutral
 *   sonst                     → ueberstunden += Ist − (Soll − ZA-Stunden)
 *
 * Beispiele: ganzer ZA-Tag 7,8 → −7,8. Halber ZA 4 h + 5 h gearbeitet →
 * ZA −4, Überstunden 5 − 3,8 = +1,2, gesamt −2,8. Nur 4 h ZA gebucht und
 * sonst nichts → ZA −4, Überstunden −3,8: der Tag ist um 7,8 h kürzer.
 *
 * Nicht gebuchte Tage zählen nicht (wie bisher) — ein vergessener Eintrag
 * ergibt keine Minusstunden, sondern fehlt schlicht.
 */
export function zeitraumSaldo(
  entries: ZaEintragLite[],
  von?: string | null,
  bis?: string | null,
): ZeitraumSaldo {
  const tage = new Map<string, ZaEintragLite[]>();
  for (const e of entries || []) {
    if (!e?.datum) continue;
    if (von && e.datum < von) continue;
    if (bis && e.datum > bis) continue;
    const l = tage.get(e.datum) || [];
    l.push(e);
    tage.set(e.datum, l);
  }
  let ueberstunden = 0, zeitausgleich = 0;
  for (const [datum, list] of tage) {
    const soll = getNormalWorkingHours(new Date(datum + "T12:00:00"));
    const za = list.filter((e) => istZa(e.taetigkeit)).reduce((s, e) => s + (Number(e.stunden) || 0), 0);
    const andereSonder = list.some((e) => istAndereSonder(e.taetigkeit));
    const normalIst = list
      .filter((e) => !istZa(e.taetigkeit) && !istAndereSonder(e.taetigkeit))
      .reduce((s, e) => s + (Number(e.stunden) || 0), 0);
    zeitausgleich -= za;
    if (!andereSonder) ueberstunden += normalIst - Math.max(0, soll - za);
  }
  return { ueberstunden: r2(ueberstunden), zeitausgleich: r2(zeitausgleich), gesamt: r2(ueberstunden + zeitausgleich), tage: tage.size };
}

/** Der laufende, noch nicht abgeschlossene Zeitraum: alles nach dem Stichtag. */
export function laufenderSaldo(entries: ZaEintragLite[], abgeschlossenBis: string | null): ZeitraumSaldo {
  if (!abgeschlossenBis) return zeitraumSaldo(entries);
  const von = new Date(abgeschlossenBis + "T12:00:00");
  von.setDate(von.getDate() + 1);
  return zeitraumSaldo(entries, isoDatum(von), null);
}

export const isoDatum = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export interface AbschlussMonat {
  jahr: number;
  monat: number;       // 1–12
  von: string;         // ISO
  bis: string;         // ISO, letzter Tag
  label: string;       // „September 2026"
  /** Erst wenn der Monat vorbei ist — vorher könnten sich Einträge noch ändern. */
  abschliessbar: boolean;
}

/**
 * Der nächste abzuschließende Monat: der Monat nach dem Stichtag. Ohne
 * Stichtag (frische Installation) der Vormonat von heute.
 */
export function naechsterAbschluss(abgeschlossenBis: string | null, heute: Date = new Date()): AbschlussMonat {
  let jahr: number, monat: number;
  if (abgeschlossenBis) {
    const d = new Date(abgeschlossenBis + "T12:00:00");
    jahr = d.getFullYear(); monat = d.getMonth() + 2;      // Folgemonat (1-basiert)
    if (monat > 12) { monat = 1; jahr += 1; }
  } else {
    jahr = heute.getFullYear(); monat = heute.getMonth();   // Vormonat (1-basiert)
    if (monat < 1) { monat = 12; jahr -= 1; }
  }
  const letzter = new Date(jahr, monat, 0).getDate();
  const von = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  const bis = `${jahr}-${String(monat).padStart(2, "0")}-${String(letzter).padStart(2, "0")}`;
  return { jahr, monat, von, bis, label: `${MONATE[monat - 1]} ${jahr}`, abschliessbar: bis < isoDatum(heute) };
}

/** Liegt das Datum in einem abgeschlossenen Monat? Dann sind Einträge dort gesperrt. */
export const istAbgeschlossen = (datum: string | null | undefined, abgeschlossenBis: string | null): boolean =>
  !!datum && !!abgeschlossenBis && datum <= abgeschlossenBis;

export const formatDatumDE = (iso: string | null): string => {
  if (!iso) return "—";
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
};

export const abgeschlossenHinweis = (abgeschlossenBis: string | null): string =>
  `Dieser Monat ist abgeschlossen (Stand bis ${formatDatumDE(abgeschlossenBis)}). Einträge dort können nicht mehr geändert werden — Korrekturen bitte als Gutschrift oder Abzug im Zeitkonto.`;

// ── Datenbank ────────────────────────────────────────────────────────────────

export async function zaAbgeschlossenBisLaden(): Promise<string | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", ZA_ABGESCHLOSSEN_KEY).maybeSingle();
  const v = (data as any)?.value;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export interface AbschlussErgebnis {
  monat: AbschlussMonat;
  gebucht: { userId: string; saldo: ZeitraumSaldo }[];
  ohneAenderung: number;
  fehler: string[];
}

/**
 * Den nächsten Monat abschließen: je Mitarbeiter den Monatssaldo aus den
 * Einträgen buchen, dann den Stichtag vorrücken. Läuft nur, wenn der Monat
 * vorbei ist. Einmal abgeschlossen, ist er über den Stichtag gesperrt — ein
 * zweiter Lauf würde erst den Folgemonat treffen (kein Doppelbuchen).
 */
export async function monatAbschliessen(userIds: string[], geaendertVon: string): Promise<AbschlussErgebnis> {
  const bisher = await zaAbgeschlossenBisLaden();
  const monat = naechsterAbschluss(bisher);
  if (!monat.abschliessbar) throw new Error(`${monat.label} ist noch nicht vorbei — Abschluss erst ab dem 1. des Folgemonats.`);

  const { data: entries, error } = await supabase
    .from("time_entries")
    .select("user_id, datum, stunden, taetigkeit")
    .gte("datum", monat.von).lte("datum", monat.bis)
    .in("user_id", userIds);
  if (error) throw error;

  const proUser = new Map<string, ZaEintragLite[]>();
  for (const e of (entries || []) as any[]) {
    const l = proUser.get(e.user_id) || [];
    l.push(e);
    proUser.set(e.user_id, l);
  }

  const ergebnis: AbschlussErgebnis = { monat, gebucht: [], ohneAenderung: 0, fehler: [] };
  for (const userId of userIds) {
    const saldo = zeitraumSaldo(proUser.get(userId) || []);
    if (Math.abs(saldo.gesamt) < 0.005) { ergebnis.ohneAenderung++; continue; }
    const { data: konto } = await (supabase.from("time_accounts" as never) as any)
      .select("id, balance_hours").eq("user_id", userId).maybeSingle();
    const vorher = Number(konto?.balance_hours) || 0;
    const nachher = r2(vorher + saldo.gesamt);
    const schreib = konto
      ? (supabase.from("time_accounts" as never) as any).update({ balance_hours: nachher, updated_at: new Date().toISOString() }).eq("id", konto.id)
      : (supabase.from("time_accounts" as never) as any).insert({ user_id: userId, balance_hours: nachher });
    const { error: kErr } = await schreib;
    if (kErr) { ergebnis.fehler.push(`${userId}: ${kErr.message}`); continue; }
    const vz = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}`;
    const { error: tErr } = await (supabase.from("time_account_transactions" as never) as any).insert({
      user_id: userId, changed_by: geaendertVon, change_type: "monatsabschluss",
      hours: saldo.gesamt, balance_before: vorher, balance_after: nachher,
      reason: `Monatsabschluss ${monat.label}: Überstunden ${vz(saldo.ueberstunden)} h, Zeitausgleich ${vz(saldo.zeitausgleich)} h (${saldo.tage} gebuchte Tage)`,
    });
    if (tErr) { ergebnis.fehler.push(`${userId}: ${tErr.message}`); continue; }
    ergebnis.gebucht.push({ userId, saldo });
  }

  // Stichtag vorrücken — auch wenn einzelne Buchungen scheiterten? Nein:
  // dann bliebe der Monat offen und der nächste Lauf holt es nach.
  if (ergebnis.fehler.length === 0) {
    const { error: sErr } = await supabase.from("app_settings")
      .upsert({ key: ZA_ABGESCHLOSSEN_KEY, value: monat.bis, updated_at: new Date().toISOString() } as any, { onConflict: "key" });
    if (sErr) ergebnis.fehler.push(`Stichtag nicht gespeichert: ${sErr.message}`);
  }
  return ergebnis;
}
