/**
 * Shared PDF-Briefkopf/Footer helpers.
 * Wird von BTB-, Ersttermin-, Protokoll- und Rechnungs-PDF verwendet,
 * damit das Look-and-Feel konsistent bleibt.
 */
import type jsPDF from "jspdf";
import type { InvoiceLayoutSettings } from "./invoiceLayoutTypes";
import { hexToRgb } from "./invoiceLayoutTypes";

export const LETTERHEAD_MARGIN = { left: 15, right: 15, top: 15, bottom: 20 };

export interface LetterheadResult {
  /** Y-Koordinate direkt unterhalb des Briefkopfs (weiter arbeiten mit y = ...) */
  afterY: number;
}

/**
 * Zeichnet den Briefkopf auf der aktuellen Seite.
 * - Logo links (aspect-ratio-preserving)
 * - Firmen-Info rechts
 * - Graue Trennlinie unten
 */
export function drawLetterhead(
  pdf: jsPDF,
  layout: InvoiceLayoutSettings,
  logoDataUri: string | undefined,
  firmenUid?: string,
): LetterheadResult {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const { left: ml, right: mr, top } = LETTERHEAD_MARGIN;
  let y = top;
  let logoBottomY = y;
  let logoRightX = ml;

  // Logo
  if (logoDataUri && layout.logo.enabled) {
    try {
      let logoW = layout.logo.width_mm;
      let logoH = layout.logo.height_mm;
      try {
        const props = pdf.getImageProperties(logoDataUri);
        if (props.width > 0 && props.height > 0) {
          const aspect = props.width / props.height;
          logoH = logoW / aspect;
        }
      } catch { /* fallback to layout values */ }

      // Logo bündig zum Content-Margin + optionaler Offset aus
      // Layout-Settings (für PNGs mit transparenten Rändern).
      const logoOffset = Math.max(0, Number(layout.logo.offset_x_mm) || 0);
      const logoX =
        layout.logo.position === "right" ? pageWidth - mr - logoW :
        layout.logo.position === "center" ? (pageWidth - logoW) / 2 :
        ml + logoOffset;
      pdf.addImage(logoDataUri, "PNG", logoX, y, logoW, logoH);
      logoBottomY = y + logoH;
      logoRightX = logoX + logoW;
    } catch { /* skip logo on error */ }
  }

  // Company info — immer rendern: rechts neben Logo wenn Platz ≥ 50 mm,
  // sonst horizontale Zeile unter dem Logo.
  const infoLines = [
    layout.company.address_line1,
    layout.company.address_line2,
    layout.company.phone ? "Tel: " + layout.company.phone : "",
    layout.company.email,
    layout.company.website,
  ].filter(Boolean) as string[];
  const hasAnyInfo = infoLines.length > 0 || !!firmenUid;

  if (hasAnyInfo && layout.logo.position === "right") {
    // Logo oben rechts → Firmen-/Kontaktinfo linksbündig oben links.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(0, 35, 55);
    pdf.text(layout.company.name, ml, y + 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(80, 80, 80);
    infoLines.forEach((line, i) => {
      pdf.text(line, ml, y + 7 + i * 3.5);
    });
    if (firmenUid) {
      pdf.setFont("helvetica", "bold");
      pdf.text(`UID: ${firmenUid}`, ml, y + 7 + infoLines.length * 3.5);
      pdf.setFont("helvetica", "normal");
    }
    logoBottomY = Math.max(logoBottomY, y + 7 + (infoLines.length + (firmenUid ? 1 : 0)) * 3.5);
  } else if (hasAnyInfo) {
    const infoStartX = logoRightX + 5;
    const availableInfoWidth = pageWidth - mr - infoStartX;

    if (availableInfoWidth >= 50) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(80, 80, 80);
      infoLines.forEach((line, i) => {
        pdf.text(line, pageWidth - mr, y + 3 + i * 3.5, { align: "right" });
      });
      if (firmenUid) {
        pdf.setFont("helvetica", "bold");
        pdf.text(`UID: ${firmenUid}`, pageWidth - mr, y + 3 + infoLines.length * 3.5, { align: "right" });
        pdf.setFont("helvetica", "normal");
      }
    } else {
      // Horizontale Fallback-Zeile unter dem Logo
      const parts = [...infoLines];
      if (firmenUid) parts.push(`UID: ${firmenUid}`);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(80, 80, 80);
      const belowY = Math.max(logoBottomY + 4, top + 20);
      pdf.text(parts.join(" · "), ml, belowY, { maxWidth: pageWidth - ml - mr });
      logoBottomY = belowY + 2;
    }
  }

  // Abstand unter dem Logo
  y = Math.max(logoBottomY + 4, top + 22);

  // Trennlinie
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(ml, y, pageWidth - mr, y);
  y += 5;

  return { afterY: y };
}

/**
 * Zeichnet auf jeder Seite den Footer (Unternehmens-Kurzinfo + Akzent-Linie).
 * Muss NACH allen Body-Inhalten aufgerufen werden, damit die Seitenzahl
 * die tatsächliche Anzahl kennt.
 */
export function drawFooter(
  pdf: jsPDF,
  layout: InvoiceLayoutSettings,
  opts?: { withPageNumbers?: boolean },
) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const { left: ml, right: mr } = LETTERHEAD_MARGIN;
  const [acR, acG, acB] = hexToRgb(layout.accent_color);
  const totalPages = pdf.internal.getNumberOfPages();

  const line1 = layout.footer.line1 ||
    [layout.company.name, layout.company.slogan, layout.company.address_line1, layout.company.address_line2]
      .filter(Boolean).join(" \u00B7 ");
  const line2 = layout.footer.line2 || "";
  const line3 = layout.footer.line3 || "";

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    const baseY = pageHeight - 12;

    // Akzent-Linie in grünem Akzent
    pdf.setDrawColor(acR, acG, acB);
    pdf.setLineWidth(0.5);
    pdf.line(ml, baseY, pageWidth - mr, baseY);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(102, 102, 102);

    let fy = baseY + 3.5;
    if (line1) { pdf.text(line1, pageWidth / 2, fy, { align: "center" }); fy += 3.5; }
    if (line2) { pdf.text(line2, pageWidth / 2, fy, { align: "center" }); fy += 3.5; }
    if (line3) { pdf.text(line3, pageWidth / 2, fy, { align: "center" }); fy += 3.5; }

    if (opts?.withPageNumbers !== false && totalPages > 1) {
      pdf.text(`Seite ${i} von ${totalPages}`, pageWidth - mr, baseY + 3.5, { align: "right" });
    }
  }
}

/**
 * Zeichnet den Titel-Block (große Überschrift + Akzent-Linie).
 * Beispiel: "Bautagesbericht Nr. 42" oder "Besprechungsprotokoll".
 */
export function drawTitleBlock(
  pdf: jsPDF,
  layout: InvoiceLayoutSettings,
  title: string,
  subtitle: string | undefined,
  yStart: number,
): number {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const { left: ml, right: mr } = LETTERHEAD_MARGIN;
  const [acR, acG, acB] = hexToRgb(layout.accent_color);
  let y = yStart + 4;

  // Akzent-Linie zuerst, Titel darunter — einheitlich zum Rechnungs-PDF.
  pdf.setDrawColor(acR, acG, acB);
  pdf.setLineWidth(0.8);
  pdf.line(ml, y, pageWidth - mr, y);
  y += 6;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(26, 26, 26);
  pdf.text(title, ml, y);
  y += 8;

  if (subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text(subtitle, ml, y);
    y += 6;
  }

  return y;
}
