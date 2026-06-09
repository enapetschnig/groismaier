// Shared HTML generator for invoice/offer PDF preview
// Used both client-side (preview) and matches edge function output

import QRCode from "qrcode";
import { type InvoiceLayoutSettings, DEFAULT_LAYOUT } from "./invoiceLayoutTypes";
import { getDocConfig } from "./documentTypes";
import { buildAllgemeineAngabenRows } from "./allgemeineAngaben";

// Generate EPC QR-Code (GiroCode) for SEPA bank transfer
export async function generateEpcQrCode(
  betrag: number,
  rechnungsnummer: string,
  bank?: BankData
): Promise<string> {
  const b = bank || DEFAULT_BANK;
  const ibanClean = b.iban.replace(/\s/g, ""); // IBAN ohne Leerzeichen

  const epcData = [
    "BCD",                    // Service Tag
    "002",                    // Version
    "1",                      // Encoding (UTF-8)
    "SCT",                    // SEPA Credit Transfer
    b.bic,                    // BIC
    b.kontoinhaber,           // Empfänger
    ibanClean,                // IBAN (ohne Leerzeichen)
    `EUR${betrag.toFixed(2)}`, // Betrag
    "",                       // Purpose
    "",                       // Structured Reference
    rechnungsnummer,          // Unstructured Reference (Rechnungsnr.)
    "",                       // Information
  ].join("\n");

  return await QRCode.toDataURL(epcData, { width: 150, margin: 1 });
}

export interface BankData {
  kontoinhaber: string;
  iban: string;
  bic: string;
}

export const DEFAULT_BANK: BankData = {
  kontoinhaber: "",
  iban: "",
  bic: "",
};

export interface InvoiceHtmlData {
  typ: string;
  nummer: string;
  status: string;
  kunde_name: string;
  kunde_adresse?: string | null;
  kunde_plz?: string | null;
  kunde_ort?: string | null;
  kunde_land?: string | null;
  kunde_email?: string | null;
  kunde_telefon?: string | null;
  kunde_uid?: string | null;
  datum: string;
  faellig_am?: string | null;
  leistungsdatum?: string | null;
  leistungsdatum_bis?: string | null;
  gueltig_bis?: string | null;
  zahlungsbedingungen?: string | null;
  notizen?: string | null;
  netto_summe: number;
  mwst_satz: number;
  mwst_betrag: number;
  brutto_summe: number;
  bezahlt_betrag?: number;
  rabatt_prozent?: number;
  rabatt_betrag?: number;
  mahnstufe?: number;
  skonto_prozent?: number;
  skonto_tage?: number;
  kunde_anrede?: string;
  kunde_titel?: string;
  kunde_kundentyp?: string | null;
  reverse_charge?: boolean;
  betreff?: string | null;
  // Allgemeine Angaben (Angebot + AB) — werden via buildAllgemeineAngabenRows verarbeitet
  allgemeine_angaben_aktiv?: boolean;
  leistungsbeschreibung?: string | null;
  ausfuehrungsort?: string | null;
  ausfuehrungs_kw?: string | null;
  ausfuehrende_firma?: string | null;
  ausfuehrende_firma_freitext?: string | null;
}

export interface InvoiceHtmlItem {
  position: number;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
}

// Minimal HTML-Escape für freien Text aus document_texts (verhindert XSS
// + kaputtes Markup, falls User Sonderzeichen wie < > & in Textbausteinen hat).
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(val: number): string {
  return val.toFixed(2).replace(".", ",");
}

function fmtCurrency(val: number): string {
  return `€ ${fmt(val)}`;
}

