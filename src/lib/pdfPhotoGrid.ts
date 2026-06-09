/**
 * Zeichnet Fotos als Grid auf PDF-Seiten (2 Spalten).
 * - Lädt Fotos aus Supabase Storage
 * - Skaliert client-seitig runter (max 1200px Breite, JPEG 75%), damit
 *   das PDF nicht riesig wird, wenn User 20× 5MB-Fotos hochgeladen hat
 * - Paginiert automatisch: wenn nicht genug Platz → neue Seite
 */
import type jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { LETTERHEAD_MARGIN } from "./pdfLetterhead";

export interface PhotoInput {
  bucket: string;
  file_path: string;
  beschreibung?: string | null;
  file_name?: string;
}

interface LoadedPhoto extends PhotoInput {
  dataUri: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.75;

async function fetchPhotoAsDataUri(p: PhotoInput): Promise<LoadedPhoto | null> {
  try {
    const { data: signed } = await supabase.storage
      .from(p.bucket)
      .createSignedUrl(p.file_path, 300);
    const url = signed?.signedUrl;
    if (!url) return null;

    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();

    // Scale via canvas
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = URL.createObjectURL(blob);
    });

    const ratio = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);

    const dataUri = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { ...p, dataUri, width: w, height: h };
  } catch {
    return null;
  }
}

/**
 * Rendert Fotos als 2-Spalten-Grid. Startet auf neuer Seite, wenn weniger
 * als 60mm Platz verbleibt. Gibt Y-Koordinate nach letztem Foto zurück.
 */
export async function renderPhotoGrid(
  pdf: jsPDF,
  photos: PhotoInput[],
  yStart: number,
  options?: { heading?: string; reserveFooter?: number },
): Promise<number> {
  if (!photos || photos.length === 0) return yStart;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const { left: ml, right: mr } = LETTERHEAD_MARGIN;
  const reserveFooter = options?.reserveFooter ?? 20;
  const contentWidth = pageWidth - ml - mr;
  const cols = 2;
  const gap = 5;
  const cellWidth = (contentWidth - gap * (cols - 1)) / cols;
  const cellHeight = cellWidth * 0.75; // 4:3 default slot
  const captionHeight = 10;
  const slotHeight = cellHeight + captionHeight + 5;

  // Parallel laden (max 4 gleichzeitig, damit Browser nicht blockiert)
  const loaded: LoadedPhoto[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < photos.length; i += CONCURRENCY) {
    const batch = photos.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fetchPhotoAsDataUri));
    results.forEach((r) => { if (r) loaded.push(r); });
  }
  if (loaded.length === 0) return yStart;

  let y = yStart;

  // Überschrift
  if (options?.heading) {
    if (y + 10 + slotHeight > pageHeight - reserveFooter) {
      pdf.addPage();
      y = LETTERHEAD_MARGIN.top;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(26, 26, 26);
    pdf.text(options.heading, ml, y + 4);
    y += 8;
  }

  for (let idx = 0; idx < loaded.length; idx += cols) {
    // Seitenumbruch, wenn slot nicht mehr passt
    if (y + slotHeight > pageHeight - reserveFooter) {
      pdf.addPage();
      y = LETTERHEAD_MARGIN.top;
    }

    for (let c = 0; c < cols; c++) {
      const photo = loaded[idx + c];
      if (!photo) continue;
      const x = ml + c * (cellWidth + gap);

      // Bild zentriert in Slot, Aspect-Ratio wahrend
      const aspect = photo.width / photo.height;
      let imgW = cellWidth;
      let imgH = cellWidth / aspect;
      if (imgH > cellHeight) {
        imgH = cellHeight;
        imgW = cellHeight * aspect;
      }
      const offsetX = (cellWidth - imgW) / 2;
      const offsetY = (cellHeight - imgH) / 2;

      try {
        pdf.addImage(photo.dataUri, "JPEG", x + offsetX, y + offsetY, imgW, imgH);
      } catch { /* skip broken image */ }

      // Rahmen
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, cellWidth, cellHeight);

      // Caption
      const caption = photo.beschreibung || photo.file_name || "";
      if (caption) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(80, 80, 80);
        const lines = pdf.splitTextToSize(caption, cellWidth);
        pdf.text(lines.slice(0, 2), x, y + cellHeight + 4);
      }
    }

    y += slotHeight;
  }

  return y;
}
