import { supabase } from "@/integrations/supabase/client";

/**
 * Quelle der Wahrheit für Projekt-Dateien = Supabase Storage (NICHT die
 * 'documents'-Tabelle). Damit erscheint JEDE hochgeladene Datei im Ordner —
 * egal über welchen Upload-Weg sie kam (QuickUpload, Kamera, Projekt-Anlage,
 * Projekt-Detail …) — und Zähler stimmen immer mit dem überein, was der Ordner
 * anzeigt. 'documents' ist nur noch ein optionaler Metadaten-Index (Kommentar
 * pro Foto).
 */

export interface ProjectFile {
  /** Storage-Pfad inkl. Projekt-Prefix, z.B. "<projectId>/123_foto.jpg" */
  path: string;
  /** Dateiname (letztes Pfadsegment) */
  name: string;
  /** Anzeige-/Download-URL (public bei project-photos, sonst signiert) */
  url: string;
  createdAt: string;
  size: number;
  /** documents-Zeile (falls vorhanden) — nur für Metadaten/Kommentar */
  docId: string | null;
  beschreibung: string | null;
}

/** Storage-Bucket -> documents.typ (für den optionalen Metadaten-Join) */
export const BUCKET_TYP: Record<string, string> = {
  "project-photos": "photos",
  "project-plans": "plans",
  "project-reports": "reports",
  "project-materials": "materials",
  "project-chef": "chef",
  "project-notizen": "notizen",
};

/** Nur dieser Bucket ist öffentlich — alle anderen brauchen signierte URLs. */
const PUBLIC_BUCKETS = new Set(["project-photos"]);

const UMLAUT: Record<string, string> = {
  "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss",
};

/**
 * Macht einen Dateinamen storage-sicher. Supabase-Storage lehnt Schlüssel mit
 * Umlauten/Sonderzeichen ab ("Invalid key") — z.B. "Plän Übersicht.pdf".
 * Umlaute werden transliteriert (ä→ae …), restliche Akzente entfernt und alles
 * Unsichere durch "_" ersetzt. Die Endung bleibt erhalten. Der ORIGINALname
 * wird separat in documents.name gespeichert (für die exakte Anzeige).
 */
export function safeStorageName(name: string): string {
  let s = (name || "").trim();
  s = s.replace(/[äöüÄÖÜß]/g, (c) => UMLAUT[c] || c);
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); // Akzente entfernen: é->e, à->a
  s = s.replace(/[^A-Za-z0-9._-]+/g, "_");                  // alles Unsichere → _
  s = s.replace(/_+/g, "_").replace(/^[._]+/, "");          // führende _/. entfernen
  return s || "datei";
}

/** Eindeutiger, storage-sicherer Pfad. "__" trennt das Unique-Präfix vom
 *  (sicheren) Originalnamen, damit humanizeStorageName ihn wiederherstellen kann. */