const LOGO_IMG = `<img src="/groismaier-logo.png" alt="Holzbau Groismaier" />`;
export function buildInvoiceHtml(
  invoice: InvoiceHtmlData,
  items: InvoiceHtmlItem[],
  qrCodeDataUri?: string,
  bank?: BankData,
  layout?: InvoiceLayoutSettings
): string {
  const L = layout || DEFAULT_LAYOUT;
  const b = bank || DEFAULT_BANK;
  const docCfg = getDocConfig(invoice.typ);
  const typLabel = docCfg.label;
  const isAngebot = docCfg.isAngebotLike;         // Angebot + AB: kein Rechnungsbeleg-Footer
  const showLeistungsdatum = docCfg.showLeistungsdatum;
  const showFaelligAm = docCfg.showPaymentSection;
  const showBank = docCfg.isInvoiceLike && docCfg.typ !== "gutschrift";
  const hidePrices = docCfg.hidePrices;
  const accent = L.accent_color;

  const datumFormatted = new Date(invoice.datum).toLocaleDateString("de-AT");
  const faelligFormatted = invoice.faellig_am
    ? new Date(invoice.faellig_am).toLocaleDateString("de-AT")
    : null;
  // Leistungszeitraum: wenn nichts gesetzt, fällt "von" automatisch auf
  // das Rechnungsdatum zurück (§ 11 UStG erfüllt, ohne dass der User
  // Datum doppelt eingeben muss).
  const leistungVonRaw = invoice.leistungsdatum || invoice.datum;
  const leistungVon = leistungVonRaw
    ? new Date(leistungVonRaw).toLocaleDateString("de-AT")
    : null;
  const leistungBis = invoice.leistungsdatum_bis
    ? new Date(invoice.leistungsdatum_bis).toLocaleDateString("de-AT")
    : null;
  const leistungFormatted = leistungVon
    ? (leistungBis && leistungBis !== leistungVon ? `${leistungVon} – ${leistungBis}` : leistungVon)
    : null;
  const leistungLabel = "Leistungszeitraum";
  const gueltigBisFormatted = invoice.gueltig_bis
    ? new Date(invoice.gueltig_bis).toLocaleDateString("de-AT")
    : null;

  const bezahltBetrag = Number(invoice.bezahlt_betrag) || 0;
  const rabattProzent = Number(invoice.rabatt_prozent) || 0;
  const rabattBetrag = Number(invoice.rabatt_betrag) || 0;
  // mwst_exempt-Zeilen sind Brutto-Abzüge (Anzahlungen) und gehen NICHT
  // in die Netto-Summe für die MwSt-Berechnung ein.
  const exemptBrutto = (items || []).filter(it => (it as any).mwst_exempt).reduce(
    (sum, it) => sum + Number(it.gesamtpreis),
    0
  );
  const positionenNetto = (items || []).filter(it => !(it as any).mwst_exempt).reduce(
    (sum, it) => sum + Number(it.gesamtpreis),
    0
  );
  // Item-Rabatt-Total: Differenz "Menge × Einzelpreis" vs. gesamtpreis pro Position.
  const itemRabattTotal = (items || []).filter(it => !(it as any).mwst_exempt).reduce((s, it) => {
    const rabProz = Number((it as any).rabatt_prozent) || 0;
    if (rabProz <= 0) return s;
    const original = Number(it.menge) * Number(it.einzelpreis);
    return s + (original - Number(it.gesamtpreis));
  }, 0);
  const positionenBrutto = positionenNetto + itemRabattTotal;
  const rabattWert =
    rabattProzent > 0
      ? positionenNetto * (rabattProzent / 100)
      : rabattBetrag;
  const hasRabatt = rabattWert > 0;
  const hasItemRabatt = itemRabattTotal > 0;
  const hasExempt = exemptBrutto !== 0;
  const restBetrag = Number(invoice.brutto_summe) - bezahltBetrag;
  const showPaymentInfo = showFaelligAm && bezahltBetrag > 0;
  const mahnstufe = Number(invoice.mahnstufe) || 0;

  const itemRows = (items || [])
    .map(
      (item, idx) => hidePrices
        ? `
    <tr style="background:${idx % 2 === 0 ? "#fff" : "#fafafa"};">
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;color:#888;text-align:center;font-size:9pt;">${item.position}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;color:#1a1a1a;font-size:9.5pt;white-space:pre-wrap;">${item.beschreibung}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right;color:#444;font-size:9pt;">${fmt(Number(item.menge))}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:center;color:#444;font-size:9pt;">${item.einheit || "Stk."}</td>
    </tr>`
        : `
    <tr style="background:${idx % 2 === 0 ? "#fff" : "#fafafa"};">
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;color:#888;text-align:center;font-size:9pt;">${item.position}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;color:#1a1a1a;font-size:9.5pt;white-space:pre-wrap;">${item.beschreibung}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right;color:#444;font-size:9pt;">${fmt(Number(item.menge))}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:center;color:#444;font-size:9pt;">${item.einheit || "Stk."}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right;color:#444;font-size:9pt;">${fmtCurrency(Number(item.einzelpreis))}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right;font-weight:600;color:#1a1a1a;font-size:9.5pt;">${fmtCurrency(Number(item.gesamtpreis))}</td>
    </tr>`
    )
    .join("");

  let totalsHtml = "";
  if (hasItemRabatt) {
    totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">Zwischensumme</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(positionenBrutto)}</td></tr>`;
    totalsHtml += `<tr><td style="padding:5px 0;color:${accent};font-size:9.5pt;">Rabatt Positionen</td><td style="padding:5px 0;text-align:right;color:${accent};font-size:9.5pt;">- ${fmtCurrency(itemRabattTotal)}</td></tr>`;
  }
  if (hasRabatt) {
    totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">Zwischensumme</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(positionenNetto)}</td></tr>`;
    totalsHtml += `<tr><td style="padding:5px 0;color:${accent};font-size:9.5pt;">Rabatt${rabattProzent > 0 ? ` (${rabattProzent}%)` : ""}</td><td style="padding:5px 0;text-align:right;color:${accent};font-size:9.5pt;">- ${fmtCurrency(rabattWert)}</td></tr>`;
  }
  totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">Nettobetrag</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(Number(invoice.netto_summe))}</td></tr>`;
  totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">USt. ${Number(invoice.mwst_satz).toFixed(0)}%</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(Number(invoice.mwst_betrag))}</td></tr>`;
  if (hasExempt) {
    const bruttoVorAbzug = Number(invoice.netto_summe) + Number(invoice.mwst_betrag || 0);
    totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">Zwischensumme brutto</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(bruttoVorAbzug)}</td></tr>`;
    totalsHtml += `<tr><td style="padding:5px 0;color:${accent};font-size:9.5pt;">Anzahlungs-Abzug (brutto)</td><td style="padding:5px 0;text-align:right;color:${accent};font-size:9.5pt;">${fmtCurrency(exemptBrutto)}</td></tr>`;
  }
  totalsHtml += `<tr><td colspan="2" style="padding:0;"><div style="border-top:2px solid ${accent};margin:6px 0;"></div></td></tr>`;
  totalsHtml += `<tr><td style="padding:6px 0;font-size:14pt;font-weight:800;color:#1a1a1a;">${hasExempt ? "Zu zahlen" : "Gesamtbetrag"}</td><td style="padding:6px 0;text-align:right;font-size:14pt;font-weight:800;color:#1a1a1a;">${fmtCurrency(Number(invoice.brutto_summe))}</td></tr>`;
  if (showPaymentInfo) {
    totalsHtml += `<tr><td style="padding:4px 0;color:#16a34a;font-size:9pt;">Bereits bezahlt</td><td style="padding:4px 0;text-align:right;color:#16a34a;font-size:9pt;">${fmtCurrency(bezahltBetrag)}</td></tr>`;
    totalsHtml += `<tr><td style="padding:4px 0;font-weight:700;color:${accent};font-size:10pt;">Offener Betrag</td><td style="padding:4px 0;text-align:right;font-weight:700;color:${accent};font-size:10pt;">${fmtCurrency(restBetrag)}</td></tr>`;
  }

  const metaParts: string[] = [];
  metaParts.push(
    `<div><span class="meta-label">${typLabel} Nr.</span><span class="meta-value">${invoice.nummer || "–"}</span></div>`
  );
  metaParts.push(
    `<div><span class="meta-label">Datum</span><span class="meta-value">${datumFormatted}</span></div>`
  );
  if (showLeistungsdatum && leistungFormatted)
    metaParts.push(
      `<div><span class="meta-label">${leistungLabel}</span><span class="meta-value">${leistungFormatted}</span></div>`
    );
  if (showFaelligAm && faelligFormatted)
    metaParts.push(
      `<div><span class="meta-label">Fällig am</span><span class="meta-value">${faelligFormatted}</span></div>`
    );
  if (gueltigBisFormatted)
    metaParts.push(
      `<div><span class="meta-label">Gültig bis</span><span class="meta-value">${gueltigBisFormatted}</span></div>`
    );
  if (showFaelligAm && invoice.zahlungsbedingungen) {
    // Interne Werte auf benutzerfreundliches Label mappen. "individuell"
    // blenden wir aus — das Fälligkeitsdatum steht eh schon oben.
    const zbRawMeta = invoice.zahlungsbedingungen.trim();
    const zbLabel =
      /sofort|umgehend|prompt/i.test(zbRawMeta) ? "Sofort fällig" :
      zbRawMeta.toLowerCase() === "individuell" ? "" :
      zbRawMeta;
    if (zbLabel) {
      metaParts.push(
        `<div><span class="meta-label">Zahlung</span><span class="meta-value">${escapeHtml(zbLabel)}</span></div>`
      );
    }
  }

  // Derive a light tinted background from the accent color (10% opacity)
  const accentLightBg = (() => {
    const c = accent.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16) || 224;
    const g = parseInt(c.slice(2, 4), 16) || 138;
    const b_ = parseInt(c.slice(4, 6), 16) || 32;
    return `rgba(${r},${g},${b_},0.08)`;
  })();

  const mahnBanner =
    mahnstufe > 0
      ? `
    <div style="background:${accentLightBg};border:2px solid ${accent};border-radius:6px;padding:12px 20px;margin-bottom:20px;text-align:center;font-weight:800;color:${accent};font-size:12pt;letter-spacing:1px;">
      ⚠ ${mahnstufe}. MAHNUNG
    </div>`
      : "";

  // Extract Zahlungsfrist days for closing text
  const zahlungsTage = invoice.zahlungsbedingungen
    ? invoice.zahlungsbedingungen.match(/(\d+)/)?.[1] || "14"
    : "14";

  // Editierbarer Closing-Text aus document_texts hat Vorrang.
  // Bei Angeboten greift sonst der Layout-Text L.closing_text_angebot
  // mit Interpolation von {{gueltig_bis}} und {{tage}} — analog zu
  // pdfGenerator, damit PDF und HTML identisch bleiben.
  const gueltigBisFmt = invoice.gueltig_bis
    ? new Date((invoice.gueltig_bis as string) + "T12:00:00").toLocaleDateString("de-AT")
    : "";
  const tageRest = (() => {
    if (!invoice.gueltig_bis) return 0;
    const bis = new Date((invoice.gueltig_bis as string) + "T12:00:00").getTime();
    const heute = Date.now();
    return Math.max(0, Math.round((bis - heute) / 86400000));
  })();
  const renderAngebotClosing = () => {
    let txt = L.closing_text_angebot || "";
    if (gueltigBisFmt) {
      txt = txt.replace(/\{\{gueltig_bis\}\}/g, gueltigBisFmt).replace(/\{\{tage\}\}/g, String(tageRest));
    } else {
      txt = txt.replace(/\s*bis zum\s*\{\{gueltig_bis\}\}/g, "").replace(/\{\{gueltig_bis\}\}/g, "").replace(/\{\{tage\}\}/g, "");
    }
    return txt.replace(/\s{2,}/g, " ").trim();
  };
  const customClosing = (invoice as any).custom_closing_text as string | undefined;
  const zbRaw = (invoice.zahlungsbedingungen || "").trim();
  const isZahlungSofort = /sofort|umgehend|prompt/i.test(zbRaw);
  const isIndividuell = zbRaw.toLowerCase() === "individuell";
  const faelligFmt = invoice.faellig_am
    ? new Date((invoice.faellig_am as string) + "T12:00:00").toLocaleDateString("de-AT")
    : "";
  const renderRechnungClosing = () => {
    if (isZahlungSofort) return "Zahlbar sofort ohne Abzug.";
    if (isIndividuell && faelligFmt) return `Zahlbar bis ${faelligFmt} ohne Abzug.`;
    return `Wir bedanken uns für Ihren Auftrag und bitten um Überweisung des Rechnungsbetrages innerhalb von ${zahlungsTage} Tagen.`;
  };
  const renderGutschriftClosing = () =>
    "Hiermit schreiben wir Ihnen den oben angeführten Betrag gut. Die Auszahlung erfolgt innerhalb von 14 Tagen auf Ihr bekanntes Bankkonto bzw. wird mit einer offenen Rechnung verrechnet.";
  const isGutschrift = docCfg.typ === "gutschrift";
  const closingText = customClosing
    ? `<div class="closing-text">${escapeHtml(customClosing)}</div>`
    : isAngebot
      ? `<div class="closing-text">${escapeHtml(renderAngebotClosing())}</div>`
      : isGutschrift
        ? `<div class="closing-text">${escapeHtml(renderGutschriftClosing())}</div>`
        : `<div class="closing-text">${escapeHtml(renderRechnungClosing())}</div>`;

  // Anzahlungs-Hinweis aus document_texts — nur bei Anzahlungsrechnung gerendert.
  const anzahlungHinweis = (invoice as any).custom_anzahlung_hinweis as string | undefined;
  const anzahlungHinweisBlock =
    anzahlungHinweis && invoice.typ === "anzahlungsrechnung"
      ? `<div style="margin-top:8px;font-style:italic;font-size:9pt;color:#555;">${escapeHtml(anzahlungHinweis)}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>${typLabel} ${invoice.nummer || "Vorschau"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 15mm 15mm 25mm 15mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif; font-size: 9pt; color: #333; line-height: 1.5; }
  .heading, .doc-title, .recipient-name { font-family: "Montserrat", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; letter-spacing: -0.01em; }
  .page-wrap { max-width: 180mm; margin: 0 auto; padding: 0; display: flex; flex-direction: column; min-height: 100vh; }

  /* Header — Briefkopf Holzbau Groismaier: Logo oben rechts (Hochformat-
     Lockup mit Firmenname), kompakte Firmen-/Kontaktinfo links. */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid #ccc; margin-bottom: 18px; gap: 14px; }
  .header-logo { flex: 0 0 auto; order: 2; }
  .header-logo img { width: 38mm; height: auto; display: block; }
  .header-info { order: 1; text-align: left; font-size: 7pt; color: #666; line-height: 1.6; max-width: 95mm; }
  .header-info strong { color: #1a1a1a; font-size: 8.5pt; font-family: "Montserrat", "Segoe UI", sans-serif; font-weight: 700; }

  /* Address row — recipient left, meta right */
  .address-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
  .recipient { flex: 1; }
  .sender-line { font-size: 7pt; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 8px; display: inline-block; }
  .recipient-name { font-weight: 700; font-size: 10pt; color: #1a1a1a; }
  .recipient-addr { font-size: 9pt; color: #555; line-height: 1.6; }
  .doc-meta { text-align: right; min-width: 180px; }
  .doc-meta-row { display: flex; justify-content: space-between; gap: 12px; font-size: 8.5pt; line-height: 1.8; }
  .doc-meta-label { color: #888; }
  .doc-meta-value { color: #1a1a1a; font-weight: 600; }

  /* Document title */
  .doc-title { font-size: 14pt; font-weight: 800; color: #1a1a1a; margin-bottom: 16px; border-bottom: 2px solid ${accent}; padding-bottom: 6px; }

  /* Items table */
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  table.items thead { display: table-header-group; }
  table.items thead th { border-bottom: 2px solid #333; padding: 6px 8px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: #555; background: #fff; }
  table.items tbody td { padding: 7px 8px; border-bottom: 1px solid #e0e0e0; font-size: 8.5pt; vertical-align: top; }
  table.items tbody tr { page-break-inside: avoid; }
  table.items tbody tr:last-child td { border-bottom: 2px solid #333; }

  /* Totals */
  .totals-section { margin-top: 4px; page-break-inside: avoid; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 18px; }
  .totals-table { width: 250px; }
  .totals-table td { padding: 3px 0; font-size: 9pt; }

  /* Notes */
  .notes { border-left: 3px solid #ddd; padding: 8px 14px; font-size: 8.5pt; color: #555; margin-bottom: 14px; }

  /* Closing */
  .closing-text { font-size: 8.5pt; color: #666; margin-bottom: 14px; padding-top: 8px; }

  /* Bank info */
  .bank-info { margin-bottom: 10px; }
  .bank-info-row { font-size: 8pt; color: #555; }
  .bank-info-row strong { color: #333; }

  /* Footer — fixed at bottom of every printed page */
  .footer { border-top: 2px solid ${accent}; padding: 6px 0 2px 0; font-size: 6.5pt; color: #666; line-height: 1.5; margin-top: 30px; }
  @media print {
    .footer { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; background: #fff; }
  }
  .footer-line { text-align: center; }

  /* Storniert watermark */
  .storniert::after { content: 'STORNIERT'; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 72pt; color: rgba(204,0,0,0.08); font-weight: 900; pointer-events: none; letter-spacing: 8px; }
</style>
</head>
<body class="${invoice.status === "storniert" ? "storniert" : ""}">

<div class="page-wrap">

${mahnBanner}

<!-- Header -->
<div class="header">
  <div class="header-logo">
    ${LOGO_IMG}
  </div>
  <div class="header-info">
    <strong>${L.company.name}</strong><br>
    ${L.company.address_line1 ? L.company.address_line1 + "<br>" : ""}
    ${L.company.address_line2 ? L.company.address_line2 + "<br>" : ""}
    ${L.company.phone ? "Tel: " + L.company.phone + "<br>" : ""}
    ${L.company.email ? "E-Mail: " + L.company.email : ""}
  </div>
</div>

<!-- Address row — recipient left, meta right -->
<div class="address-row">
  <div class="recipient">
    <div class="sender-line">${L.sender_line || [L.company.name, L.company.address_line1, L.company.address_line2].filter(Boolean).join(" · ")}</div>
    ${(() => {
      // Bei Geschäftskunden ist die Anrede irrelevant (steht implizit im
      // Firmennamen). Bei Privatkunden zeigen wir Anrede + Titel + Name.
      const isGeschaeft = (invoice.kunde_kundentyp || "").toLowerCase() === "geschaeftskunde";
      const anrede = (invoice.kunde_anrede || "").trim();
      const titel = (invoice.kunde_titel || "").trim();
      const name = (invoice.kunde_name || "–").trim();
      // Anrede nicht doppeln, wenn sie als Substring in name steckt
      // (z. B. anrede="Firma Hobinger GmbH", name="Hobinger GmbH").
      const anredeRedundant = !!anrede && (
        anrede.toLowerCase() === "firma" ||
        name.toLowerCase().includes(anrede.toLowerCase()) ||
        anrede.toLowerCase().includes(name.toLowerCase())
      );
      const showAnrede = !isGeschaeft && anrede && !anredeRedundant;
      // Titel-Feld nur bei Privatkunden zeigen und nur wenn es nicht
      // redundant zum Namen ist (Geschäftskunden hatten gelegentlich
      // den Firmennamen im titel-Feld → Doppelung im PDF).
      const titelRedundant = !!titel && (
        name.toLowerCase().includes(titel.toLowerCase()) ||
        titel.toLowerCase().includes(name.toLowerCase())
      );
      const showTitel = !isGeschaeft && !!titel && !titelRedundant;
      const titleLine = showTitel ? `${titel} ${name}`.trim() : name;
      return `${showAnrede ? `<div style="font-size:9pt;color:#555;">${anrede}</div>` : ""}<div class="recipient-name">${titleLine}</div>`;
    })()}
    <div class="recipient-addr">
      ${invoice.kunde_adresse ? `${invoice.kunde_adresse}<br>` : ""}
      ${invoice.kunde_plz || invoice.kunde_ort ? `${invoice.kunde_plz || ""} ${invoice.kunde_ort || ""}<br>` : ""}
      ${invoice.kunde_land && invoice.kunde_land !== "Österreich" ? `${invoice.kunde_land}<br>` : ""}
    </div>
  </div>
  <div class="doc-meta">
    ${metaParts.map(p => {
      // Convert meta-grid items to simple rows
      const labelMatch = p.match(/class="meta-label">([^<]+)/);
      const valueMatch = p.match(/class="meta-value">([^<]+)/);
      if (labelMatch && valueMatch) {
        return `<div class="doc-meta-row"><span class="doc-meta-label">${labelMatch[1]}</span><span class="doc-meta-value">${valueMatch[1]}</span></div>`;
      }
      return "";
    }).join("")}
  </div>
</div>

<!-- Optional Einleitungstext (custom_intro_text aus document_texts) -->
${(invoice as any).custom_intro_text ? `<div style="margin-bottom:14px;font-size:9.5pt;color:#444;white-space:pre-line;">${escapeHtml(((invoice as any).custom_intro_text as string).trim())}</div>` : ""}

<!-- Document Title + Betreff (kept together for page breaks) -->
<div style="page-break-inside:avoid;">
<div class="doc-title">${typLabel}${invoice.nummer ? ` Nr.: ${invoice.nummer}` : ""}</div>
${invoice.betreff ? `<div style="margin-bottom:12px;font-size:10pt;white-space:pre-line;">${invoice.betreff.replace(/</g, "&lt;")}</div>` : ""}
</div>

${(() => {
  // Bezugs-Block bei Gutschrift mit verknüpfter Rechnung — analog
  // zum PDF-Renderer. _parent_nummer / _parent_datum werden in
  // buildInvoiceForPdf aus parent_invoice_id geladen.
  if (docCfg.typ !== "gutschrift") return "";
  const parentNr = (invoice as any)._parent_nummer as string | undefined;
  const parentDatum = (invoice as any)._parent_datum as string | undefined;
  if (!parentNr) return "";
  const txt = parentDatum
    ? `Bezug: Rechnung ${parentNr} vom ${parentDatum}`
    : `Bezug: Rechnung ${parentNr}`;
  return `<div style="margin-bottom:12px;font-size:9.5pt;color:#444;">${escapeHtml(txt)}</div>`;
})()}

${(() => {
  // Allgemeine Angaben — nur bei Angebot + Auftragsbestätigung, nur
  // wenn der User den Toggle aktiviert hat UND min. 1 Feld einen Wert
  // hat (Sicherheitsnetz gegen leeren Block).
  if (!isAngebot) return "";
  if (!(invoice as any).allgemeine_angaben_aktiv) return "";
  const aaRows = buildAllgemeineAngabenRows(invoice as any);
  if (aaRows.length === 0) return "";
  // Akzent-Light für Header (10% gegen weiß) — analog PDF-Variante.
  const accentLight = (() => {
    const c = accent.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const lighten = (v: number) => Math.round(255 - (255 - v) * 0.18);
    return `rgb(${lighten(r)},${lighten(g)},${lighten(b)})`;
  })();
  const rows = aaRows.map(r =>
    `<tr><td style="width:35%;padding:6px 10px;border-top:1px solid #e5e5e5;font-weight:600;color:#444;vertical-align:top;">${escapeHtml(r.label)}</td><td style="padding:6px 10px;border-top:1px solid #e5e5e5;white-space:pre-line;color:#1a1a1a;">${escapeHtml(r.value)}</td></tr>`
  ).join("");
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:9.5pt;border:1px solid #e5e5e5;page-break-inside:avoid;">
  <thead><tr><th colspan="2" style="background:${accentLight};padding:6px 10px;text-align:left;font-weight:700;border-bottom:1px solid #e5e5e5;">Allgemeine Angaben</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
})()}

<table class="items">
  <thead>
    <tr>
      <th style="width:40px;text-align:center;">Pos.</th>
      <th style="width:55px;text-align:right;">Menge</th>
      <th style="width:45px;text-align:center;">Einh.</th>
      <th style="text-align:left;">Beschreibung</th>
      ${hidePrices ? "" : `<th style="width:75px;text-align:right;">Preis</th>
      <th style="width:50px;text-align:right;">Rabatt</th>
      <th style="width:85px;text-align:right;">Gesamt</th>`}
    </tr>
  </thead>
  <tbody>
    ${(items || []).map((item) => {
      const itemRabattProz = Number((item as any).rabatt_prozent) || 0;
      return `<tr>
      <td style="text-align:center;color:#888;">${String(item.position).padStart(2, "0")}</td>
      <td style="text-align:right;">${fmt(Number(item.menge))}</td>
      <td style="text-align:center;color:#888;">${item.einheit || "Stk."}</td>
      <td>${item.beschreibung}</td>
      ${hidePrices ? "" : `<td style="text-align:right;">${fmtCurrency(Number(item.einzelpreis))}</td>
      <td style="text-align:right;color:${itemRabattProz > 0 ? accent : "#bbb"};">${itemRabattProz > 0 ? `${itemRabattProz}%` : "—"}</td>
      <td style="text-align:right;font-weight:600;">${fmtCurrency(Number(item.gesamtpreis))}</td>`}
    </tr>`;
    }).join("")}
  </tbody>
</table>
${hidePrices ? "" : `<div class="totals-section">
  <div class="totals-wrap">
    <table class="totals-table">
      ${totalsHtml}
    </table>
  </div>
