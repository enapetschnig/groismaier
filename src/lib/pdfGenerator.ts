import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceHtmlData, InvoiceHtmlItem, BankData } from "./invoiceHtml";
import { buildDruckplan, istDetailOhneBetrag } from "./invoiceHtml";
import { type InvoiceLayoutSettings, DEFAULT_LAYOUT, hexToRgb } from "./invoiceLayoutTypes";
import { drawLetterhead, drawFooter, LETTERHEAD_MARGIN } from "./pdfLetterhead";
import { DEFAULT_MAHNUNG_SETTINGS, renderMahnungText, type MahnungSettings } from "./mahnungSettings";
import { getDocConfig } from "./documentTypes";
import { buildAllgemeineAngabenRows } from "./allgemeineAngaben";

const DEFAULT_BANK: BankData = {
  kontoinhaber: "",
  iban: "",
  bic: "",
};

// Sanitize Text für jsPDF Helvetica (WinAnsi): ersetzt Sonderzeichen die nicht im Zeichensatz sind
// Deutsche Umlaute ä/ö/ü/ß/€ sind in cp1252 vorhanden und funktionieren
// Fallback für exotische Zeichen: auf ASCII-Äquivalent reduzieren
function safePdfText(input: string | null | undefined): string {
  if (!input) return "";
  // jsPDF Helvetica unterstützt WinAnsi (cp1252). Problem-Zeichen:
  // - Emojis/Unicode > U+00FF → entfernen oder ?
  return String(input).replace(/[^\u0000-\u00FF€]/g, "?");
}

