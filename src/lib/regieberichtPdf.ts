// ============================================================================
// Regiebericht als PDF — eine Quelle für Detailmaske, Liste und Mailversand.
//
// Kundenwunsch 01.09.2026: „Regieberichte müssen im Original an die Rechnung
// angehängt werden … hier im Regiebericht-Menü brauch ich auch eine
// Möglichkeit, Berichte einzeln oder eine Auswahl zu drucken."
//
// Der Aufbau (Briefkopf, Kunde, Zeiten, Material, Maschinen, Unterschrift)
// stammt unverändert aus der Detailmaske — nur an EINE Stelle gezogen, damit
// alle Wege dasselbe Dokument erzeugen.
// ============================================================================
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { parseDecimal } from "@/lib/num";

export type Disturbance = {
  id: string;
  datum: string;
  start_time: string | null;
  end_time: string | null;
  stunden: number;
  beschreibung: string | null;
  kunde_name: string;
  kunde_adresse?: string | null;
  kunde_plz?: string | null;
  kunde_ort?: string | null;
  kunde_email?: string | null;
  kunde_telefon?: string | null;
  status: string;
  is_verrechnet: boolean;
  project_id: string | null;
  customer_id: string | null;
  pdf_path: string | null;
  unterschrift_kunde: string | null;
  unterschrift_am: string | null;
  pause_minutes?: number | null;
  notizen?: string | null;
  [k: string]: unknown;
};

export type Worker = {
  user_id: string;
  is_main?: boolean;
  vorname: string;
  nachname: string;
};