</div>`}

${invoice.notizen ? `<div class="notes"><strong>Anmerkung:</strong> ${invoice.notizen}</div>` : ""}

${closingText}
${anzahlungHinweisBlock}

${
  showBank
    ? `<div class="bank-info" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
  <div class="bank-info-row">
    <strong>Bankverbindung:</strong> ${[b.kontoinhaber, b.iban ? `IBAN: ${b.iban}` : "", b.bic ? `BIC: ${b.bic}` : ""].filter(Boolean).join(" · ")}
  </div>
  ${qrCodeDataUri ? `<div style="text-align:center;flex-shrink:0;">
    <img src="${qrCodeDataUri}" style="width:80px;height:80px;" alt="QR-Code Zahlung" />
    <div style="font-size:6pt;color:#888;margin-top:2px;">Zahlen mit Code</div>
  </div>` : ""}
</div>`
    : ""
}

<!-- Footer -->
<div class="footer">
  <div class="footer-line">
    ${L.footer.line1 || [L.company.name, L.company.slogan, L.company.address_line1, L.company.address_line2, L.company.phone, L.company.email].filter(Boolean).join(" · ")}
  </div>
  ${L.footer.line2 ? `<div class="footer-line">${L.footer.line2}</div>` : ""}
  ${L.footer.line3 ? `<div class="footer-line">${L.footer.line3}</div>` : ""}
  ${L.footer.show_bank_in_footer && (b.iban || b.bic) ? `<div class="footer-line">${[b.iban ? `IBAN: ${b.iban}` : "", b.bic ? `BIC: ${b.bic}` : ""].filter(Boolean).join(" · ")}</div>` : ""}
</div>

</div><!-- /page-wrap -->
</body></html>`;
}
