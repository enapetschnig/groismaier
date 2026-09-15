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

export interface LvZielPosition { id: string; positionsnummer: string; menge: number | null }
export interface EpZuordnung {
  eps: { lvPositionId: string; epLohn: number; epSonstiges: number }[];
  /** Aufbauten mit Betrag, aber ohne erkennbare LV-Position (Name ohne Pos-Nr, kein Verweis). */
  ohneZuordnung: string[];
}

/**
 * Welche LV-Position gehört zu einem Aufbau? Zuerst die Positionsnummer am
 * Anfang des Namens („5.3.2 Massivstiege …"), sonst der gespeicherte Verweis.
 *
 * Meldung 15.09.2026 (LV H38): Der Chef hatte Aufbauten geklont und
 * umbenannt (5.3.1 → 5.3.2, 5.3.3); die Kopien trugen aber noch den Verweis
 * des Originals. „Preise ins LV übernehmen" schrieb dreimal auf 5.3.1,
 * 5.3.2 und 5.3.3 blieben leer. Der Name ist das, was der Chef sieht — er
 * gewinnt deshalb gegen den unsichtbaren Verweis.
 */
export function lvPositionFuerAufbau(
  m: Pick<KalkModule, "name" | "lvPositionId">,
  positionen?: LvZielPosition[],
): LvZielPosition | undefined {
  if (positionen && positionen.length) {
    const name = (m.name || "").trim();
    let beste: LvZielPosition | undefined;
    for (const p of positionen) {
      const nr = (p.positionsnummer || "").trim();
      if (!nr) continue;
      if (name === nr || name.startsWith(nr + " ") || name.startsWith(nr + "\t")) {
        if (!beste || nr.length > beste.positionsnummer.length) beste = p;
      }
    }
    if (beste) return beste;
    if (m.lvPositionId) return positionen.find((p) => p.id === m.lvPositionId);
    return undefined;
  }
  return m.lvPositionId ? { id: m.lvPositionId, positionsnummer: "", menge: null } : undefined;
}

/**
 * Einheitspreise je LV-Position aus der durchgerechneten Kalkulation:
 * EP = Gesamt ÷ Menge; Lohnanteil = Arbeit ÷ Menge; Sonstiges = Rest.
 * Mehrere Aufbauten für dieselbe Position werden summiert (Menge = LV-Menge).
 * Aufbauten ohne Betrag bleiben unbepreist (werden nicht auf 0 gesetzt).
 */
export function zuordnungAusKalkulation(projekt: ProjektErgebnis, positionen?: LvZielPosition[]): EpZuordnung {
  const summen = new Map<string, { gesamt: number; lohn: number; menge: number }>();
  const ohneZuordnung: string[] = [];
  for (const z of projekt.zeilen) {
    if (round2(z.gesamtAdj) <= 0) continue;
    const ziel = lvPositionFuerAufbau(z.module, positionen);
    if (!ziel) { ohneZuordnung.push(z.module.name || `Aufbau ${z.module.id}`); continue; }
    const menge = ziel.menge != null && ziel.menge > 0 ? Number(ziel.menge) : (Number(z.module.area) || 0);
    if (menge <= 0) continue;
    const e = summen.get(ziel.id) || { gesamt: 0, lohn: 0, menge };
    e.gesamt += z.gesamtAdj;
    e.lohn += z.laborAdj;
    summen.set(ziel.id, e);
  }
  const eps: EpZuordnung["eps"] = [];
  for (const [lvPositionId, e] of summen) {
    const gesamt = round2(e.gesamt / e.menge);
    const lohn = Math.min(gesamt, Math.max(0, round2(e.lohn / e.menge)));
    eps.push({ lvPositionId, epLohn: lohn, epSonstiges: round2(gesamt - lohn) });
  }
  return { eps, ohneZuordnung };
}

export function epAusKalkulation(projekt: ProjektErgebnis, positionen?: LvZielPosition[]): EpZuordnung["eps"] {
  return zuordnungAusKalkulation(projekt, positionen).eps;
}

/**
 * Kalkulation laden, durchrechnen und die Einheitspreise in die LV-Positionen
 * schreiben. Liefert die Anzahl der bepreisten Positionen und die LV-ID.
 */
export async function schreibePreiseInsLv(kalkulationId: string): Promise<{ anzahl: number; lvId: string | null; ohneZuordnung: string[] }> {
  const { data: kalk } = await (supabase.from("kalkulationen" as never) as any)
    .select("id, lv_id, data").eq("id", kalkulationId).maybeSingle();
  if (!kalk?.lv_id) return { anzahl: 0, lvId: null, ohneZuordnung: [] };
  // Die Positionen des LVs — Zuordnung über die Positionsnummer im Aufbau-Namen.
  const { data: posData } = await (supabase.from("lv_positionen" as never) as any)
    .select("id, positionsnummer, menge").eq("lv_id", kalk.lv_id).neq("positionsart", "text");
  const positionen: LvZielPosition[] = ((posData as any[]) || []).map((p) => ({
    id: p.id, positionsnummer: String(p.positionsnummer || ""), menge: p.menge != null ? Number(p.menge) : null,
  }));
  const { data: setData } = await supabase.from("app_settings").select("key, value").like("key", "kalk\\_%");
  const settings: Record<string, string> = {};
  for (const s of setData || []) settings[s.key] = s.value;
  const st = normalizeKalkulationState(kalk.data);
  const bd = resolveBetriebsdaten(st.settings.businessData, settings);
  const { eps, ohneZuordnung } = zuordnungAusKalkulation(calcProjekt(st, bd), positionen);
  const jetzt = new Date().toISOString();
  let anzahl = 0;
  for (const e of eps) {
    const { error } = await (supabase.from("lv_positionen" as never) as any)
      .update({ ep_lohn: e.epLohn, ep_sonstiges: e.epSonstiges, bepreist_am: jetzt })
      .eq("id", e.lvPositionId).eq("lv_id", kalk.lv_id);
    if (!error) anzahl += 1;
  }
  return { anzahl, lvId: kalk.lv_id as string, ohneZuordnung };
}
