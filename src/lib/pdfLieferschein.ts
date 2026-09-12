// ============================================================================
// Lieferschein-PDF: Unterschriftsblock und Fotoseite (Kundenwunsch 11.09.2026)
//
// Wird vom pdfGenerator NUR für den Typ Lieferschein aufgerufen — alle
// anderen Belege bleiben unverändert. Lebt in einer eigenen Datei, damit
// der Generator keinen Datenbankzugriff bekommt; Unterschrift und Fotos
// werden hier anhand der Beleg-ID nachgeladen. So brauchen die vier Stellen,
// die ein PDF zusammenbauen (Liste, Editor, zwei Vorschauen), nichts davon
// zu wissen — sie müssen nur die ID mitgeben.
// ============================================================================
import type jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { renderPhotoGrid } from "./pdfPhotoGrid";
import { BELEG_FOTOS_ABLAGE } from "@/components/BelegFotos";

export interface UebergabeDaten {
  unterschrift_kunde: string | null;
  unterschrift_am: string | null;
  unterschrift_name: string | null;
  fotos: { file_path: string; file_name: string; beschreibung: string | null }[];
}

/** Unterschrift und Fotos zu einem Beleg laden. Fehler → leer, nie ein Abbruch des PDFs. */
export async function ladeUebergabe(invoiceId: string | null | undefined): Promise<UebergabeDaten> {
  const leer: UebergabeDaten = { unterschrift_kunde: null, unterschrift_am: null, unterschrift_name: null, fotos: [] };
  if (!invoiceId) return leer;
  try {
    const [{ data: inv }, { data: fotos }] = await Promise.all([
      (supabase.from("invoices") as any)
        .select("unterschrift_kunde, unterschrift_am, unterschrift_name")
        .eq("id", invoiceId)
        .maybeSingle(),
      (supabase.from("beleg_fotos" as never) as any)
        .select("file_path, file_name, beschreibung")
        .eq("invoice_id", invoiceId)
        .order("created_at"),
    ]);
    return {
      unterschrift_kunde: inv?.unterschrift_kunde ?? null,
      unterschrift_am: inv?.unterschrift_am ?? null,
      unterschrift_name: inv?.unterschrift_name ?? null,
      fotos: (fotos || []) as UebergabeDaten["fotos"],
    };
  } catch {
    return leer;
  }
}

interface Masse {
  ml: number;
  mr: number;
  pageWidth: number;
  pageHeight: number;
  /** Platz, den die Fußzeile unten braucht. */
  fussReserve: number;
}

const datumZeit = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("de-AT")} ${d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * Unterschriftsblock zeichnen und Fotos anhängen. Gibt die neue y-Position
 * zurück. Ohne Unterschrift kommen zwei Linien zum Unterschreiben von Hand —
 * der ausgedruckte Lieferschein fährt so mit dem LKW mit.
 */
export async function zeichneUebergabe(
  pdf: jsPDF,
  daten: UebergabeDaten,
  yStart: number,
  m: Masse,
): Promise<number> {
  let y = yStart + 14;
  const hoehe = 46;   // Block inkl. Überschrift
  if (y + hoehe > m.pageHeight - m.fussReserve) {
    pdf.addPage();
    y = 30;
  }

  pdf.setTextColor(0, 0, 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Übernahme der Ware", m.ml, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  if (daten.unterschrift_kunde) {
    try {
      pdf.addImage(daten.unterschrift_kunde, "PNG", m.ml, y, 60, 22);
    } catch {
      // Ein defektes Bild darf das PDF nicht verhindern — dann eben die Linie.
    }
    const textX = m.ml + 68;
    pdf.text(`Übernommen von: ${daten.unterschrift_name || "—"}`, textX, y + 8);
    if (daten.unterschrift_am) pdf.text(`am ${datumZeit(daten.unterschrift_am)}`, textX, y + 14);
    y += 24;
    pdf.setDrawColor(120, 120, 120);
    pdf.line(m.ml, y, m.ml + 60, y);
    pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 110);
    pdf.text("Unterschrift Kunde / Frächter", m.ml, y + 4);
    y += 8;
  } else {
    y += 16;
    pdf.setDrawColor(120, 120, 120);
    pdf.line(m.ml, y, m.ml + 70, y);
    pdf.line(m.ml + 85, y, m.ml + 135, y);
    pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 110);
    pdf.text("Unterschrift Kunde / Frächter", m.ml, y + 4);
    pdf.text("Datum", m.ml + 85, y + 4);
    y += 8;
  }
  pdf.setTextColor(0, 0, 0);

  if (daten.fotos.length > 0) {
    // Fotos auf eine eigene Seite — der Lieferschein selbst bleibt ein Blatt,
    // die Fotos sind Beilage.
    pdf.addPage();
    y = await renderPhotoGrid(
      pdf,
      daten.fotos.map((f) => ({
        bucket: BELEG_FOTOS_ABLAGE,
        file_path: f.file_path,
        file_name: f.file_name,
        beschreibung: f.beschreibung,
      })),
      30,
      { heading: "Fotos zur Lieferung", reserveFooter: m.fussReserve },
    );
  }
  return y;
}
