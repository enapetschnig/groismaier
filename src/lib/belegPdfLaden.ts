// ============================================================================
// Ein gespeichertes Beleg-PDF erzeugen — aus der Belegliste herausgelöst
//
// Bisher stand dieser Ablauf (Beleg + Positionen + Bankdaten + Logo + QR +
// Dokumenttexte → generateInvoicePdf) in der Belegliste. Die Handy-Seite für
// Lieferscheine braucht exakt dasselbe PDF; statt den Ablauf zu kopieren,
// rufen beide diese Funktion auf. Eine Änderung am Aufbau wirkt dann an
// beiden Stellen.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { loadInvoiceLogo } from "./logoLoader";
import { zahlungsQrFuerBeleg } from "./invoiceHtml";
import { loadDocumentTexts, applyDocumentTextsToInvoice } from "./documentTextsLoader";
import { generateInvoicePdf } from "./pdfGenerator";
import type { InvoiceLayoutSettings } from "./invoiceLayoutTypes";

export interface BelegPdf {
  blob: Blob;
  nummer: string;
  typ: string;
}

export async function belegPdfErzeugen(invoiceId: string, layout?: InvoiceLayoutSettings): Promise<BelegPdf> {
  const [{ data: inv }, { data: invItems }, { data: bankSettings }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).single(),
    supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"),
    supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "bank_institut", "firmen_uid"]),
  ]);
  if (!inv) throw new Error("Beleg nicht gefunden");

  const bank = { kontoinhaber: "", iban: "", bic: "", institut: "" };
  let firmenUid = "";
  (bankSettings || []).forEach((s: any) => {
    if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
    if (s.key === "bank_iban") bank.iban = s.value;
    if (s.key === "bank_bic") bank.bic = s.value;
    if (s.key === "bank_institut") bank.institut = s.value;
    if (s.key === "firmen_uid") firmenUid = s.value;
  });

  const logoUri = await loadInvoiceLogo();
  const qrUri = await zahlungsQrFuerBeleg(inv.typ, Number(inv.brutto_summe), inv.nummer || "", bank);
  const docTexts = await loadDocumentTexts(inv.typ);
  const tageMatch = (inv.zahlungsbedingungen || "").match(/\d+/);
  const invoiceWithTexts = applyDocumentTextsToInvoice({
    // KOMPLETTE Zeile spreaden — so kommen auch die neuen Felder (referenz,
    // zeige_faelligkeit, zahlungstext, custom_*_text, lieferadresse,
    // kunde_kontaktperson, kundennummer, und die Beleg-ID für Unterschrift
    // und Fotos) mit aufs PDF, und beleg-eigene Texte werden nicht
    // überschrieben (Audit).
    ...(inv as any),
    kunde_anrede: inv.kunde_anrede || "", kunde_titel: inv.kunde_titel || "", reverse_charge: inv.reverse_charge || false,
    netto_summe: Number(inv.netto_summe), mwst_satz: Number(inv.mwst_satz),
    mwst_betrag: Number(inv.mwst_betrag), brutto_summe: Number(inv.brutto_summe),
    bezahlt_betrag: Number(inv.bezahlt_betrag), rabatt_prozent: Number(inv.rabatt_prozent),
    rabatt_betrag: Number(inv.rabatt_betrag), mahnstufe: Number(inv.mahnstufe),
    skonto_prozent: Number(inv.skonto_prozent || 0), skonto_tage: Number(inv.skonto_tage || 0),
    anzahlung_prozent: Number((inv as any).anzahlung_prozent || 0) || undefined,
  }, docTexts, { tage: tageMatch ? Number(tageMatch[0]) : 14 });

  const blob = await generateInvoicePdf(
    invoiceWithTexts,
    (invItems || []).map((it: any) => ({
      position: it.position, beschreibung: it.beschreibung,
      kurztext: it.kurztext || it.beschreibung, langtext: it.langtext || "",
      menge: Number(it.menge), einheit: it.einheit || "Stk.",
      einzelpreis: Number(it.einzelpreis), gesamtpreis: Number(it.gesamtpreis),
      // Positionsrabatt + Gruppen-/Sichtbarkeits-Felder MÜSSEN mit,
      // sonst druckt der Generator falsche Summen bzw. Aufbauten doppelt.
      rabatt_prozent: Number(it.rabatt_prozent) || 0,
      produktnummer: it.produktnummer || "",
      gruppe: it.gruppe || null,
      auf_pdf: it.auf_pdf !== false,
      ist_gruppensumme: !!it.ist_gruppensumme,
      ist_info: !!(it as any).ist_info,
      mwst_exempt: !!(it as any).mwst_exempt,
    })),
    bank, logoUri, qrUri, firmenUid, layout,
  );
  return { blob, nummer: inv.nummer || invoiceId.slice(0, 8), typ: inv.typ };
}

/** Blob als Datei herunterladen — der Browser-Weg, der auch am Handy funktioniert. */
export function blobHerunterladen(blob: Blob, dateiname: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
