// ============================================================================
// Ausschreibungs-LV mit der Auftragskalkulation bepreisen
// (Kundenwunsch 07.09.2026: „gleich wie in den anderen Kalkulationen dieselbe
//  Ansichtsmaske mit den Stammdaten zum Kalkulieren").
//
// Weg: Aus dem LV wird eine Kalkulation erzeugt — je bepreisbarer Position
// ein Aufbau (Name = Pos-Nr + Stichwort, Fläche/Menge = LV-Menge, Einheit
// aus dem LV). Der Chef kalkuliert dort wie gewohnt mit Katalog, Material
// und Arbeitszeit. „Preise ins LV übernehmen" rechnet je Aufbau
// Gesamt ÷ Menge = Einheitspreis, teilt ihn in Lohn (Arbeitsanteil) und
// Sonstiges (Rest) und schreibt beides in die LV-Positionen.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import {
  newEmptyState, newModule, normalizeKalkulationState, calcProjekt, resolveBetriebsdaten, round2,
  type KalkulationState, type KalkModule, type ProjektErgebnis,
} from "./kalkulationEngine";

export interface LvPositionKurz {
  id: string;
  positionsnummer: string;
  stichwort: string | null;
  einheit: string | null;
  menge: number | null;
  positionsart: string;
}

/** LV-Einheit → Einheit, mit der der Aufbau ins Angebot geht. */
export const angebotEinheitFuer = (einheit: string | null): NonNullable<KalkModule["angebotEinheit"]> => {
  const e = (einheit || "").toLowerCase().replace(/\s+/g, "");
  if (e === "m²" || e === "m2" || e === "qm") return "m²";
  if (e === "lfm" || e === "m" || e === "lm") return "lfm";
  if (e === "m³" || e === "m3") return "m³";
  if (/pausch|psch/.test(e)) return "pauschal";
  return "Stk.";
};

/** Aus den bepreisbaren LV-Positionen eine Kalkulation mit je einem Aufbau bauen. */
export function baueKalkulationAusLv(positionen: LvPositionKurz[]): KalkulationState {
  const st = newEmptyState();
  st.modules = [];
  let id = 1;
  for (const p of positionen) {
    if (p.positionsart === "text" || p.menge === null || !p.einheit) continue;
    const m = newModule(id++);
    m.name = `${p.positionsnummer} ${p.stichwort || ""}`.trim();
    m.area = Number(p.menge) || 0;
    m.angebotEinheit = angebotEinheitFuer(p.einheit);
    m.note = `LV-Menge ${String(p.menge).replace(".", ",")} ${p.einheit}`;
    m.lvPositionId = p.id;
    m.collapsed = true;
    st.modules.push(m);
  }
  return st;
}

/**
 * Einheitspreise je LV-Position aus der durchgerechneten Kalkulation:
 * EP = Gesamt ÷ Menge; Lohnanteil = Arbeit ÷ Menge; Sonstiges = Rest.
 * Aufbauten ohne Betrag bleiben unbepreist (werden nicht auf 0 gesetzt).
 */
export function epAusKalkulation(projekt: ProjektErgebnis): { lvPositionId: string; epLohn: number; epSonstiges: number }[] {
  const out: { lvPositionId: string; epLohn: number; epSonstiges: number }[] = [];
  for (const z of projekt.zeilen) {
    const id = z.module.lvPositionId;
    const menge = Number(z.module.area) || 0;
    if (!id || menge <= 0 || round2(z.gesamtAdj) <= 0) continue;
    const gesamt = round2(z.gesamtAdj / menge);
    const lohn = Math.min(gesamt, Math.max(0, round2(z.laborAdj / menge)));
    out.push({ lvPositionId: id, epLohn: lohn, epSonstiges: round2(gesamt - lohn) });
  }
  return out;
}

/**
 * Kalkulation laden, durchrechnen und die Einheitspreise in die LV-Positionen
 * schreiben. Liefert die Anzahl der bepreisten Positionen und die LV-ID.
 */
export async function schreibePreiseInsLv(kalkulationId: string): Promise<{ anzahl: number; lvId: string | null }> {
  const { data: kalk } = await (supabase.from("kalkulationen" as never) as any)
    .select("id, lv_id, data").eq("id", kalkulationId).maybeSingle();
  if (!kalk?.lv_id) return { anzahl: 0, lvId: null };
  const { data: setData } = await supabase.from("app_settings").select("key, value").like("key", "kalk\\_%");
  const settings: Record<string, string> = {};
  for (const s of setData || []) settings[s.key] = s.value;
  const st = normalizeKalkulationState(kalk.data);
  const bd = resolveBetriebsdaten(st.settings.businessData, settings);
  const eps = epAusKalkulation(calcProjekt(st, bd));
  const jetzt = new Date().toISOString();
  let anzahl = 0;
  for (const e of eps) {
    const { error } = await (supabase.from("lv_positionen" as never) as any)
      .update({ ep_lohn: e.epLohn, ep_sonstiges: e.epSonstiges, bepreist_am: jetzt })
      .eq("id", e.lvPositionId).eq("lv_id", kalk.lv_id);
    if (!error) anzahl += 1;
  }
  return { anzahl, lvId: kalk.lv_id as string };
}
