// ============================================================================
// Lenkzeit-Sätze aus der Datenbank (Kundenmeldung 15.09.2026: „Die €/h, die
// die Mitarbeiter bekommen, richten sich nach dem KV und müssen anpassbar
// sein — vielleicht auch in den Einstellungen").
//
// Zwei Ebenen:
//   app_settings.lenkzeit_satz_fahrer / _beifahrer  → betrieblicher Standard
//                                                      (Admin → Einstellungen)
//   employees.fahrer_verguetung / beifahrer_verguetung → Ausnahme je Person
//                                                      (Stammdaten/Personal),
//                                                      leer = Standard gilt
//   app_settings.lenkzeit_schwelle_minuten           → ab wann eine Fahrt
//                                                      vergütet wird (25)
//
// Die reine Rechnung bleibt in lenkzeit.ts (ohne Datenbank, testbar).
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { LENKZEIT_SCHWELLE_MINUTEN, type LenkzeitSaetze } from "./lenkzeit";

export const LENKZEIT_KEYS = {
  fahrer: "lenkzeit_satz_fahrer",
  beifahrer: "lenkzeit_satz_beifahrer",
  schwelle: "lenkzeit_schwelle_minuten",
} as const;

export interface LenkzeitVorgaben {
  standard: LenkzeitSaetze;
  schwelleMinuten: number;
  /** Ausnahmen je Mitarbeiter (user_id → Sätze); fehlt eine Person, gilt der Standard. */
  proMitarbeiter: Map<string, LenkzeitSaetze>;
  saetzeFuer: (userId: string) => LenkzeitSaetze;
}

const zahl = (v: unknown, sonst = 0): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : sonst;
};

export async function ladeLenkzeitVorgaben(): Promise<LenkzeitVorgaben> {
  const [{ data: vorgaben }, { data: mitarbeiter }] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", Object.values(LENKZEIT_KEYS)),
    supabase.from("employees").select("user_id, fahrer_verguetung, beifahrer_verguetung"),
  ]);
  const standard: LenkzeitSaetze = { fahrer: 0, beifahrer: 0 };
  let schwelleMinuten = LENKZEIT_SCHWELLE_MINUTEN;
  for (const v of ((vorgaben as any[]) || [])) {
    if (v.key === LENKZEIT_KEYS.fahrer) standard.fahrer = zahl(v.value);
    if (v.key === LENKZEIT_KEYS.beifahrer) standard.beifahrer = zahl(v.value);
    if (v.key === LENKZEIT_KEYS.schwelle) { const s = zahl(v.value, LENKZEIT_SCHWELLE_MINUTEN); if (s > 0) schwelleMinuten = s; }
  }
  // Satz am Mitarbeiter gewinnt; leer → betrieblicher Standard.
  const proMitarbeiter = new Map<string, LenkzeitSaetze>();
  for (const e of ((mitarbeiter as any[]) || [])) {
    if (!e.user_id) continue;
    proMitarbeiter.set(e.user_id, {
      fahrer: e.fahrer_verguetung != null ? zahl(e.fahrer_verguetung) : standard.fahrer,
      beifahrer: e.beifahrer_verguetung != null ? zahl(e.beifahrer_verguetung) : standard.beifahrer,
    });
  }
  return { standard, schwelleMinuten, proMitarbeiter, saetzeFuer: (uid) => proMitarbeiter.get(uid) || standard };
}

/** Nur die Schwelle — für die Zeiterfassung und den Admin-Nachtrag. */
export async function ladeLenkzeitSchwelle(): Promise<number> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", LENKZEIT_KEYS.schwelle).maybeSingle();
  const s = zahl((data as any)?.value, LENKZEIT_SCHWELLE_MINUTEN);
  return s > 0 ? s : LENKZEIT_SCHWELLE_MINUTEN;
}

export async function speichereLenkzeitVorgaben(v: { fahrer: number; beifahrer: number; schwelleMinuten: number }): Promise<string | null> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert([
    { key: LENKZEIT_KEYS.fahrer, value: String(v.fahrer), updated_at: now },
    { key: LENKZEIT_KEYS.beifahrer, value: String(v.beifahrer), updated_at: now },
    { key: LENKZEIT_KEYS.schwelle, value: String(Math.round(v.schwelleMinuten)), updated_at: now },
  ] as any, { onConflict: "key" });
  return error ? error.message : null;
}
