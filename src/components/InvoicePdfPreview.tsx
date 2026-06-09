import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Save, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildInvoiceHtml,
  generateEpcQrCode,
  DEFAULT_BANK,
  type InvoiceHtmlData,
  type InvoiceHtmlItem,
  type BankData,
} from "@/lib/invoiceHtml";
import { generateInvoicePdf } from "@/lib/pdfGenerator";
import { loadDocumentTexts, applyDocumentTextsToInvoice } from "@/lib/documentTextsLoader";
import { type InvoiceLayoutSettings, DEFAULT_LAYOUT, parseLayoutSettings } from "@/lib/invoiceLayoutTypes";

import { loadInvoiceLogo } from "@/lib/logoLoader";

async function getLogoDataUri(): Promise<string | undefined> {
  return loadInvoiceLogo();
}

interface InvoicePdfPreviewProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => Promise<void> | void;
  onSavedClose?: () => void;
  saving?: boolean;
  saved?: boolean;
  invoiceId?: string;
  formData?: InvoiceHtmlData;
  items?: InvoiceHtmlItem[];
  fileName?: string;
}

export function InvoicePdfPreview({
  open,
  onClose,
  onSave,
  onSavedClose,
  saving,
  saved,
  invoiceId,
  formData,
  items,
  fileName,
}: InvoicePdfPreviewProps) {
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formDataRef = useRef(formData);
  const itemsRef = useRef(items);
  formDataRef.current = formData;
  itemsRef.current = items;

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  useEffect(() => {
    if (!open) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setError(null);
      return;
    }
    generatePdf();
  }, [open, invoiceId]);

  useEffect(() => {
    if (open && saved) generatePdf();
  }, [saved, formData?.nummer]);

  const generatePdf = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Load bank data + firmen UID
      let bankData: BankData = { ...DEFAULT_BANK };
      let loadedFirmenUid = "";
      let layout: InvoiceLayoutSettings = DEFAULT_LAYOUT;
      try {
        const { data: bankSettings } = await supabase
          .from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid", "invoice_layout"]);
        if (bankSettings) {
          bankSettings.forEach((row: any) => {
            if (row.key === "bank_kontoinhaber") bankData.kontoinhaber = row.value;
            if (row.key === "bank_iban") bankData.iban = row.value;
            if (row.key === "bank_bic") bankData.bic = row.value;
            if (row.key === "firmen_uid") loadedFirmenUid = row.value;
            if (row.key === "invoice_layout") layout = parseLayoutSettings(row.value);
          });
        }
      } catch {}

      if (!formDataRef.current || !itemsRef.current) {
        setGenerating(false);
        return;
      }

      const logoUri = await getLogoDataUri();

      // QR code für alle zahlbaren Rechnungstypen (Rechnung, Anzahlungs-,
      // Schlussrechnung). Gutschrift bewusst ausgeklammert (Auszahlung).
      const _payableQR = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);
      let qrDataUri: string | undefined;
      if (_payableQR.has(formDataRef.current.typ) && formDataRef.current.brutto_summe > 0) {
        try {
          qrDataUri = await generateEpcQrCode(
            formDataRef.current.brutto_summe,
            formDataRef.current.nummer || "Rechnung",
            bankData
          );
        } catch {}
      }

      // Editierbare Textbausteine für den Typ laden und am Invoice-Objekt
      // als custom_*_text anhängen (pdfGenerator/invoiceHtml verwenden diese
      // Overrides vor den hardcodierten Defaults).
      const docTexts = await loadDocumentTexts(formDataRef.current.typ);
      const tageMatch = (formDataRef.current.zahlungsbedingungen || "").match(/\d+/);
      const invoiceWithTexts = applyDocumentTextsToInvoice(formDataRef.current, docTexts, {
        tage: tageMatch ? Number(tageMatch[0]) : 14,
      });

      const blob = await generateInvoicePdf(
        invoiceWithTexts,
        itemsRef.current,
        bankData,
        logoUri,
        qrDataUri,
        loadedFirmenUid,
        layout
      );

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      console.error("PDF error:", err);
      setError(`PDF-Fehler: ${err?.message || "Unbekannt"}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `${fileName || "Dokument"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl);
    if (win) {
      win.addEventListener("load", () => setTimeout(() => win.print(), 300));
    }
  };

  const mustSaveFirst = onSave && !saved;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { saved && onSavedClose ? onSavedClose() : onClose(); } }}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>

        <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex gap-2 flex-wrap items-center">
            {mustSaveFirst && (
              <>
                <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 bg-orange-600 hover:bg-orange-700">
                  <Save className="h-4 w-4" />
                  {saving ? "Speichert..." : "Speichern"}
                </Button>
                <span className="text-sm text-muted-foreground">Zuerst speichern, dann herunterladen</span>
              </>
            )}
            {!mustSaveFirst && (
              <>
                <Button size="sm" onClick={handleDownload} disabled={!pdfUrl} className="gap-2">
                  <Download className="h-4 w-4" />
                  PDF herunterladen
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={!pdfUrl} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Drucken
                </Button>
              </>
            )}
          </div>
          <div>
            {saved && onSavedClose ? (
              <Button variant="outline" size="sm" onClick={onSavedClose}>
                <X className="h-4 w-4 mr-2" /> Zurück zur Übersicht
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="h-4 w-4 mr-2" /> Schließen
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-gray-300">
          {generating ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">PDF wird erstellt...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-destructive mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={generatePdf}>Nochmal versuchen</Button>
              </div>
            </div>
          ) : pdfUrl ? (
            <div className="relative w-full h-full">
              <iframe src={pdfUrl} className="w-full h-full border-0" title="PDF Preview" />
              {!saved && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center" aria-hidden="true">
                  <span
                    className="text-[120px] font-bold text-black/[0.08] select-none whitespace-nowrap"
                    style={{ transform: "rotate(-35deg)" }}
                  >
                    VORSCHAU
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
