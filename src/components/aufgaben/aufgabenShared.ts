// ============================================================================
// Aufgaben / ToDo-Liste (Kundenwunsch 19.08.2026) — gemeinsame Typen, das
// farbliche Status-System und die Tabellen-Zugriffe.
//
// Hinweis Typen: aufgaben/aufgaben_fotos fehlen — wie andere neue Tabellen —
// in den generierten Supabase-Typen; daher wie im restlichen Projekt mit
// `from("…" as never) as any` gecastet und lokal getippt.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

export type AufgabeStatus = "wartet_freigabe" | "offen" | "in_arbeit" | "erledigt";

export interface Aufgabe {
  id: string;
  created_at: string;
  erstellt_von: string;
  titel: string;
  beschreibung: string | null;
  zugewiesen_an: string | null;
  team_id: string | null;
  faellig_am: string | null; // yyyy-mm-dd
  status: AufgabeStatus;
  erledigt_am: string | null;
}

export interface AufgabeFoto {
  id: string;
  aufgabe_id: string;
  file_path: string;
  file_name: string;
}

export const aufgabenTable = () => (supabase.from("aufgaben" as never) as any);
export const aufgabenFotosTable = () => (supabase.from("aufgaben_fotos" as never) as any);

export const AUFGABEN_FOTO_BUCKET = "aufgaben-fotos";

export const fotoUrl = (filePath: string): string =>
  supabase.storage.from(AUFGABEN_FOTO_BUCKET).getPublicUrl(filePath).data.publicUrl;

/** Farbliches Status-System (Kundenwunsch: „zB ein farbliches System für in
 *  Arbeit, erledigt oder so"). chip = Badge, rand = linker Kartenrand. */
export const STATUS_META: Record<AufgabeStatus, { label: string; chip: string; rand: string; punkt: string }> = {
  wartet_freigabe: {
    label: "Wartet auf Freigabe",
    chip: "bg-violet-100 text-violet-800 border border-violet-300",
    rand: "border-l-violet-500",
    punkt: "bg-violet-500",
  },
  offen: {
    label: "Offen",
    chip: "bg-blue-100 text-blue-800 border border-blue-300",
    rand: "border-l-blue-500",
    punkt: "bg-blue-500",
  },
  in_arbeit: {
    label: "In Arbeit",
    chip: "bg-amber-100 text-amber-800 border border-amber-300",
    rand: "border-l-amber-500",
    punkt: "bg-amber-500",
  },
  erledigt: {
    label: "Erledigt",
    chip: "bg-green-100 text-green-800 border border-green-300",
    rand: "border-l-green-500",
    punkt: "bg-green-500",
  },
};

/** Anzeige-Reihenfolge in der Liste: Freigaben zuerst, Erledigtes zuletzt. */
export const STATUS_REIHENFOLGE: AufgabeStatus[] = ["wartet_freigabe", "offen", "in_arbeit", "erledigt"];

/** Frist-Text inkl. Überfälligkeit ("in 3 Tagen", "heute fällig", "seit 2 Tagen überfällig"). */
export function fristInfo(faelligAm: string | null): { text: string; ueberfaellig: boolean } | null {
  if (!faelligAm) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const faellig = new Date(`${faelligAm}T12:00:00`);
  const tage = Math.ceil((faellig.getTime() - heute.getTime()) / 86400000);
  const datum = faellig.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (tage < 0) return { text: `${datum} — seit ${Math.abs(tage)} Tag${Math.abs(tage) === 1 ? "" : "en"} überfällig`, ueberfaellig: true };
  if (tage === 0) return { text: `${datum} — heute fällig`, ueberfaellig: true };
  return { text: `${datum} — in ${tage} Tag${tage === 1 ? "" : "en"}`, ueberfaellig: false };
}

/** Team-IDs des angemeldeten Benutzers (für „mir zugewiesen"-Filter). */
export async function ladeMeineTeamIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from("team_members").select("team_id").eq("user_id", userId);
  return (data || []).map((r) => r.team_id);
}

/** Ist die Aufgabe dieser Person (direkt oder über ihr Team) zugewiesen? */
export const istMirZugewiesen = (a: Aufgabe, userId: string, meineTeamIds: string[]): boolean =>
  a.zugewiesen_an === userId || (!!a.team_id && meineTeamIds.includes(a.team_id));
