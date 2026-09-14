// ============================================================================
// Soll-Stunden je Person (Meldung Katrin, 14.09.2026: „Ich bin derzeit auf
// 15 h eingestellt … nicht auf 39!")
//
// Bisher galt für alle dasselbe Soll: 39 h/Woche, 7,8 h je Werktag
// (workingHours.getNormalWorkingHours). Eine Teilzeitkraft sammelte damit
// jeden Tag Minusstunden. Jetzt trägt jedes Profil Wochenstunden und
// Arbeitstage je Woche; das Tagessoll ist der Quotient. Vollzeit bleibt
// exakt wie vorher (39 / 5 = 7,8).
//
// Das Tagessoll gilt an jedem gebuchten Werktag (Mo–Fr). Welche Wochentage
// eine Teilzeitkraft tatsächlich arbeitet, weiß die App nicht — ungebuchte
// Tage zählen ohnehin nicht, gebuchte werden gegen das Tagessoll gerechnet.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

export const VOLLZEIT_WOCHENSTUNDEN = 39;
export const VOLLZEIT_ARBEITSTAGE = 5;

export interface SollProfil {
  wochenstunden?: number | string | null;
  arbeitstage_woche?: number | string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Wochenstunden mit Vollzeit-Rückfall (null/0/Unsinn → 39). */
export const wochenstundenVon = (p: SollProfil | null | undefined): number => {
  const w = num(p?.wochenstunden);
  return w > 0 ? w : VOLLZEIT_WOCHENSTUNDEN;
};

/** Arbeitstage je Woche, 1–7, Rückfall 5. */
export const arbeitstageVon = (p: SollProfil | null | undefined): number => {
  const t = num(p?.arbeitstage_woche);
  return t >= 1 && t <= 7 ? t : VOLLZEIT_ARBEITSTAGE;
};

/** Tagessoll einer Person: Wochenstunden ÷ Arbeitstage, auf Hundertstel. */
export function sollProTag(p: SollProfil | null | undefined): number {
  return Math.round((wochenstundenVon(p) / arbeitstageVon(p)) * 100) / 100;
}

/** Tagessoll an einem Datum: Mo–Fr das Personen-Soll, Sa/So 0. */
export function tagesSoll(datum: Date, sollJeTag: number): number {
  const d = datum.getDay();
  return d >= 1 && d <= 5 ? sollJeTag : 0;
}

/** Kurztext für Kopfzeilen: „39 h/Woche · 7,8 h je Tag". */
export function sollText(p: SollProfil | null | undefined): string {
  const w = wochenstundenVon(p);
  const t = sollProTag(p);
  const f = (n: number) => String(n).replace(".", ",");
  return `${f(w)} h/Woche · ${f(t)} h je Tag`;
}

/** Soll einer Person aus der Datenbank; bei Fehler Vollzeit. */
export async function ladeSollProfil(userId: string): Promise<SollProfil> {
  const { data } = await (supabase.from("profiles") as any)
    .select("wochenstunden, arbeitstage_woche").eq("id", userId).maybeSingle();
  return (data as SollProfil) || {};
}

/** Soll aller Personen (für Admin-Listen und den Monatsabschluss). */
export async function ladeSollProfile(userIds?: string[]): Promise<Record<string, SollProfil>> {
  let q = (supabase.from("profiles") as any).select("id, wochenstunden, arbeitstage_woche");
  if (userIds && userIds.length) q = q.in("id", userIds);
  const { data } = await q;
  const map: Record<string, SollProfil> = {};
  for (const p of (data || []) as any[]) map[p.id] = { wochenstunden: p.wochenstunden, arbeitstage_woche: p.arbeitstage_woche };
  return map;
}

/** Soll einer Person speichern (nur Administratoren, RLS „Admins can update all profiles"). */
export async function speichereSoll(userId: string, wochenstunden: number, arbeitstage: number): Promise<string | null> {
  const { error } = await (supabase.from("profiles") as any)
    .update({ wochenstunden, arbeitstage_woche: arbeitstage, updated_at: new Date().toISOString() })
    .eq("id", userId);
  return error ? error.message : null;
}
