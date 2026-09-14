// ============================================================================
// Zeitkonto: Buchungen zu Zeitausgleich-Einträgen zurücknehmen
//
// Befund 14.09.2026 (beim Eintragen der ZA-Stände): Sebastian hatte zwei
// ZA-Abbuchungen (04.09. und 08.09.), aber nur einen Zeitausgleich-Eintrag —
// am 08.09. standen 10 h Regiearbeit. Wer einen ZA-Eintrag löscht oder auf
// eine andere Tätigkeit umstellt, behielt bisher die Abbuchung im Konto.
// Das Konto lief damit lautlos ins Minus.
//
// Regel (eine Stelle für alle drei Masken — Meine Stunden, Stundenauswertung,
// Admin-Nachtrag): Was der Eintrag beim Anlegen abgebucht hat, kommt beim
// Löschen zurück; ändert sich die Stundenzahl eines ZA-Eintrags, wird die
// Differenz nachgebucht. Die Rechnung ist rein, der Datenbankteil daneben.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { SONDER_TAETIGKEITEN } from "./hoursAccounting";

export const ZEITAUSGLEICH = "Zeitausgleich";

export interface ZaEintragLite {
  datum: string;
  stunden: number | string | null;
  taetigkeit?: string | null;
}

const istZa = (e: ZaEintragLite | null | undefined): boolean =>
  !!e && String(e.taetigkeit || "").trim() === ZEITAUSGLEICH;

/**
 * Wie viele Stunden muss das Konto GUTGESCHRIEBEN bekommen, wenn ein Eintrag
 * von `alt` nach `neu` wechselt (neu = null: gelöscht)?
 *
 *   ZA 7,8 → gelöscht          +7,8   (Abbuchung zurück)
 *   ZA 7,8 → Montage 10        +7,8   (kein ZA mehr)
 *   ZA 7,8 → ZA 4              +3,8   (weniger frei genommen)
 *   ZA 4   → ZA 7,8            −3,8   (mehr frei genommen)
 *   Montage → ZA 7,8           −7,8   (nachträglich zum ZA gemacht)
 *   Montage → Montage           0
 *
 * Positiv = Gutschrift, negativ = Abbuchung. 0 = nichts zu tun.
 */
export function zaKontoDelta(alt: ZaEintragLite | null, neu: ZaEintragLite | null): number {
  const altZa = istZa(alt) ? Number(alt!.stunden) || 0 : 0;
  const neuZa = istZa(neu) ? Number(neu!.stunden) || 0 : 0;
  return Math.round((altZa - neuZa) * 100) / 100;
}

/** Ist die Tätigkeit eine Sonderzeit (Urlaub, ZA, …)? Für Masken, die das wissen wollen. */
export const istSonderTaetigkeit = (t: string | null | undefined): boolean =>
  SONDER_TAETIGKEITEN.has(String(t || "").trim());

/**
 * Das Delta ins Zeitkonto buchen. Schreibt Konto und Buchungszeile — derselbe
 * Weg wie beim Anlegen (TimeTracking), nur in die andere Richtung.
 *
 * Fehler werden gemeldet, aber nicht geworfen: Der Eintrag selbst ist schon
 * geändert/gelöscht, das darf nicht am Konto scheitern. Dafür steht im
 * Grund, was passiert ist — der Administrator sieht es in der Historie.
 */
export async function zeitkontoNachEintragAenderung(
  userId: string,
  alt: ZaEintragLite | null,
  neu: ZaEintragLite | null,
  geaendertVon: string,
): Promise<{ ok: boolean; delta: number; fehler?: string }> {
  const delta = zaKontoDelta(alt, neu);
  if (delta === 0) return { ok: true, delta: 0 };

  const { data: konto, error: leseFehler } = await (supabase.from("time_accounts" as never) as any)
    .select("id, balance_hours").eq("user_id", userId).maybeSingle();
  if (leseFehler) return { ok: false, delta, fehler: leseFehler.message };

  const vorher = Number(konto?.balance_hours) || 0;
  const nachher = Math.round((vorher + delta) * 100) / 100;

  if (konto) {
    const { error } = await (supabase.from("time_accounts" as never) as any)
      .update({ balance_hours: nachher, updated_at: new Date().toISOString() }).eq("id", konto.id);
    if (error) return { ok: false, delta, fehler: error.message };
  } else {
    const { error } = await (supabase.from("time_accounts" as never) as any)
      .insert({ user_id: userId, balance_hours: nachher });
    if (error) return { ok: false, delta, fehler: error.message };
  }

  const datum = (neu || alt)?.datum || "";
  const grund = neu === null
    ? `Zeitausgleich am ${datum} gelöscht — Abbuchung zurückgenommen`
    : istZa(alt) && !istZa(neu)
      ? `Eintrag am ${datum} ist kein Zeitausgleich mehr — Abbuchung zurückgenommen`
      : !istZa(alt) && istZa(neu)
        ? `Eintrag am ${datum} nachträglich als Zeitausgleich gebucht`
        : `Zeitausgleich am ${datum} auf ${Number(neu!.stunden)} h geändert`;

  const { error: buchungFehler } = await (supabase.from("time_account_transactions" as never) as any).insert({
    user_id: userId,
    changed_by: geaendertVon,
    change_type: delta > 0 ? "za_storno" : "za_abzug",
    hours: delta,
    balance_before: vorher,
    balance_after: nachher,
    reason: grund,
  });
  if (buchungFehler) return { ok: false, delta, fehler: buchungFehler.message };
  return { ok: true, delta };
}