function fmt(val: number): string {
  if (!isFinite(val)) return "0,00";
  const parts = val.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

/** Kaufmännisch auf 2 Nachkommastellen runden (Cent). */
const r2 = (val: number): number =>
  isFinite(val) ? Math.round((val + Number.EPSILON) * 100) / 100 : 0;

/** Menge auf 3 Nachkommastellen runden (z.B. 0,125 h). */
const r3 = (val: number): number =>
  isFinite(val) ? Math.round((val + Number.EPSILON) * 1000) / 1000 : 0;

/**
 * Menge fürs PDF: bis zu DREI Nachkommastellen, überflüssige Nullen weg.
 *
 * HINTERGRUND (Edge-Case-Review 2026-07-21): vorher wurde die Menge mit
 * fmt() auf 2 Nachkommastellen gedruckt, der Gesamtpreis aber aus den
 * ungerundeten Werten übernommen. Auf dem Papier stand dann z.B.
 * "7,00 × 1,11 € = 7,81 €" — eine Zeile, die man nicht nachrechnen kann.
 * Jetzt wird die Menge so genau gedruckt, wie sie gerechnet wird, und der
 * Gesamtpreis aus den GEDRUCKTEN Werten gebildet (siehe unten).
 */
function fmtMenge(val: number): string {
  if (!isFinite(val)) return "0,00";
  const gerundet = r3(val);
  // Zwei Nachkommastellen wie gewohnt — die dritte nur, wenn sie gebraucht
  // wird (sonst stimmt Menge × Preis auf dem Papier nicht mehr).
  const s = r2(gerundet) === gerundet ? gerundet.toFixed(2) : gerundet.toFixed(3);
  const parts = s.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

function fmtCurrency(val: number): string {
  return `€ ${fmt(val)}`;
}

// Timezone-safe date formatting — "2026-03-24" should always show as 24.03.2026
function fmtDate(dateStr: string): string {
  if (!dateStr) return "–";
  // Parse as local date (not UTC) by splitting the string
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return new Date(dateStr + "T12:00:00").toLocaleDateString("de-AT");
}

export async function generateInvoicePdf(
  invoice: InvoiceHtmlData,
  items: InvoiceHtmlItem[],
  bank: BankData = DEFAULT_BANK,
  logoDataUri?: string,
  qrCodeDataUri?: string,
  firmenUid?: string,
  layout?: InvoiceLayoutSettings
): Promise<Blob> {
  const L = layout || DEFAULT_LAYOUT;
  const [acR, acG, acB] = hexToRgb(L.accent_color);
  const docCfg = getDocConfig(invoice.typ);
  const typLabel = docCfg.label;
  const isAngebot = docCfg.isAngebotLike;               // Angebot + AB: kein Zahlungsblock, Angebots-Closing
  const showLeistungsdatum = docCfg.showLeistungsdatum; // alle außer Angebot + AB
  const showFaelligAm = docCfg.showPaymentSection;      // nur Rechnungs-artige
  const showBank = docCfg.isInvoiceLike && docCfg.typ !== "gutschrift";
  const hidePrices = docCfg.hidePrices;                  // Lieferschein: keine Preise
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ml = 25; // margin left – DIN 5008 Form B: Textbereich 25mm
  const mr = 15; // margin right
  const contentWidth = pageWidth - ml - mr;
  // DIN 5008 Form B Positionen (A4, Fensterkuvert DIN-lang):
  //   Absenderzeile (klein, unterstrichen): y = 45 mm
  //   Anschriftenfeld (Empfänger):          y = 50 … 90 mm (40 mm hoch, 85 mm breit)
  //   Informationsblock (Meta rechts):      y = 50 mm parallel zur Anschrift
  const DIN_SENDER_Y = 45;
  const DIN_RECIPIENT_Y = 50;

  // ======= HEADER (only first page) =======
  let y = 15;
  let logoBottomY = y;
  let logoRightX = ml;

  // Logo-Block-Höhe reserviert für den Firmen-Info-Block rechts.
  // Start Y=15, 6 Zeilen à 3.5mm plus Puffer → ~22mm.
  const HEADER_BLOCK_HEIGHT = 22;

  // Logo — preserve aspect ratio from actual image dimensions
  if (logoDataUri) {
    try {
      let logoW = L.logo.width_mm;
      let logoH = L.logo.height_mm;
      try {
        const props = pdf.getImageProperties(logoDataUri);
        if (props.width > 0 && props.height > 0) {
          const aspect = props.width / props.height;
          logoH = logoW / aspect;
          // WICHTIG: Höhe deckeln, damit das Logo NIE in den Absender-/
          // Empfängerblock (DIN: ab 45 mm) ragt. Bei quadratischen Logos
          // wäre die aus der Breite abgeleitete Höhe sonst zu groß und würde
          // den Text überlappen. Seitenverhältnis bleibt erhalten.
          const MAX_LOGO_H = 24; // Start y=15 → endet bei max. 39 mm
          if (logoH > MAX_LOGO_H) {
            logoH = MAX_LOGO_H;
            logoW = logoH * aspect;
          }
        }
      } catch {}
      // position="left": Logo bündig zum Content-Margin + optionaler
      // Offset aus den Layout-Settings (z. B. um PNGs mit transparenten
      // Rändern visuell auszugleichen).
      const logoOffset = Math.max(0, Number(L.logo.offset_x_mm) || 0);
      const logoX = L.logo.position === "right" ? pageWidth - mr - logoW
        : L.logo.position === "center" ? (pageWidth - logoW) / 2
        : ml + logoOffset;
      pdf.addImage(logoDataUri, "PNG", logoX, y, logoW, logoH);
      logoBottomY = y + logoH;
      logoRightX = logoX + logoW;
    } catch {}
  }

  // Firmen-Info-Block — IMMER rendern, nie ausblenden.
  //   - Genug Platz rechts vom Logo (>= 50mm): vertikal rechtsbündig
  //     neben dem Logo (saubere Info-Spalte).
  //   - Sonst: horizontal UNTER dem Logo als zusammengefasste Zeile
  //     (7pt, linksbündig).
  const companyInfoLinesFull: string[] = [
    L.company.address_line1,
    L.company.address_line2,
    L.company.phone ? "Tel: " + L.company.phone : "",
    L.company.email,
    L.company.website,
  ].filter(Boolean);
  const hasAnyInfo = companyInfoLinesFull.length > 0 || !!firmenUid;

  if (hasAnyInfo && L.logo.position === "right") {
    // Logo oben rechts (Briefkopf Holzbau Groismaier) → Firmen-/Kontakt-
    // info als linksbündige Spalte oben links. Das Logo enthält bereits
    // den Firmennamen, daher hier nur Adresse / Tel / Mail / Web / UID.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(0, 35, 55);
    pdf.text(L.company.name, ml, y + 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(80, 80, 80);
    companyInfoLinesFull.forEach((line, i) => {
      pdf.text(line, ml, y + 7 + i * 3.5);
    });
    if (firmenUid) {
      pdf.setFont("helvetica", "bold");
      pdf.text(`UID: ${firmenUid}`, ml, y + 7 + companyInfoLinesFull.length * 3.5);
      pdf.setFont("helvetica", "normal");
    }
    logoBottomY = Math.max(logoBottomY, y + 7 + (companyInfoLinesFull.length + (firmenUid ? 1 : 0)) * 3.5);
  } else if (hasAnyInfo) {
    const infoStartX = logoRightX + 5;
    const availableInfoWidth = pageWidth - mr - infoStartX;

    if (availableInfoWidth >= 50) {
      // Rechts neben dem Logo, rechtsbündig, eine Zeile pro Feld
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(80, 80, 80);
      companyInfoLinesFull.forEach((line, i) => {
        pdf.text(line, pageWidth - mr, y + 3 + i * 3.5, { align: "right" });
      });
      if (firmenUid) {
        pdf.setFont("helvetica", "bold");
        pdf.text(`UID: ${firmenUid}`, pageWidth - mr, y + 3 + companyInfoLinesFull.length * 3.5, { align: "right" });
        pdf.setFont("helvetica", "normal");
      }
    } else {
      // Unter dem Logo als horizontale Zeile
      const parts = [...companyInfoLinesFull];
      if (firmenUid) parts.push(`UID: ${firmenUid}`);
      const horizLine = parts.join(" · ");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(80, 80, 80);
      const belowY = Math.max(logoBottomY + 4, y + HEADER_BLOCK_HEIGHT);
      pdf.text(horizLine, ml, belowY, { maxWidth: pageWidth - ml - mr });
      logoBottomY = belowY + 2;
    }
  }

  // Falzmarken nach DIN 5008 (links am Blattrand, dezent grau):
  //   1. Falz bei 105 mm, 2. Falz bei 210 mm, Lochmarke bei 148,5 mm.
  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth(0.15);
  pdf.line(3, 105, 6, 105);       // Falzmarke oben
  pdf.line(1.5, 148.5, 5, 148.5); // Lochmarke Mitte
  pdf.line(3, 210, 6, 210);       // Falzmarke unten

  // Falls der Briefkopf weiter unten enden würde als die Absenderzeile,
  // warnen wir implizit: das Logo darf höchstens bis y=43mm ragen.
  // DIN 5008: Absenderzeile fest bei 45 mm, Empfänger ab 50 mm.
  y = DIN_SENDER_Y;

  // Sender line (Absenderzeile über dem Empfänger, klein + unterstrichen)
  pdf.setFontSize(7);
  pdf.setTextColor(0, 0, 0);
  const senderText = L.sender_line || [L.company.name, L.company.address_line1, L.company.address_line2].filter(Boolean).join(" \u00B7 ");
  pdf.text(senderText, ml, y);
  // Unterstreichende Linie exakt so lang wie die Absenderzeile
  const senderWidth = pdf.getTextWidth(senderText);
  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth(0.2);
  pdf.line(ml, y + 1.5, ml + senderWidth, y + 1.5);
  // Empfängeradresse startet gemäß DIN bei exakt 50 mm
  y = DIN_RECIPIENT_Y;

  // Recipient
  const kundeAnrede = ((invoice as any).kunde_anrede || "").trim();
  const kundeTitel = ((invoice as any).kunde_titel || "").trim();
  const kundeKundentyp = ((invoice as any).kunde_kundentyp || "").toLowerCase();
  const kundeName = (invoice.kunde_name || "–").trim();
  // Bei Geschäftskunden ist Anrede irrelevant (steht implizit im Firmennamen).
  // Bei Privatkunden Anrede zeigen, außer sie ist redundant zum Namen
  // (z. B. anrede="Firma Hobinger GmbH", name="Hobinger GmbH").
  const isGeschaeft = kundeKundentyp === "geschaeftskunde";
  const anredeRedundant = !!kundeAnrede && (
    kundeAnrede.toLowerCase() === "firma" ||
    kundeName.toLowerCase().includes(kundeAnrede.toLowerCase()) ||
    kundeAnrede.toLowerCase().includes(kundeName.toLowerCase())
  );
  const showAnrede = !isGeschaeft && !!kundeAnrede && !anredeRedundant;
  if (showAnrede) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.text(kundeAnrede, ml, y + 2);
    y += 5;
  }
  // Titel-Feld nur bei Privatkunden anzeigen (Mag./Dr./Ing. etc.) und
  // nur wenn es nicht redundant zum Namen ist. Bei Geschäftskunden
  // wurde "titel" historisch gelegentlich mit dem Firmennamen befüllt
  // → der käme sonst doppelt im PDF (z. B. "Portas in Hirtenberg
  // PORTAS in Hirtenberg").
  const titelRedundant = !!kundeTitel && (
    kundeName.toLowerCase().includes(kundeTitel.toLowerCase()) ||
    kundeTitel.toLowerCase().includes(kundeName.toLowerCase())
  );
  const showTitel = !isGeschaeft && !!kundeTitel && !titelRedundant;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  const displayName = showTitel ? `${kundeTitel} ${kundeName}` : kundeName;
  pdf.text(displayName, ml, y + 2);
  y += 6;
  // UID-Nummer NICHT im Anschriftenblock — sie steht rechts oben im
  // Meta-Block ("Ihre UID"). DIN-konform und sauber.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  if (invoice.kunde_adresse) { pdf.text(invoice.kunde_adresse, ml, y + 2); y += 5; }
  if (invoice.kunde_plz || invoice.kunde_ort) {
    pdf.text(`${invoice.kunde_plz || ""} ${invoice.kunde_ort || ""}`.trim(), ml, y + 2);
    y += 5;
  }

  // Meta info (right side) – Informationsblock nach DIN 5008:
  //   Startet auf gleicher Höhe wie das Anschriftenfeld (y = 50 mm),
  //   rechts daneben in einer Spalte.
  const metaX = pageWidth - mr - 60;
  let metaY = DIN_RECIPIENT_Y;
  pdf.setFontSize(9);
  const datumFormatted = fmtDate(invoice.datum);
  const kundennummer = (invoice as any).kundennummer || "";
  const metaRows: [string, string][] = [
    [`${typLabel} Nr.`, invoice.nummer || "–"],
    ["Belegdatum", datumFormatted],
  ];
  if (invoice.kunde_uid) metaRows.push(["Ihre UID", invoice.kunde_uid]);
  if (showLeistungsdatum) {
    // Fallback: ohne explizit gesetztes Leistungsdatum gilt das
    // Rechnungsdatum als Beginn des Leistungszeitraums.
    const vonRaw = invoice.leistungsdatum || invoice.datum;
    if (vonRaw) {
      const von = fmtDate(vonRaw);
      const bisDate = (invoice as any).leistungsdatum_bis as string | null | undefined;
      const bis = bisDate ? fmtDate(bisDate) : null;
      const value = bis && bis !== von ? `${von} – ${bis}` : von;
      metaRows.push(["Leistungszeitraum", value]);
    }
  }
  if (kundennummer) metaRows.push(["Kundennr.", kundennummer]);
  if (showFaelligAm && invoice.faellig_am) metaRows.push(["Fällig am", fmtDate(invoice.faellig_am!)]);
  if (invoice.gueltig_bis) metaRows.push(["Gültig bis", fmtDate(invoice.gueltig_bis!)]);

  metaRows.forEach(([label, value]) => {
    pdf.setTextColor(0, 0, 0);
    pdf.text(label, metaX, metaY);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "bold");
    pdf.text(value, metaX + 38, metaY);
    pdf.setFont("helvetica", "normal");
    metaY += 5;
  });

  // "Ihr Ansprechpartner bei uns" unter der Meta-Box. Wird NUR gerendert
  // wenn auf dem Dokument explizit ein Ansprechpartner gesetzt ist —
  // entweder per Mitarbeiter-Dropdown oder manuell eingetippt. Kein
  // stiller Firmen-Default-Fallback mehr: wenn leer, wird kein Block
  // angezeigt.
  const aspName  = ((invoice as any).ansprechpartner_name  || "").trim();
  const aspPhone = ((invoice as any).ansprechpartner_telefon || "").trim();
  const aspEmail = ((invoice as any).ansprechpartner_email  || "").trim();
  if (aspName || aspPhone || aspEmail) {
    metaY += 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text("Ihr Ansprechpartner:", metaX, metaY);
    metaY += 4;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    if (aspName)  { pdf.text(aspName,  metaX, metaY); metaY += 4; }
    if (aspPhone) { pdf.text(aspPhone, metaX, metaY); metaY += 4; }
    if (aspEmail) { pdf.text(aspEmail, metaX, metaY); metaY += 4; }
  }

  // Etwas mehr Luft zwischen Empfänger und Dokumententitel als früher
  // (+10 statt +4), damit "Angebot – Betreff" nicht direkt am letzten
  // Adressblock klebt, aber auch keine grosse Lücke entsteht.
  y = Math.max(y, metaY) + 10;

  // Akzent-Trennlinie ZUERST, dann Titel darunter — so rahmt die Linie
  // den Adressblock oben ab und der Titel eröffnet die eigentliche
  // Dokumenten-Content-Zone.
  pdf.setDrawColor(acR, acG, acB);
  pdf.setLineWidth(0.8);
  pdf.line(ml, y, pageWidth - mr, y);
  y += 6;

  // Optionaler Einleitungstext (vom Admin per document_texts editierbar) —
  // erscheint zwischen Akzent-Linie und Titel "Angebot – Betreff".
  // Override-Feld custom_intro_text wird vom documentTextsLoader gesetzt.
  const customIntro = (invoice as any).custom_intro_text as string | undefined;
  if (customIntro && customIntro.trim()) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(60, 60, 60);
    const introLines = pdf.splitTextToSize(customIntro.trim(), contentWidth);
    introLines.forEach((line: string, i: number) => {
      pdf.text(line, ml, y + i * 4.8);
    });
    y += introLines.length * 4.8 + 4;
  }

  // Document title: "Angebot - <betreff>" (ohne Nummer; die steht rechts oben)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(0, 0, 0);
  const titleText = invoice.betreff
    ? `${typLabel} – ${invoice.betreff}`
    : typLabel;
  // mehrzeilig möglich
  const titleLines = pdf.splitTextToSize(titleText, contentWidth);
  titleLines.forEach((line: string, i: number) => {
    pdf.text(line, ml, y + i * 5.5);
  });
  y += titleLines.length * 5.5;
  y += 4;

  // ======= BEZUGS-BLOCK (nur Gutschrift mit Verknüpfung) =======
  // Wenn eine Gutschrift via Convert oder Picker an eine Rechnung
  // gebunden ist, rendert der Renderer hier sichtbar den Bezug.
  // _parent_nummer / _parent_datum werden in buildInvoiceForPdf aus
  // der parent_invoice_id geladen und am invoice-Objekt angehängt.
  if (docCfg.typ === "gutschrift") {
    const parentNr = (invoice as any)._parent_nummer as string | undefined;
    const parentDatum = (invoice as any)._parent_datum as string | undefined;
    if (parentNr) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(60, 60, 60);
      const txt = parentDatum
        ? `Bezug: Rechnung ${parentNr} vom ${parentDatum}`
        : `Bezug: Rechnung ${parentNr}`;
      pdf.text(txt, ml, y);
      y += 6;
    }
  }

  // ======= ALLGEMEINE ANGABEN (nur Angebot + Auftragsbestätigung) =======
  // Zweispaltige Tabelle mit Akzent-Header. Nur gerendert, wenn der
  // User die Tabelle per Toggle aktiviert hat UND min. 1 Feld einen
  // Wert hat (Sicherheitsnetz gegen leeren Block). Höhe wird vorab
  // via getTextDimensions genau bestimmt, damit der nachfolgende
  // autoTable-Call ordentlich aufsetzt.
  if (isAngebot && (invoice as any).allgemeine_angaben_aktiv) {
    const aaRows = buildAllgemeineAngabenRows(invoice as any);
    if (aaRows.length > 0) {
      const aaLabelW = 50;                              // mm — fixe Label-Spalte
      const aaPaddingX = 3;                              // Innenabstand
      const aaPaddingY = 2.5;
      const aaValueMaxW = contentWidth - aaLabelW - aaPaddingX * 2;
      const aaHeaderH = 7;                               // Header-Zeilenhöhe
      pdf.setFontSize(9);
      // Höhe pro Zeile vorausberechnen
      const rowHeights = aaRows.map((r) => {
        const lines = pdf.splitTextToSize(r.value, aaValueMaxW) as string[];
        const dims = pdf.getTextDimensions(lines.join("\n"));
        return Math.max(dims.h, lines.length * 4) + aaPaddingY * 2;
      });
      const aaTotalH = aaHeaderH + rowHeights.reduce((s, h) => s + h, 0);
      // Page-Break-Check: wenn der Block plus Mindestplatz (40mm für
      // Items-Tabelle-Anlauf) nicht mehr passt → neue Seite.
      // Konservativer Footer-Höhen-Schätzwert (echtes footerH wird
      // erst weiter unten in der Funktion berechnet — Reihenfolge
      // beibehalten, um TDZ-Fehler zu vermeiden).
      const approxFooterH = 30;
      if (y + aaTotalH + 40 > pageHeight - approxFooterH) {
        pdf.addPage();
        y = 20;
      }
      // Header-Zeile mit Akzent-Tint
      pdf.setFillColor(acR, acG, acB);
      pdf.setDrawColor(acR, acG, acB);
      // 18% Opacity-Effekt via lighten — pragmatisch: setFillColor bekommt
      // nur RGB, also rechnen wir manuell auf 18% gegen weiß auf.
      const lighten = (v: number) => Math.round(255 - (255 - v) * 0.18);
      pdf.setFillColor(lighten(acR), lighten(acG), lighten(acB));
      pdf.rect(ml, y, contentWidth, aaHeaderH, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(0, 0, 0);
      pdf.text("Allgemeine Angaben", ml + aaPaddingX, y + aaHeaderH - aaPaddingY);
      y += aaHeaderH;
      // Body-Zeilen
      pdf.setLineWidth(0.2);
      pdf.setDrawColor(220, 220, 220);
      aaRows.forEach((row, idx) => {
        const rowH = rowHeights[idx];
        const rowTop = y;
        const rowBottom = y + rowH;
        // Trennlinie zwischen Header und erster Zeile sowie zwischen Zeilen
        pdf.line(ml, rowTop, ml + contentWidth, rowTop);
        // Label
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(60, 60, 60);
        pdf.text(row.label, ml + aaPaddingX, rowTop + aaPaddingY + 3.2);
        // Wert (mehrzeilig)
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(0, 0, 0);
        const lines = pdf.splitTextToSize(row.value, aaValueMaxW) as string[];
        lines.forEach((line: string, i: number) => {
          pdf.text(line, ml + aaLabelW + aaPaddingX, rowTop + aaPaddingY + 3.2 + i * 4);
        });
        y = rowBottom;
      });
      // Untere Außenlinie
      pdf.line(ml, y, ml + contentWidth, y);
      // Vertikale Trennung Label/Wert
      pdf.line(ml + aaLabelW, y - aaTotalH + aaHeaderH, ml + aaLabelW, y);
      // Außenrahmen-Vertikalen
      pdf.line(ml, y - aaTotalH, ml, y);
      pdf.line(ml + contentWidth, y - aaTotalH, ml + contentWidth, y);
      y += 6;
    }
  }

  // ======= ITEMS TABLE =======
  // Lieferschein: ohne Preisspalten
  const tableHead = hidePrices
    ? [["Pos.", "Menge", "Einheit", "Beschreibung"]]
    : [["Pos.", "Menge", "Einheit", "Beschreibung", "Preis (netto)", "Rabatt", "Gesamt (netto)"]];

  // Angebots-/Rechnungs-Positionen nach gängigem Layout (z.B. sevDesk,
  // Lexoffice): enge Row-Höhe, Trennlinie direkt unter dem letzten
  // Textlauf, minimaler Bottom-Puffer (ca. 1–1.5 mm), Langtext kommt
  // kursiv grau direkt unter dem Kurztext mit ~1 mm Abstand.
  //
  // Strategie:
  // 1) Zellen-Text ist NUR der Kurztext. autoTable reserviert also nur
  //    Kurztext-Höhe, was unerwünschte Luft vermeidet.
  // 2) In didParseCell setzen wir minCellHeight exakt auf
  //    padTop + kurzHöhe + (gap + langHöhe)? + padBottom.
  //    So kennt autoTable die Gesamt-Höhe fürs Page-Break-Handling
  //    → Kurz- und Langtext bleiben IMMER zusammen (Row wird als
  //    Einheit umgebrochen).
  // 3) In didDrawCell malen wir den Langtext kursiv klein direkt unter
  //    den bereits gezeichneten Kurztext. Kein Overpaint, kein Weiß.
  const KURZ_FONT_SIZE = 9;
  const LANG_FONT_SIZE = 7.5;
  const LINE_HEIGHT_FACTOR = 1.15;
  const ptToMm = (pt: number) => pt * 0.3528;
  const linesHeightMm = (n: number, pt: number) => n * ptToMm(pt) * LINE_HEIGHT_FACTOR;
  const CELL_PAD_TOP = 2.5;
  const CELL_PAD_BOTTOM = 1.5;  // enge Trennlinie direkt unter dem Text
  const LANG_GAP = 1.0;         // kleiner Abstand zwischen Kurz und Lang

  /**
   * Gedruckte Zeilenwerte — die Zeile MUSS nachrechenbar sein.
   * Menge (3 NK) und Einzelpreis (2 NK) werden erst gerundet, dann
   * miteinander multipliziert. Damit gilt auf dem Papier immer
   *   gedruckte Menge × gedruckter Preis × (1 − Rabatt%) = gedruckte Summe.
   * Die Belegsummen unten leiten sich aus genau diesen Zeilenwerten ab.
   */
  const printLines = items.map((item) => {
    const menge = r3(Number(item.menge) || 0);
    const rabattProz = Number((item as any).rabatt_prozent) || 0;
    // Detailzeile eines Aufbaus (gesamtpreis 0): Menge/Einzelpreis stehen nur
    // zur Information in der Zeile — der Betrag steckt in der Sammelzeile.
    // Sie darf deshalb NICHT über Menge × Einzelpreis in die Belegsumme
    // einfließen, sonst wäre der Aufbau doppelt verrechnet (und die Summe im
    // PDF wiche von der im Beleg-Editor / in der DB ab).
    if (istDetailOhneBetrag(item)) {
      return { menge, einzelpreis: 0, rabattProz: 0, listenwert: 0, gesamt: 0, exempt: false };
    }
    const einzelpreis = r2(Number(item.einzelpreis) || 0);
    const listenwert = r2(menge * einzelpreis);
    const gesamt = r2(menge * einzelpreis * (1 - rabattProz / 100));
    return {
      menge,
      einzelpreis,
      rabattProz,
      listenwert,
      gesamt,
      exempt: !!(item as any).mwst_exempt,
    };
  });

  // ── Gruppen (Aufbauten) + Sichtbarkeit je Zeile ───────────────────────────
  // Der Druckplan liefert Kapitelüberschriften + NUR die Zeilen mit
  // auf_pdf !== false. Belege ohne Gruppen/ohne ausgeblendete Zeilen kommen
  // 1:1 wie bisher heraus (siehe buildDruckplan).
  // WICHTIG: Die Summen weiter unten leiten sich unverändert aus ALLEN
  // Positionen (printLines) ab — ausgeblendet werden nur betragslose
  // Detailzeilen, die Belegsumme bleibt also identisch.
  const druckplan = buildDruckplan(items);
  const INDENT_MM = 6; // Einrückung der Detailzeilen in der Beschreibungsspalte

  const langtextInfo: Record<number, { kurztext: string; langtext: string }> = {};
  const kapitelRows = new Set<number>();
  const detailRows = new Set<number>();
  const summenRows = new Set<number>();
  const tableBody: any[][] = [];
  druckplan.forEach((e) => {
    const rowIdx = tableBody.length;
    if (e.art === "kapitel") {
      kapitelRows.add(rowIdx);
      // Eine Zelle über die volle Breite — die Kapitelüberschrift beginnt
      // am linken Rand, nicht erst in der Beschreibungsspalte.
      tableBody.push([{ content: e.titel, colSpan: hidePrices ? 4 : 7 }]);
      return;
    }
    const item = items[e.index];
    const p = printLines[e.index];
    const kurztext = (item as any).kurztext || item.beschreibung;
    const langtext = (item as any).langtext || "";
    if (langtext && langtext !== kurztext) {
      langtextInfo[rowIdx] = { kurztext, langtext };
    }
    if (e.detail) detailRows.add(rowIdx);
    if (e.summenzeile) summenRows.add(rowIdx);
    // Nur Kurztext in die Zelle. Langtext wird in didDrawCell manuell
    // darunter gezeichnet; die zusätzliche Höhe reserviert didParseCell
    // via minCellHeight.
    const row = [
      e.nummer,
      fmtMenge(p.menge),
      item.einheit || "Stk.",
      kurztext,
    ];
    if (!hidePrices) {
      // Detailzeilen tragen keinen eigenen Betrag (gesamtpreis 0). Eine
      // 0,00-€-Spalte würde wie ein Fehler wirken → Spalten bleiben leer.
      if (e.detail) {
        row.push("", "", "");
      } else {
        row.push(fmtCurrency(p.einzelpreis));
        row.push(p.rabattProz > 0 ? `${p.rabattProz}%` : "—");
        row.push(fmtCurrency(p.gesamt));
      }
    }
    tableBody.push(row);
  });

  // Build totals rows for the table footer.
  // mwst_exempt-Zeilen sind bereits Brutto-Abzüge (z.B. Anzahlungen) und
  // gehen NICHT in die Netto-Summe ein; sie werden als eigener Block nach
  // dem Bruttobetrag ausgewiesen.
  const rabattProzent = Number(invoice.rabatt_prozent) || 0;
  const rabattBetrag = Number(invoice.rabatt_betrag) || 0;
  const exemptBrutto = r2(printLines.filter(p => p.exempt).reduce((s, p) => s + p.gesamt, 0));
  // positionenNetto = Summe der GEDRUCKTEN Zeilensummen NACH Item-Rabatt
  // (mwst_exempt ausgenommen). Item-Rabatt-Total = Differenz zwischen
  // "Menge × Einzelpreis" (Listenpreis) und Zeilensumme — wird im Footer als
  // Aufschlüsselung "Zwischensumme → Rabatt Positionen → Netto" gezeigt.
  // Beides aus printLines, damit der Summenblock exakt zu den gedruckten
  // Zeilen passt (sonst geht der Beleg um Cent-Beträge nicht auf).
  const positionenNetto = r2(printLines.filter(p => !p.exempt).reduce((s, p) => s + p.gesamt, 0));
  const itemRabattTotal = r2(printLines.filter(p => !p.exempt).reduce((s, p) => {
    if (p.rabattProz <= 0) return s;
    return s + (p.listenwert - p.gesamt);
  }, 0));
  const positionenBrutto = r2(positionenNetto + itemRabattTotal); // = sum(menge * einzelpreis)
  const rabattWert = r2(rabattProzent > 0 ? positionenNetto * (rabattProzent / 100) : rabattBetrag);
  // Netto / USt / Brutto ebenfalls aus den gedruckten Zeilen ableiten —
  // identische Formel wie im Beleg-Editor (InvoiceDetail).
  const nettoGedruckt = r2(positionenNetto - rabattWert);
  const mwstSatzPdf = Number(invoice.mwst_satz) || 0;
  const mwstGedruckt = (invoice as any).reverse_charge === true
    ? 0
    : r2(nettoGedruckt * (mwstSatzPdf / 100));
  const bruttoGedruckt = r2(nettoGedruckt + mwstGedruckt + exemptBrutto);

  // Footer-Zeile: der manuelle Renderer weiter unten liest row[3] (Label)
  // und row[5] (Wert) — unabhängig von der Spaltenzahl der Items-Tabelle.
  const footRow = (label: string, value: string): string[] =>
    ["", "", "", label, "", value];

  const tableFoot: string[][] = [];
  const isReverseCharge = (invoice as any).reverse_charge === true;
  if (!hidePrices) {
    // Block 1: Item-Rabatt-Aufschlüsselung (nur falls Item-Rabatte vorhanden)
    if (itemRabattTotal > 0) {
      tableFoot.push(footRow("Zwischensumme", fmtCurrency(positionenBrutto)));
      tableFoot.push(footRow("Rabatt Positionen", `- ${fmtCurrency(itemRabattTotal)}`));
    }
    // Block 2: Globaler Rabatt — IMMER drucken, wenn er ≠ 0 ist.
    // Ein negativer Rabatt (Altdaten / Fehleingabe) erhöht die Summe; wurde er
    // hier verschwiegen, passten die gedruckten Positionen nicht zur
    // Nettosumme und der Beleg war nicht nachvollziehbar.
    if (rabattWert !== 0) {
      tableFoot.push(footRow("Zwischensumme", fmtCurrency(positionenNetto)));
      const rabattLabel = rabattWert < 0
        ? `Aufschlag${rabattProzent !== 0 ? ` (${rabattProzent}%)` : ""}`
        : `Rabatt${rabattProzent > 0 ? ` (${rabattProzent}%)` : ""}`;
      const rabattValue = rabattWert < 0
        ? `+ ${fmtCurrency(Math.abs(rabattWert))}`
        : `- ${fmtCurrency(rabattWert)}`;
      tableFoot.push(footRow(rabattLabel, rabattValue));
    }
    if (isReverseCharge) {
      tableFoot.push(footRow("Rechnungsbetrag", fmtCurrency(nettoGedruckt)));
    } else if (exemptBrutto !== 0) {
      // Schlussrechnung mit Anzahlungs-Abzug: expliziter Block
      // Netto → USt → Zwischensumme brutto → Abzug → Verbleibend
      const bruttoVorAbzug = r2(nettoGedruckt + mwstGedruckt);
      tableFoot.push(footRow("Nettobetrag", fmtCurrency(nettoGedruckt)));
      tableFoot.push(footRow(`USt. ${mwstSatzPdf.toFixed(0)}%`, fmtCurrency(mwstGedruckt)));
      tableFoot.push(footRow("Zwischensumme brutto", fmtCurrency(bruttoVorAbzug)));
      tableFoot.push(footRow("Anzahlungs-Abzug (brutto)", fmtCurrency(exemptBrutto)));
      tableFoot.push(footRow("Bruttobetrag", fmtCurrency(bruttoGedruckt)));
    } else {
      tableFoot.push(footRow("Nettobetrag", fmtCurrency(nettoGedruckt)));
      tableFoot.push(footRow(`USt. ${mwstSatzPdf.toFixed(0)}%`, fmtCurrency(mwstGedruckt)));
      tableFoot.push(footRow("Bruttobetrag", fmtCurrency(bruttoGedruckt)));
    }
  }

  const skontoProzent = (invoice as any).skonto_prozent || 0;
  const skontoTage = (invoice as any).skonto_tage || 0;

  // Closing section height (Summen + Zahlungstext + Skonto + Bank + QR + Hinweis + Vielen Dank)
  let closingH = tableFoot.length * 7 + 15; // totals + base spacing
  if (invoice.notizen) closingH += 12;
  if (isReverseCharge && !hidePrices) closingH += 14;
  if (showFaelligAm) closingH += 13;
  if (showFaelligAm && skontoProzent > 0 && skontoTage > 0) closingH += 24;
  if (showBank) closingH += 40;
  if (!showFaelligAm && !showBank) closingH += 8;
  // Custom-Closing-Text kann mehrzeilig sein → zusätzliche Höhe einplanen,
  // damit der Page-Break-Check Bank+QR auf die nächste Seite schiebt, falls
  // der lange Text nicht mehr passt.
  const customClosingForHeight = (invoice as any).custom_closing_text as string | undefined;
  if (customClosingForHeight) {
    const estLines = pdf.splitTextToSize(customClosingForHeight, contentWidth - 0).length;
    if (estLines > 1) closingH += (estLines - 1) * 4.2;
  }

  // Dynamic footer height: base + jede Textzeile + ggf. Seitennummer-Zeile
  const footerLines = [L.footer.line1 || "auto", L.footer.show_bank_in_footer ? "bank" : "", L.footer.line2, L.footer.line3].filter(Boolean);
  const footerH = 8 + footerLines.length * 4 + (L.footer.show_page_numbers ? 4 : 0);

  // Spaltenbreite für Beschreibungsspalte berechnen (für Höhen-Schätzung).
  const fixedWidths = hidePrices ? 12 + 18 + 18 : 12 + 18 + 18 + 22 + 14 + 24;
  const descWidth = contentWidth - fixedWidths - 4; // grob; Padding/Border
  // autoTable rendert den Body. WICHTIG: margin.bottom reserviert nur den
  // Footer + einen kleinen Puffer – nicht den kompletten Closing-Bereich.
  // Sonst hätte autoTable auf Rechnungen (closingH >80mm mit Bank, Skonto,
  // Fälligkeit) zu wenig Platz und würde die erste Position sofort auf
  // Seite 2 schieben → Seite 1 bliebe leer.
  //
  // Stattdessen prüfen wir NACH autoTable, ob das Closing noch auf die
  // aktuelle Seite passt; wenn nein, addPage() (siehe unten).
  autoTable(pdf, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: "plain",
    rowPageBreak: "avoid",
    margin: { left: ml, right: mr, bottom: footerH + 12 },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      lineWidth: { bottom: 0.5 },
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fontSize: KURZ_FONT_SIZE,
      cellPadding: { top: CELL_PAD_TOP, bottom: CELL_PAD_BOTTOM, left: 2, right: 2 },
      textColor: [0, 0, 0],
      lineWidth: { bottom: 0.15 },
      lineColor: [190, 190, 190],
      valign: "top",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 12, textColor: [0, 0, 0] },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "center", cellWidth: 18, textColor: [0, 0, 0] },
      3: { halign: "left" },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 24, fontStyle: "bold" },
    },
    didParseCell: (data: any) => {
      // ── Kapitel / Detail / Sammelzeile optisch absetzen ──────────────────
      if (data.section === "body") {
        const ri = data.row.index;
        if (kapitelRows.has(ri)) {
          // Kapitelüberschrift (Aufbau): fett auf hellem Grund, über alle Spalten.
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.textColor = [0, 0, 0];
        } else if (summenRows.has(ri)) {
          // Sammelzeile der Gruppe = die preistragende Kapitelzeile.
          data.cell.styles.fontStyle = "bold";
        } else if (detailRows.has(ri)) {
          data.cell.styles.textColor = [90, 90, 90];
          if (data.column.index === 3) {
            data.cell.styles.cellPadding = { top: CELL_PAD_TOP, bottom: CELL_PAD_BOTTOM, left: 2 + INDENT_MM, right: 2 };
          }
        }
      }
      // minCellHeight für die komplette Row setzen, wenn Langtext
      // vorhanden ist. autoTable nimmt das Maximum aller Zellen-Höhen
      // der Row, deshalb reicht es, den Wert in der Beschreibungsspalte
      // zu setzen.
      if (data.section === "body" && data.column.index === 3) {
        const info = langtextInfo[data.row.index];
        if (info) {
          try {
            const w = descWidth - (detailRows.has(data.row.index) ? INDENT_MM : 0);
            pdf.setFontSize(KURZ_FONT_SIZE);
            const kurzLines = pdf.splitTextToSize(info.kurztext, w);
            pdf.setFontSize(LANG_FONT_SIZE);
            const langLines = pdf.splitTextToSize(info.langtext, w);
            pdf.setFontSize(KURZ_FONT_SIZE);
            const h = CELL_PAD_TOP
              + linesHeightMm(kurzLines.length, KURZ_FONT_SIZE)
              + LANG_GAP
              + linesHeightMm(langLines.length, LANG_FONT_SIZE)
              + CELL_PAD_BOTTOM;
            data.cell.styles.minCellHeight = h;
            // Auch das Row-Level signalisieren (manche autoTable-Versionen
            // nutzen row.height separat).
            if (data.row) data.row.height = Math.max(data.row.height || 0, h);
          } catch { /* fallback: auto */ }
        }
      }
    },
    didDrawCell: (data: any) => {
      // autoTable hat den Kurztext in 9pt gezeichnet. Wir malen nun den
      // Langtext direkt darunter (ohne Overpaint, ohne Bottom-Border
      // nachzuzeichnen — die zieht autoTable selbst).
      if (data.section === "body" && data.column.index === 3) {
        const info = langtextInfo[data.row.index];
        if (info) {
          try {
            // Detailzeilen sind eingerückt — Langtext muss mitwandern.
            const einzug = detailRows.has(data.row.index) ? INDENT_MM : 0;
            const cellW = data.cell.width - 4 - einzug;
            const cellX = data.cell.x + 2 + einzug;
            pdf.setFontSize(KURZ_FONT_SIZE);
            const kurzLines = pdf.splitTextToSize(info.kurztext, cellW);
            const kurzH = linesHeightMm(kurzLines.length, KURZ_FONT_SIZE);
            pdf.setFont("helvetica", "italic");
            pdf.setFontSize(LANG_FONT_SIZE);
            pdf.setTextColor(120, 120, 120);
            const langLines = pdf.splitTextToSize(info.langtext, cellW);
            const langBaselineY = data.cell.y + CELL_PAD_TOP + kurzH + LANG_GAP + ptToMm(LANG_FONT_SIZE);
            pdf.text(langLines, cellX, langBaselineY);
            // Reset
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(KURZ_FONT_SIZE);
            pdf.setTextColor(0, 0, 0);
          } catch { /* ignore */ }
        }
      }
    },
  });

  y = (pdf as any).lastAutoTable.finalY;

  // Prüfen: passt das Closing (Totals + Zahlungstext + evtl. Skonto +
  // Bank + Reverse-Charge + Notizen) noch auf die aktuelle Seite?
  // Falls nicht → addPage und Closing auf neuer Seite zeichnen.
  // Keine Row-Duplikation, autoTable hat alle Rows schon korrekt verteilt.
  const spaceLeft = pageHeight - footerH - 4 - y;
  if (spaceLeft < closingH) {
    pdf.addPage();
    y = 20;
  }

  // ======= TOTALS (manually drawn, not in autoTable) =======
  y += 2;
  // Separator line above totals (nur wenn tatsächlich Summen-Zeilen folgen)
  if (tableFoot.length > 0) {
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.8);
    pdf.line(ml, y, pageWidth - mr, y);
    y += 1;
  }

  tableFoot.forEach((row) => {
    const label = row[3];
    const value = row[5];
    const isBrutto = label === "Bruttobetrag";
    const isRabatt = label.startsWith("Rabatt") || label.startsWith("Anzahlungs-Abzug");

    if (isBrutto) {
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.8);
      pdf.line(ml, y + 1, pageWidth - mr, y + 1);
    }

    pdf.setFont("helvetica", isBrutto ? "bold" : "normal");
    pdf.setFontSize(isBrutto ? 10 : 9);
    pdf.setTextColor(isRabatt ? 204 : 0, 0, 0);
    // Label right-aligned in the middle area, value right-aligned at right margin
    pdf.text(label, pageWidth - mr - 28, y + 5, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.text(value, pageWidth - mr - 2, y + 5, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 7;
  });
  y += 2;

  // ======= NOTES =======
  if (invoice.notizen) {
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Anmerkung: ${invoice.notizen}`, ml, y, { maxWidth: contentWidth });
    y += 8;
  }

  // ======= REVERSE CHARGE HINWEIS (nur bei Rechnungsbelegen) =======
  if (isReverseCharge && !hidePrices) {
    y += 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)", ml, y);
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    // §19 Abs. 1a UStG: Bauleistungen (häufigster Fall im Holzbau).
    pdf.text("Es wird darauf hingewiesen, dass die Steuerschuld gem. § 19 Abs. 1a UStG auf den Leistungsempfänger übergeht.", ml, y, { maxWidth: contentWidth });
    y += 6;
  }

  // ======= CLOSING TEXT =======
  y += 2;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  const zahlungsbedingungen = (invoice.zahlungsbedingungen || "").trim();
  const zahlungsTageMatch = zahlungsbedingungen.match(/(\d+)/);
  // "sofort" / "prompt" / sonstige Texte ohne Zahl → direkt den Text nehmen.
  const isZahlungSofort = /sofort|umgehend|prompt/i.test(zahlungsbedingungen);
  const customClosing = (invoice as any).custom_closing_text as string | undefined;
  // Placeholder-Interpolation für den Angebots-Schlusstext:
  //   {{gueltig_bis}} → ausformuliertes Gültigkeitsdatum aus dem Dokument
  //   {{tage}}        → Restlaufzeit ab heute in Tagen
  // Wenn kein gueltig_bis gesetzt ist, werden die Platzhalter entfernt,
  // ohne unschönen Rest-Text ("Dieses Angebot ist bis zum gültig.").
  const angebotsClosing = (() => {
    let txt = L.closing_text_angebot || "";
    if (invoice.gueltig_bis) {
      const fmt = fmtDate(invoice.gueltig_bis);
      const msPerDay = 86400000;
      const bis = new Date((invoice.gueltig_bis as string) + "T12:00:00");
      const heute = new Date();
      const tageRest = Math.max(0, Math.round((bis.getTime() - heute.getTime()) / msPerDay));
      txt = txt.replace(/\{\{gueltig_bis\}\}/g, fmt).replace(/\{\{tage\}\}/g, String(tageRest));
    } else {
      // Kein Datum → Platzhalter weglöschen, damit kein komischer Lücken-Satz entsteht
      txt = txt.replace(/\s*bis zum\s*\{\{gueltig_bis\}\}/g, "").replace(/\{\{gueltig_bis\}\}/g, "").replace(/\{\{tage\}\}/g, "");
    }
    return txt.replace(/\s{2,}/g, " ").trim();
  })();

  // Hilfs-Funktion: rendert mehrzeiligen Text und schiebt y exakt um
  // die tatsächliche Render-Höhe weiter, damit nachfolgende Blöcke
  // (Bank, QR, "Vielen Dank") garantiert untendrunter erscheinen, auch
  // wenn der Schluss-Text mehrere Zeilen / explizite \n enthält.
  const renderMultilineText = (text: string, padBelow: number = 4) => {
    const lines = pdf.splitTextToSize(text, contentWidth) as string[];
    pdf.text(lines, ml, y);
    // Exakte Höhe via jsPDF getTextDimensions auf der gejointen Zeile —
    // robuster als fixe Zeilenhöhe, weil es den aktuellen
    // lineHeightFactor und die Schriftgröße berücksichtigt.
    const dims = pdf.getTextDimensions(lines.join("\n"));
    y += Math.max(dims.h, lines.length * 4) + padBelow;
  };

  if (customClosing) {
    renderMultilineText(customClosing);
  } else if (isAngebot) {
    renderMultilineText(angebotsClosing);
  } else if (docCfg.typ === "gutschrift") {
    // Gutschrift = Auszahlung an den Kunden; nicht der Rechnungs-Closing-
    // Text. Der document_texts.gutschrift.closing-Default wird über
    // customClosing gerendert (greift bei vorhandenem Eintrag); dieser
    // Fallback hier sichert ab, falls der Admin den Text geleert hat.
    renderMultilineText(
      "Hiermit schreiben wir Ihnen den oben angeführten Betrag gut. Die Auszahlung erfolgt innerhalb von 14 Tagen auf Ihr bekanntes Bankkonto bzw. wird mit einer offenen Rechnung verrechnet.",
      4,
    );
  } else if (docCfg.isInvoiceLike) {
    let closingText: string;
    const isIndividuell = zahlungsbedingungen.toLowerCase() === "individuell";
    if (isZahlungSofort) {
      closingText = "Zahlbar sofort ohne Abzug.";
    } else if (isIndividuell && invoice.faellig_am) {
      // Dropdown-Auswahl "Individuelles Datum" — das Fälligkeitsdatum
      // ist die Wahrheit, kein Tage-Platzhalter.
      closingText = `Zahlbar bis ${fmtDate(invoice.faellig_am)} ohne Abzug.`;
    } else if (zahlungsTageMatch) {
      closingText = L.closing_text_invoice.replace("{{tage}}", zahlungsTageMatch[1]);
    } else if (zahlungsbedingungen && !isIndividuell) {
      // freier Text (z.B. Altdaten "bei Lieferung bar") → direkt übernehmen
      closingText = zahlungsbedingungen;
    } else {
      closingText = L.closing_text_invoice.replace("{{tage}}", "14");
    }
    renderMultilineText(closingText, 1);
    pdf.setFontSize(7.5);
    pdf.setTextColor(0, 0, 0);
    renderMultilineText(`Bei E-Banking bitte als Zahlungsreferenz ${docCfg.label}snummer ${invoice.nummer || ""} und Kundennummer ${kundennummer || ""} eingeben.`, 4);
    pdf.setFontSize(9);
  } else {
    // Lieferschein
    y += 8;
  }

  // ======= ANZAHLUNGS-HINWEIS (nur Anzahlungsrechnung) =======
  // Editierbarer Textbaustein aus document_texts.anzahlung_hinweis mit
  // bereits interpolierten Platzhaltern.
  const anzahlungHinweis = (invoice as any).custom_anzahlung_hinweis as string | undefined;
  if (anzahlungHinweis && docCfg.typ === "anzahlungsrechnung") {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8.5);
    pdf.setTextColor(60, 60, 60);
    pdf.text(anzahlungHinweis, ml, y, { maxWidth: contentWidth });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    y += 6;
  }

  // ======= SKONTO INFO (only for Rechnung with Skonto) =======
  if (showFaelligAm && skontoProzent > 0 && skontoTage > 0) {
    // Basis ist der GEDRUCKTE Bruttobetrag — sonst weicht der Skonto-Betrag
    // im Kasten vom Bruttobetrag im Summenblock ab.
    const brutto = bruttoGedruckt;
    const skontoAbzug = r2(brutto * (skontoProzent / 100));
    const skontoBetrag = r2(brutto - skontoAbzug);
    const skontoDatum = new Date(invoice.datum + "T12:00:00");
    skontoDatum.setDate(skontoDatum.getDate() + skontoTage);
    const skontoDateStr = skontoDatum.toLocaleDateString("de-AT");
    const faelligDateStr = invoice.faellig_am ? fmtDate(invoice.faellig_am!) : "";

    // Skonto box
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(ml, y - 2, contentWidth, faelligDateStr ? 22 : 16, 1, 1);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Zahlungsbedingungen:", ml + 3, y + 2);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Bei Zahlung bis ${skontoDateStr}:`, ml + 3, y + 7);
    pdf.setFont("helvetica", "bold");
    pdf.text(`€ ${fmt(skontoBetrag)}`, ml + 70, y + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(`(${skontoProzent}% Skonto = € ${fmt(skontoAbzug)} Abzug)`, ml + 100, y + 7);

    if (faelligDateStr) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Zahlbar bis ${faelligDateStr}:`, ml + 3, y + 13);
      pdf.setFont("helvetica", "bold");
      pdf.text(`€ ${fmt(brutto)}`, ml + 70, y + 13);
      pdf.setFont("helvetica", "normal");
      pdf.text("(ohne Abzug)", ml + 100, y + 13);
      y += 24;
    } else {
      y += 18;
    }
  }

  // ======= BANK INFO (nur Rechnungs-artige Dokumente) =======
  if (showBank) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    const bankLine = [
      bank.kontoinhaber ? `Kontoinhaber: ${bank.kontoinhaber}` : "",
      bank.iban ? `IBAN: ${bank.iban}` : "",
      bank.bic ? `BIC: ${bank.bic}` : "",
    ].filter(Boolean).join(" \u00B7 ");
    if (bankLine) { pdf.text(bankLine, ml, y); y += 5; }

    // QR Code
    if (qrCodeDataUri) {
      try {
        pdf.addImage(qrCodeDataUri, "PNG", pageWidth - mr - 22, y - 8, 22, 22);
        pdf.setFontSize(5.5);
        pdf.setTextColor(0, 0, 0);
        pdf.text("Zahlen mit Code", pageWidth - mr - 11, y + 16, { align: "center" });
      } catch {}
    }

    y += 20;

    // Vielen Dank
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(L.danke_text, pageWidth / 2, y, { align: "center" });
    y += 8;
  }

  // ======= FOOTER on every page =======
  const totalPages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    const fy = pageHeight - footerH - 4;

    pdf.setDrawColor(acR, acG, acB);
    pdf.setLineWidth(0.3);
    pdf.line(ml, fy, pageWidth - mr, fy);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(0, 0, 0);
    let footerY = fy + 4;
    const footerLine1 = L.footer.line1 || [L.company.name, L.company.slogan, L.company.address_line1, L.company.address_line2, L.company.phone, L.company.email].filter(Boolean).join(" \u00B7 ");
    pdf.text(footerLine1, pageWidth / 2, footerY, { align: "center" });
    footerY += 4;
    if (L.footer.line2) {
      pdf.text(L.footer.line2, pageWidth / 2, footerY, { align: "center" });
      footerY += 4;
    }
    if (L.footer.line3) {
      pdf.text(L.footer.line3, pageWidth / 2, footerY, { align: "center" });
      footerY += 4;
    }
    if (L.footer.show_bank_in_footer) {
      const ibanLine = [
        bank.kontoinhaber ? `Kontoinhaber: ${bank.kontoinhaber}` : "",
        bank.iban ? `IBAN: ${bank.iban}` : "",
        bank.bic ? `BIC: ${bank.bic}` : "",
      ].filter(Boolean).join(" \u00B7 ");
      if (ibanLine) {
        pdf.text(ibanLine, pageWidth / 2, footerY, { align: "center" });
        footerY += 4;
      }
    }
    // Seitennummer in eigener letzter Zeile (rechts), damit sie den
    // zentrierten Text nicht überschreibt.
    if (L.footer.show_page_numbers) {
      pdf.text(`Seite ${i} von ${totalPages}`, pageWidth - mr, footerY, { align: "right" });
    }
  }

  return pdf.output("blob");
}

// Generate a Storno confirmation PDF.
// `docTypeLabel` ist optional und steuert die Beschriftung im PDF
// ("Rechnungsnummer:" vs. "Nummer der Auftragsbestätigung:" etc.).
// Wird kein Label übergeben, fällt es auf "Rechnung" zurück — damit
// bleiben bestehende Aufrufer unverändert gültig.
export function generateStornoPdf(
  invoice: { nummer: string; kunde_name: string; brutto_summe: number; datum: string },
  stornoNummer: string,
  stornoDatum: string,
  stornoGrund: string,
  bank: BankData = DEFAULT_BANK,
  logoDataUri?: string,
  layout?: InvoiceLayoutSettings,
  docTypeLabel: string = "Rechnung"
): Blob {
  const L = layout || DEFAULT_LAYOUT;
  const [acR, acG, acB] = hexToRgb(L.accent_color);
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ml = LETTERHEAD_MARGIN.left;
  const mr = LETTERHEAD_MARGIN.right;

  // Einheitlicher Briefkopf
  const { afterY } = drawLetterhead(pdf, L, logoDataUri);
  let y = afterY;

  // Akzent-Trennlinie zuerst, dann "STORNO" darunter — Konsistenz zum
  // Rechnungs-PDF (Linie rahmt oben ab, Titel eröffnet den Content).
  pdf.setDrawColor(acR, acG, acB);
  pdf.setLineWidth(1);
  pdf.line(ml, y, pageWidth - mr, y);
  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(acR, acG, acB);
  pdf.text("STORNO", ml, y);
  y += 8;

  // Storno details
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);

  // Bei AB ist brutto_summe i. d. R. unverrechnet — der Betrag wird
  // trotzdem als Info-Zeile gezeigt, aber mit neutralem Label.
  const betragLabel = docTypeLabel === "Rechnung" ? "Rechnungsbetrag:" : "Auftragssumme:";
  const details: [string, string][] = [
    ["Stornonummer:", stornoNummer],
    ["Stornodatum:", fmtDate(stornoDatum)],
    [`${docTypeLabel}snummer:`, invoice.nummer],
    [`${docTypeLabel}sdatum:`, fmtDate(invoice.datum)],
    ["Kunde:", invoice.kunde_name],
    [betragLabel, fmtCurrency(invoice.brutto_summe)],
  ];

  details.forEach(([label, value]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(label, ml, y);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text(value, ml + 50, y);
    y += 7;
  });

  y += 8;

  // Storno-Grund
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Storno-Grund:", ml, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  const grundLines = pdf.splitTextToSize(stornoGrund, pageWidth - ml - mr);
  pdf.text(grundLines, ml, y);
  y += grundLines.length * 5 + 10;

  // Confirmation text
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  const docLower = docTypeLabel.toLowerCase();
  pdf.text(`Hiermit wird bestätigt, dass die oben genannte ${docLower} storniert wurde.`, ml, y);
  y += 5;
  if (docTypeLabel === "Rechnung") {
    pdf.text("Der Rechnungsbetrag wird nicht mehr zur Zahlung fällig.", ml, y);
  } else {
    pdf.text("Der Auftrag gilt damit als aufgehoben; eventuelle Folgedokumente sind separat zu behandeln.", ml, y);
  }

  // Einheitlicher Footer
  drawFooter(pdf, L, { withPageNumbers: false });

  return pdf.output("blob");
}

// ======= MAHNUNG PDF =======
export function generateMahnungPdf(
  invoice: { nummer: string; datum: string; faellig_am: string; kunde_name: string; kunde_adresse?: string | null; kunde_plz?: string | null; kunde_ort?: string | null; brutto_summe: number; bezahlt_betrag: number },
  mahnstufe: number,
  mahngebuehr: number = 0,
  bank: BankData = DEFAULT_BANK,
  logoDataUri?: string,
  layout?: InvoiceLayoutSettings,
  mahnungSettings?: MahnungSettings,
): Blob {
  const L = layout || DEFAULT_LAYOUT;
  const MS = mahnungSettings || DEFAULT_MAHNUNG_SETTINGS;
  const stufeIdx = Math.min(Math.max(mahnstufe, 1), 3) - 1;
  const stufeConfig = MS.stufen[stufeIdx];
  // Mahngebühr aus Config, wenn nicht explizit mitgegeben
  const effektiveGebuehr = mahngebuehr > 0 ? mahngebuehr : stufeConfig.gebuehr;
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ml = LETTERHEAD_MARGIN.left;
  const mr = LETTERHEAD_MARGIN.right;

  // Einheitlicher Briefkopf (Logo + Firmen-Info + Akzent-Linie)
  const { afterY } = drawLetterhead(pdf, L, logoDataUri);
  let y = afterY;

  pdf.setFontSize(6);
  pdf.setTextColor(0, 0, 0);
  pdf.text(L.sender_line || [L.company.name, L.company.address_line1, L.company.address_line2].filter(Boolean).join(" \u00B7 "), ml, y);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.2);
  pdf.line(ml, y + 1, ml + 85, y + 1);
  y += 5;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(invoice.kunde_name, ml, y); y += 5;
  if (invoice.kunde_adresse) { pdf.text(invoice.kunde_adresse, ml, y); y += 5; }
  if (invoice.kunde_plz || invoice.kunde_ort) {
    pdf.text(`${invoice.kunde_plz || ""} ${invoice.kunde_ort || ""}`.trim(), ml, y); y += 5;
  }
  y += 10;

  // Akzent-Linie zuerst, Titel darunter — einheitlich zu Rechnung/Storno.
  pdf.setDrawColor(mahnstufe >= 3 ? 204 : 0, 0, 0);
  pdf.setLineWidth(0.8);
  pdf.line(ml, y, pageWidth - mr, y);
  y += 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(mahnstufe >= 3 ? 204 : 0, 0, 0);
  pdf.text(stufeConfig.titel, ml, y);
  y += 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Datum: ${new Date().toLocaleDateString("de-AT")}`, pageWidth - mr, y, { align: "right" });
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const offenerBetrag = invoice.brutto_summe - invoice.bezahlt_betrag;

  const bodyText = renderMahnungText(stufeConfig.text, {
    tage: stufeConfig.frist_tage,
    rechnungsnummer: invoice.nummer,
    betrag: fmtCurrency(offenerBetrag),
  });

  const bodyLines = pdf.splitTextToSize(bodyText, pageWidth - ml - mr);
  pdf.text(bodyLines, ml, y);
  y += bodyLines.length * 5 + 10;

  const detailRows: [string, string][] = [
    ["Rechnungsnummer:", invoice.nummer],
    ["Rechnungsdatum:", fmtDate(invoice.datum)],
    ["Fällig am:", invoice.faellig_am ? fmtDate(invoice.faellig_am!) : "–"],
    ["Rechnungsbetrag:", fmtCurrency(invoice.brutto_summe)],
  ];
  if (invoice.bezahlt_betrag > 0) detailRows.push(["Bereits bezahlt:", fmtCurrency(invoice.bezahlt_betrag)]);
  detailRows.push(["Offener Betrag:", fmtCurrency(offenerBetrag)]);
  if (effektiveGebuehr > 0) {
    detailRows.push(["Mahngebühr:", fmtCurrency(effektiveGebuehr)]);
    detailRows.push(["Gesamt fällig:", fmtCurrency(offenerBetrag + effektiveGebuehr)]);
  }

  detailRows.forEach(([label, value]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(label, ml, y);
    pdf.setFont("helvetica", "bold");
    const isTotalRow = label.startsWith("Offener") || label.startsWith("Gesamt");
    if (isTotalRow) pdf.setFontSize(11);
    pdf.text(value, ml + 50, y);
    pdf.setFontSize(10);
    y += 7;
  });

  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Bitte überweisen Sie den Betrag auf folgendes Konto:", ml, y); y += 6;
  pdf.setFont("helvetica", "bold");
  if (bank.kontoinhaber) { pdf.text(`Kontoinhaber: ${bank.kontoinhaber}`, ml, y); y += 5; }
  if (bank.iban) { pdf.text(`IBAN: ${bank.iban}`, ml, y); y += 5; }
  if (bank.bic) { pdf.text(`BIC: ${bank.bic}`, ml, y); y += 5; }
  pdf.setFont("helvetica", "normal");
  pdf.text(`Verwendungszweck: ${invoice.nummer}`, ml, y); y += 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Mit freundlichen Grüßen", ml, y); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(L.company.name, ml, y);

  // Einheitlicher Footer (grüne Akzent-Linie + Firmen-Kurzinfo)
  drawFooter(pdf, L, { withPageNumbers: false });

  return pdf.output("blob");
}