export function buildProjectFilePath(projectId: string, originalName: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${projectId}/${Date.now()}-${rand}__${safeStorageName(originalName)}`;
}

/** Lesbarer Anzeigename aus einem Storage-Schlüssel (Fallback, wenn keine
 *  documents-Zeile mit dem Originalnamen existiert). */
export function humanizeStorageName(storageName: string): string {
  const base = storageName.split("/").pop() || storageName;
  const i = base.indexOf("__");
  if (i >= 0) return base.slice(i + 2);
  return base.replace(/^\d{10,}[-_]/, ""); // Legacy: führenden Timestamp entfernen
}

/** Echte Dateien aus dem Storage-Listing (Unterordner haben id===null,
 *  Supabase-Platzhalter beginnen mit "."). */
function realFiles<T extends { id: string | null; name: string }>(objects: T[]): T[] {
  return objects.filter((o) => o.id !== null && !o.name.startsWith("."));
}

/** Storage-Einträge eines Projekts: Top-Level + EINE Ebene Unterordner
 *  (z.B. project-reports/<id>/angebote/…, wo generierte Rechnungs-/Angebots-
 *  PDFs liegen). Der relative Pfad inkl. Unterordner steckt in `name`. */
async function gatherEntries(
  projectId: string,
  bucket: string,
): Promise<Array<{ name: string; created_at?: string; size: number }>> {
  const { data: top, error } = await supabase.storage
    .from(bucket)
    .list(projectId, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (error || !top) return [];

  const toEntry = (o: any) => ({ name: o.name, created_at: o.created_at || o.updated_at, size: o.metadata?.size ?? 0 });
  const entries = realFiles(top).map(toEntry);

  // Unterordner (id===null) eine Ebene tief mitnehmen — sonst wären z.B.
  // generierte Rechnungs-/Angebots-PDFs im Projekt unsichtbar.
  const subfolders = top.filter((o) => o.id === null && !o.name.startsWith("."));
  if (subfolders.length > 0) {
    const subArrays = await Promise.all(
      subfolders.map(async (sf) => {
        const { data: subObjs } = await supabase.storage
          .from(bucket)
          .list(`${projectId}/${sf.name}`, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
        return realFiles(subObjs || []).map((o: any) => ({
          name: `${sf.name}/${o.name}`,
          created_at: o.created_at || o.updated_at,
          size: o.metadata?.size ?? 0,
        }));
      }),
    );
    for (const arr of subArrays) entries.push(...arr);
  }
  return entries;
}

/**
 * Listet alle Dateien eines Projekts direkt aus dem Storage-Bucket (inkl. einer
 * Ebene Unterordner) und reichert sie (best effort) mit documents-Metadaten an.
 * Gibt JEDES Storage-Objekt zurück, auch ohne documents-Zeile.
 */
export async function listProjectFiles(projectId: string, bucket: string): Promise<ProjectFile[]> {
  const entries = await gatherEntries(projectId, bucket);
  if (entries.length === 0) return [];

  // URLs auflösen: public direkt, privat als (gebündelte) signierte URLs.
  const paths = entries.map((o) => `${projectId}/${o.name}`);
  const urlByPath = new Map<string, string>();
  if (PUBLIC_BUCKETS.has(bucket)) {
    for (const p of paths) urlByPath.set(p, supabase.storage.from(bucket).getPublicUrl(p).data.publicUrl);
  } else {
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
    (signed || []).forEach((s, i) => { if (s?.signedUrl) urlByPath.set(paths[i], s.signedUrl); });
  }

  // documents-Metadaten einmalig laden und per Storage-Dateiname zuordnen.
  // Liefert den ORIGINALnamen (mit Umlauten) + Kommentar.
  const typ = BUCKET_TYP[bucket];
  const metaByName = new Map<string, { id: string; name: string | null; beschreibung: string | null }>();
  if (typ) {
    const { data: rows } = await supabase
      .from("documents")
      .select("id, name, file_url, beschreibung")
      .eq("project_id", projectId)
      .eq("typ", typ);
    for (const r of ((rows as any[]) || [])) {
      const seg = decodeURIComponent(((r.file_url || "").split("/").pop() || ""));
      if (seg) metaByName.set(seg, { id: r.id, name: r.name ?? null, beschreibung: r.beschreibung ?? null });
    }
  }

  return entries.map((o) => {
    const path = `${projectId}/${o.name}`;
    const baseName = o.name.split("/").pop() || o.name; // ohne Unterordner für den documents-Match
    const meta = metaByName.get(baseName);
    return {
      path,
      name: meta?.name || humanizeStorageName(o.name),
      url: urlByPath.get(path) || "",
      createdAt: o.created_at || new Date().toISOString(),
      size: o.size ?? 0,
      docId: meta?.id ?? null,
      beschreibung: meta?.beschreibung ?? null,
    };
  });
}

/** Nur die Anzahl der Dateien (für Zähler/Badges) — identische Filter-/
 *  Rekursionslogik wie listProjectFiles, aber ohne URL-/Metadaten-Auflösung. */
export async function countProjectFiles(projectId: string, bucket: string): Promise<number> {
  return (await gatherEntries(projectId, bucket)).length;
}

/**
 * Löscht eine Datei: zuerst das Storage-Objekt (die Quelle der Wahrheit, die
 * auch der Zähler liest), danach best effort die documents-Zeile. So bleibt
 * die "Anzahl" außen automatisch synchron mit dem Ordner.
 */
export async function deleteProjectFile(bucket: string, file: ProjectFile): Promise<{ error?: string }> {
  const { error } = await supabase.storage.from(bucket).remove([file.path]);
  if (error) return { error: error.message };
  if (file.docId) await supabase.from("documents").delete().eq("id", file.docId);
  return {};
}