async function baueRegieberichtPdf(d: Disturbance, workers: Worker[]): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }, { loadDocumentLayout }, { loadInvoiceLogo }, letterhead] =
    await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
      import("@/lib/loadLayout"),
      import("@/lib/logoLoader"),
      import("@/lib/pdfLetterhead"),
    ]);
  const { drawLetterhead, drawFooter, drawTitleBlock, LETTERHEAD_MARGIN } = letterhead;

  const { layout, firmenUid } = await loadDocumentLayout();
  const logoUri = await loadInvoiceLogo();

  // compress: true — sonst wird das PDF durch Logo + Unterschrift mehrere MB
  // groß, was am Handy/Baustellennetz spürbar ist.
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const ml = LETTERHEAD_MARGIN.left;
  const mr = LETTERHEAD_MARGIN.right;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentW = pageWidth - ml - mr;

  const { afterY } = drawLetterhead(pdf, layout, logoUri, firmenUid);
  let y = drawTitleBlock(
    pdf,
    layout,
    "Regiebericht",
    `${format(new Date(d.datum), "dd.MM.yyyy", { locale: de })} · ${d.kunde_name}`,
    afterY,
  );
  y += 2;

  const label = (text: string, value: string, yy: number): number => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(60, 60, 60);
    pdf.text(text, ml, yy);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    const lines = pdf.splitTextToSize(value || "-", contentW - 38);
    pdf.text(lines, ml + 38, yy);
    return yy + Math.max(5, lines.length * 4.4);
  };

  // Kundendaten
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Kunde", ml, y);
  y += 5.5;
  y = label("Name:", d.kunde_name, y);
  const adressLine = [d.kunde_adresse, [d.kunde_plz, d.kunde_ort].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");
  if (adressLine) y = label("Adresse:", adressLine, y);
  if (d.kunde_telefon) y = label("Telefon:", d.kunde_telefon, y);
  if (d.kunde_email) y = label("E-Mail:", d.kunde_email, y);
  y += 3;

  // Einsatzdaten
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Einsatz", ml, y);
  y += 5.5;
  y = label("Datum:", format(new Date(d.datum), "EEEE, dd. MMMM yyyy", { locale: de }), y);
  y = label("Arbeitszeit:", `${d.start_time.slice(0, 5)} – ${d.end_time.slice(0, 5)} Uhr`, y);
  if (Number(d.pause_minutes) > 0) y = label("Pause:", `${d.pause_minutes} Minuten`, y);
  y = label("Gesamtstunden:", `${Number(d.stunden).toFixed(2)} h`, y);
  if (workers.length > 0) {
    y = label("Mitarbeiter:", workers.map(w => `${w.vorname} ${w.nachname}`.trim()).filter(Boolean).join(", "), y);
  }
  y += 3;

  // Arbeiten
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Durchgeführte Arbeiten", ml, y);
  y += 5.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const bLines = pdf.splitTextToSize(d.beschreibung || "-", contentW);
  pdf.text(bLines, ml, y);
  y += bLines.length * 4.4 + 3;

  if (d.notizen) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text("Notizen", ml, y);
    y += 4.5;
    pdf.setFont("helvetica", "normal");
    const nLines = pdf.splitTextToSize(String(d.notizen ?? ""), contentW);
    pdf.text(nLines, ml, y);
    y += nLines.length * 4.4 + 3;
  }

  // Material
  const { data: mats } = await supabase
    .from("disturbance_materials")
    .select("material, menge, einheit, notizen, einzelpreis")
    .eq("disturbance_id", d.id)
    .order("created_at", { ascending: true });

  if (mats && mats.length > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Verwendetes Material", ml, y);
    y += 3;
    autoTable(pdf, {
      startY: y,
      head: [["Material", "Menge", "Einheit", "Preis/Einh.", "Notiz"]],
      body: mats.map((m: any) => [
        m.material || "", m.menge || "", m.einheit || "",
        m.einzelpreis != null ? `€ ${Number(m.einzelpreis).toFixed(2)}` : "",
        m.notizen || "",
      ]),
      theme: "plain",
      margin: { left: ml, right: mr, bottom: 26 },
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5 },
      bodyStyles: { fontSize: 9, textColor: [0, 0, 0], lineWidth: { bottom: 0.15 }, lineColor: [200, 200, 200] },
      columnStyles: { 1: { halign: "right", cellWidth: 20 }, 2: { cellWidth: 20 } },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  // Maschinen / Werkzeug (Kundenwunsch) — mit Satz und Gesamtbetrag,
  // damit der Kunde die Weiterverrechnung nachvollziehen kann.
  const { data: masch } = await (supabase.from("disturbance_maschinen" as never) as any)
    .select("maschine, menge, einheit, einzelpreis")
    .eq("disturbance_id", d.id)
    .order("created_at", { ascending: true });

  if (masch && masch.length > 0) {
    const eur = (n: number) => n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const zeilen = (masch as any[]).map((m) => {
      const menge = parseDecimal(String(m.menge ?? "")) ?? 0;
      const satz = m.einzelpreis != null ? Number(m.einzelpreis) : null;
      return [
        m.maschine || "",
        m.menge || "",
        m.einheit || "",
        satz != null ? `${eur(satz)} €` : "",
        satz != null && menge > 0 ? `${eur(menge * satz)} €` : "",
      ];
    });
    const summe = (masch as any[]).reduce((sum, m) => {
      const menge = parseDecimal(String(m.menge ?? "")) ?? 0;
      return sum + (m.einzelpreis != null ? menge * Number(m.einzelpreis) : 0);
    }, 0);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Maschinen / Werkzeug", ml, y);
    y += 3;
    autoTable(pdf, {
      startY: y,
      head: [["Maschine", "Menge", "Einheit", "Satz", "Gesamt"]],
      body: summe > 0 ? [...zeilen, ["", "", "", "Summe", `${eur(summe)} €`]] : zeilen,
      theme: "plain",
      margin: { left: ml, right: mr, bottom: 26 },
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5 },
      bodyStyles: { fontSize: 9, textColor: [0, 0, 0], lineWidth: { bottom: 0.15 }, lineColor: [200, 200, 200] },
      columnStyles: {
        1: { halign: "right", cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { halign: "right", cellWidth: 22 },
        4: { halign: "right", cellWidth: 24, fontStyle: "bold" },
      },
      didParseCell: (data: any) => {
        if (summe > 0 && data.section === "body" && data.row.index === zeilen.length) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  // Fotos des Einsatzes (Kundenwunsch 02.09.2026: „die Bilder, die im
  // Bericht hinterlegt sind, müssen auch auf den Bericht mit drauf").
  // Zwei je Reihe, bei Platzmangel neue Seite; ein Foto, das nicht ladbar
  // ist, wird still übersprungen — der Bericht darf daran nicht scheitern.
  const pageHeight = pdf.internal.pageSize.getHeight();
  try {
    const { data: fotos } = await supabase
      .from("disturbance_photos")
      .select("file_path, file_name")
      .eq("disturbance_id", d.id)
      .order("created_at");
    const liste = ((fotos as any[]) || []);
    if (liste.length > 0) {
      const bildBreite = (contentW - 6) / 2;
      const bildHoehe = bildBreite * 0.75;
      if (y > pageHeight - (bildHoehe + 40)) { pdf.addPage(); y = LETTERHEAD_MARGIN.top; }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Fotos (${liste.length})`, ml, y);
      y += 4;
      let spalte = 0;
      for (const f of liste) {
        const { data: pu } = supabase.storage.from("disturbance-photos").getPublicUrl(f.file_path);
        let dataUrl: string | null = null;
        try {
          const antwort = await fetch(pu.publicUrl);
          if (antwort.ok) {
            const blob = await antwort.blob();
            dataUrl = await new Promise<string>((auf, ab) => {
              const r = new FileReader();
              r.onload = () => auf(String(r.result));
              r.onerror = () => ab(new Error("Foto nicht lesbar"));
              r.readAsDataURL(blob);
            });
          }
        } catch { dataUrl = null; }
        if (!dataUrl) continue;
        if (spalte === 0 && y + bildHoehe > pageHeight - 30) { pdf.addPage(); y = LETTERHEAD_MARGIN.top; }
        const x = ml + spalte * (bildBreite + 6);
        try {
          const typ = /^data:image\/png/i.test(dataUrl) ? "PNG" : "JPEG";
          pdf.addImage(dataUrl, typ, x, y, bildBreite, bildHoehe, undefined, "MEDIUM");
        } catch { /* Format nicht einbettbar — überspringen */ }
        spalte += 1;
        if (spalte === 2) { spalte = 0; y += bildHoehe + 5; }
      }
      if (spalte !== 0) y += bildHoehe + 5;
      y += 2;
    }
  } catch { /* ohne Fotos weiter */ }

  // Unterschrift
  if (y > pageHeight - 70) {
    pdf.addPage();
    y = LETTERHEAD_MARGIN.top;
  }
  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Unterschrift Kunde", ml, y);
  y += 3;
  if (d.unterschrift_kunde) {
    try {
      pdf.addImage(d.unterschrift_kunde, "PNG", ml, y, 70, 26);
    } catch { /* Unterschrift optional */ }
    y += 28;
  } else {
    y += 26;
  }
  pdf.setDrawColor(120, 120, 120);
  pdf.setLineWidth(0.3);
  pdf.line(ml, y, ml + 75, y);
  y += 4;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  pdf.text(
    d.unterschrift_am
      ? `${d.kunde_name} · unterschrieben am ${format(new Date(d.unterschrift_am), "dd.MM.yyyy HH:mm", { locale: de })}`
      : `${d.kunde_name} · (ohne Unterschrift abgeschlossen)`,
    ml,
    y,
  );

  drawFooter(pdf, layout);
  return pdf.output("blob");
}

/**
 * Bericht samt Mitarbeitern laden und als PDF liefern — für Aufrufer, die
 * nur die ID haben (Listen-Druck, Mailversand einer Rechnung).
 */
export async function regieberichtPdfNachId(id: string): Promise<{ blob: Blob; bericht: Disturbance } | null> {
  const { data: bericht } = await supabase
    .from("disturbances").select("*").eq("id", id).maybeSingle();
  if (!bericht) return null;
  const { data: rollen } = await supabase
    .from("disturbance_workers").select("user_id, is_main").eq("disturbance_id", id);
  const ids = ((rollen as any[]) || []).map((w) => w.user_id).filter(Boolean);
  let workers: Worker[] = [];
  if (ids.length > 0) {
    const { data: profile } = await supabase
      .from("profiles").select("id, vorname, nachname").in("id", ids);
    const namen = new Map(((profile as any[]) || []).map((p) => [p.id, p]));
    workers = ((rollen as any[]) || []).map((w) => {
      const p: any = namen.get(w.user_id) || {};
      return { user_id: w.user_id, is_main: w.is_main, vorname: p.vorname || "", nachname: p.nachname || "" };
    });
  }
  const blob = await baueRegieberichtPdf(bericht as Disturbance, workers);
  return { blob, bericht: bericht as Disturbance };
}

export { baueRegieberichtPdf };
