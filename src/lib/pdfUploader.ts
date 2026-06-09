/**
 * Lädt ein generiertes PDF-Blob in Supabase Storage hoch und
 * liefert den Storage-Pfad zurück.
 *
 * Ordner-Struktur im Bucket project-reports:
 *   {project_id}/berichte/       → Bautagesberichte
 *   {project_id}/protokolle/     → Besprechungsprotokoll + Ersttermin
 *   {project_id}/rechnungen/     → Rechnungen
 *   {project_id}/angebote/       → Angebote
 *   {project_id}/regieberichte/  → Regieberichte / Störungsmeldungen
 *
 * Wenn project_id fehlt (Orphan), wird unter _orphan/ abgelegt.
 */
import { supabase } from "@/integrations/supabase/client";
import { safeStorageName } from "@/lib/projectFiles";

export type PdfCategory = "berichte" | "protokolle" | "rechnungen" | "angebote" | "regieberichte";

export interface UploadPdfOptions {
  projectId: string | null;
  category: PdfCategory;
  /** Dateiname ohne Extension, z.B. "btb-42-2026-04-18" */
  basename: string;
  blob: Blob;
}

export interface UploadPdfResult {
  path: string;           // Storage-Pfad innerhalb des Buckets
  bucket: string;
  signedUrl?: string;     // kurzlebige signierte URL zum sofortigen Öffnen
}

const BUCKET = "project-reports";
const SIGNED_TTL = 60 * 60; // 1 Stunde

/** Sanitiert einen Dateinamen-Baustein storage-sicher (Umlaute werden
 *  transliteriert — Supabase lehnt Umlaute im Key sonst ab). */
function sanitize(name: string): string {
  return safeStorageName(name).slice(0, 120);
}

export async function uploadProjectPdf(opts: UploadPdfOptions): Promise<UploadPdfResult> {
  const folder = opts.projectId || "_orphan";
  const path = `${folder}/${opts.category}/${sanitize(opts.basename)}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, opts.blob, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "300",
    });
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);

  return { path, bucket: BUCKET, signedUrl: signed?.signedUrl };
}

/** Erzeugt eine signierte URL für ein bereits hochgeladenes PDF. */
export async function getProjectPdfUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl || null;
}
