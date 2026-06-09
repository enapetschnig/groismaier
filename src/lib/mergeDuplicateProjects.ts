/**
 * Auto-Merge-Utility für Projekt-Duplikate.
 *
 * Projekt-Duplikate entstehen z.B. wenn beim Ersttermin zweimal auf
 * "Projekt erstellen" geklickt wird (alter Dialog hatte keine Duplicate-
 * Detection). Diese Funktion findet solche Gruppen (gleicher Name + gleicher
 * Kunde) und führt sie zusammen — das ÄLTESTE Projekt bleibt erhalten,
 * alle jüngeren werden samt FK-Referenzen und Storage-Dateien hineingemergt.
 *
 * Safety-Regel: Projekte OHNE Kunde werden nicht auto-merged (zu riskant —
 * "Test" könnte bei mehreren Kunden existieren).
 */
import { supabase } from "@/integrations/supabase/client";

/** FK-Tabellen die beim Mergen umgebogen werden müssen. */
const FK_TABLES: { table: string; col: string }[] = [
  { table: "einsaetze", col: "project_id" },
  { table: "board_projects", col: "project_id" },
  { table: "time_entries", col: "project_id" },
  { table: "disturbances", col: "project_id" },
  { table: "invoices", col: "project_id" },
  { table: "documents", col: "project_id" },
  { table: "project_daily_targets", col: "project_id" },
  { table: "assignment_resources", col: "project_id" },
  { table: "purchase_invoices", col: "project_id" },
];

/** Storage-Buckets mit {project_id}/-Ordnerstruktur */
const STORAGE_BUCKETS = ["project-photos", "project-plans", "project-reports", "project-materials"];

interface MergeResult {
  groupsMerged: number;
  projectsRemoved: number;
  details: string[]; // Namen der gemergten Gruppen
}

/**
 * Findet alle Projekt-Duplikate (gleicher Name + gleicher Kunde) und
 * führt sie zusammen. Das älteste Projekt bleibt erhalten.
 * Liefert Zusammenfassung für Toast.
 */
export async function mergeDuplicateProjects(): Promise<MergeResult> {
  const result: MergeResult = { groupsMerged: 0, projectsRemoved: 0, details: [] };

  const { data: projs } = await supabase
    .from("projects")
    .select("id, name, customer_id, created_at")
    .order("created_at", { ascending: true });

  if (!projs || projs.length === 0) return result;

  // Gruppieren nach (normalized name + customer_id)
  // Nur Projekte MIT Kunde werden auto-merged (Safety)
  const groups = new Map<string, typeof projs>();
  for (const p of projs as any[]) {
    if (!p.customer_id) continue;
    const key = `${(p.name || "").trim().toLowerCase()}|${p.customer_id}`;
    if (!groups.has(key)) groups.set(key, [] as any);
    groups.get(key)!.push(p);
  }

  for (const [, members] of groups) {
    if (members.length < 2) continue;
    // Ältestes = primary (erster wegen asc-Sortierung)
    const primary = (members as any[])[0];
    const losers = (members as any[]).slice(1);

    for (const loser of losers) {
      // 1. FK-Referenzen umbiegen
      for (const { table, col } of FK_TABLES) {
        try {
          await (supabase.from(table as never) as any)
            .update({ [col]: primary.id })
            .eq(col, loser.id);
        } catch { /* Tabelle evtl. nicht vorhanden — überspringen */ }
      }

      // 2. Storage-Dateien umziehen
      for (const bucket of STORAGE_BUCKETS) {
        try {
          const { data: files } = await supabase.storage.from(bucket).list(loser.id);
          if (files && files.length > 0) {
            for (const f of files) {
              const from = `${loser.id}/${f.name}`;
              const to = `${primary.id}/${f.name}`;
              try {
                await supabase.storage.from(bucket).move(from, to);
              } catch { /* Datei evtl. schon im Ziel — ignorieren */ }
            }
          }
        } catch { /* Bucket evtl. leer */ }
      }

      // 3. Loser löschen
      await supabase.from("projects").delete().eq("id", loser.id);
      result.projectsRemoved++;
    }

    result.groupsMerged++;
    result.details.push(primary.name);
  }

  return result;
}
