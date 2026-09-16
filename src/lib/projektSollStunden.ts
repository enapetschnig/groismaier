// ============================================================================
// Soll-Stunden eines Projekts für den Stundenabgleich / die Nachkalkulation
// (Kundenwunsch 16.09.2026, BV Zimmerl: „Dort sind ja nur Pauschalbeträge
// angeführt … die Kalkulation mit dem Projekt verknüpfen, wo man die
// kalkulierten Stunden auslesen kann — oder ein Eingabefeld, wo ich händisch
// Stunden eingeben kann, die für ein Projekt geplant sind").
//
// Drei Quellen, in dieser Reihenfolge:
//   1. händisch   projects.geplante_stunden (vom Chef eingetragen)
//   2. Kalkulation kalkulationen.project_id → Σ Arbeitsstunden der Aufbauten
//   3. Angebot    Stunden-Positionen + kalkulierte Arbeitszeit je Position
//                 (rechnet die Projektseite selbst, siehe stunden.ts)
// Die Seite nimmt die erste Quelle, die einen Wert liefert, und sagt dazu,
// woher er kommt.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { calcProjekt, normalizeKalkulationState, resolveBetriebsdaten } from "./kalkulationEngine";

export type SollQuelle = "manuell" | "kalkulation" | "angebot";

export interface SollStunden {
  quelle: SollQuelle;
  stunden: number;
  /** Bei Quelle „kalkulation": Name der verknüpften Kalkulation. */
  kalkulationName?: string;
  kalkulationId?: string;
}

export interface KalkulationKurz { id: string; name: string; bauvorhaben: string | null; kundeName: string | null; project_id: string | null }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Betriebsdaten wie im Editor auflösen (Stundensätze etc. aus app_settings). */
async function ladeSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from("app_settings").select("key, value").like("key", "kalk\\_%");
  const settings: Record<string, string> = {};
  for (const s of data || []) settings[s.key] = s.value;
  return settings;
}

/** Σ Arbeitsstunden aller Aufbauten einer Kalkulation (roh, wie in der Auswertung). */
export function kalkulationArbeitsstunden(data: unknown, settings: Record<string, string>): number {
  const st = normalizeKalkulationState(data);
  const bd = resolveBetriebsdaten(st.settings.businessData, settings);
  return r1(calcProjekt(st, bd).gesamt.arbeitszeitH);
}

/** Händisch oder aus der verknüpften Kalkulation — sonst null (dann gilt das Angebot). */
export async function ladeSollStunden(projectId: string): Promise<SollStunden | null> {
  const [{ data: proj }, { data: kalks }] = await Promise.all([
    (supabase.from("projects" as never) as any).select("geplante_stunden").eq("id", projectId).maybeSingle(),
    (supabase.from("kalkulationen" as never) as any)
      .select("id, name, data, updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1),
  ]);
  const manuell = proj?.geplante_stunden != null ? Number(proj.geplante_stunden) : null;
  if (manuell != null && manuell > 0) return { quelle: "manuell", stunden: r1(manuell) };
  const k = ((kalks as any[]) || [])[0];
  if (k) {
    const settings = await ladeSettings();
    return { quelle: "kalkulation", stunden: kalkulationArbeitsstunden(k.data, settings), kalkulationName: k.name, kalkulationId: k.id };
  }
  return null;
}

/** Für die Nachkalkulations-Übersicht: Soll je Projekt aus Handeingabe oder Kalkulation. */
export async function ladeSollStundenJeProjekt(): Promise<Record<string, SollStunden>> {
  const [{ data: projs }, { data: kalks }] = await Promise.all([
    (supabase.from("projects" as never) as any).select("id, geplante_stunden").not("geplante_stunden", "is", null),
    (supabase.from("kalkulationen" as never) as any).select("id, name, project_id, data, updated_at").not("project_id", "is", null).order("updated_at", { ascending: false }),
  ]);
  const out: Record<string, SollStunden> = {};
  const kalkListe = (kalks as any[]) || [];
  if (kalkListe.length) {
    const settings = await ladeSettings();
    for (const k of kalkListe) {
      if (out[k.project_id]) continue;   // neueste je Projekt gewinnt (sortiert)
      out[k.project_id] = { quelle: "kalkulation", stunden: kalkulationArbeitsstunden(k.data, settings), kalkulationName: k.name, kalkulationId: k.id };
    }
  }
  for (const p of ((projs as any[]) || [])) {
    const h = Number(p.geplante_stunden);
    if (h > 0) out[p.id] = { quelle: "manuell", stunden: r1(h) };
  }
  return out;
}

export async function speichereGeplanteStunden(projectId: string, stunden: number | null): Promise<string | null> {
  const { error } = await (supabase.from("projects" as never) as any)
    .update({ geplante_stunden: stunden, updated_at: new Date().toISOString() }).eq("id", projectId);
  return error ? error.message : null;
}

/** Kalkulation an das Projekt hängen (bisherige Verknüpfung dieses Projekts lösen). */
export async function verknuepfeKalkulation(projectId: string, kalkulationId: string | null): Promise<string | null> {
  const { error: loesen } = await (supabase.from("kalkulationen" as never) as any)
    .update({ project_id: null }).eq("project_id", projectId);
  if (loesen) return loesen.message;
  if (!kalkulationId) return null;
  const { error } = await (supabase.from("kalkulationen" as never) as any)
    .update({ project_id: projectId }).eq("id", kalkulationId);
  return error ? error.message : null;
}

export async function ladeKalkulationenZurAuswahl(): Promise<KalkulationKurz[]> {
  const { data } = await (supabase.from("kalkulationen" as never) as any)
    .select("id, name, bauvorhaben, project_id, ist_vorlage, customers(name)")
    .or("ist_vorlage.is.null,ist_vorlage.eq.false")
    .order("updated_at", { ascending: false }).limit(300);
  return ((data as any[]) || []).map((k) => ({
    id: k.id, name: k.name, bauvorhaben: k.bauvorhaben ?? null, kundeName: k.customers?.name ?? null, project_id: k.project_id ?? null,
  }));
}
