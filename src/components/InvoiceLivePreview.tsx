import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, PanelRightClose, PanelRightOpen, Eye, Printer, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
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

/**
 * Permanente Live-Vorschau des Belegs (KingBill-Stil) — wird auf breiten
 * Screens (xl+) rechts neben dem Beleg-Editor angedockt.
 *
 * Technik: identische PDF-Pipeline wie der Vorschau-Dialog
 * (<InvoicePdfPreview/>): generateInvoicePdf (jsPDF) → Blob-URL → iframe.
 * Damit ist die Live-Vorschau garantiert 1:1 das finale Dokument
 * (inkl. Lieferschein-hidePrices, Reverse Charge, Anzahlungs-Abzüge …).
 *
 * Performance:
 *  - Regenerierung debounced (~800 ms nach der letzten Änderung),
 *    Tippen wird nie blockiert.
 *  - app_settings/Layout/Logo werden einmal pro Mount gecacht,
 *    Textbausteine je Dokumenttyp — pro Neuaufbau bleibt nur die
 *    reine jsPDF-Erzeugung (+ QR bei zahlbaren Typen).
 *  - Sequenz-Guard verwirft veraltete (out-of-order) Ergebnisse.
 *  - Unterhalb xl wird nichts gerendert und nichts erzeugt — dort gilt
 *    weiterhin der bestehende Vorschau-Dialog.
 */

const STORAGE_KEY = "invoiceLivePreviewOpen";
const DEBOUNCE_MS = 800;
// Gleiche Menge wie im Vorschau-Dialog: QR nur für zahlbare Rechnungstypen.
const PAYABLE_QR_TYPES = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);

interface InvoiceLivePreviewProps {
  formData: InvoiceHtmlData & Record<string, any>;
  items: InvoiceHtmlItem[];
  /** Netto/Brutto-Anzeige im Panel-Kopf (KingBill-Stil); weglassen bei preislosen Belegen (Lieferschein). */
  netto?: number;
  brutto?: number;
  /** Dateiname (ohne .pdf) für den PDF-Export-Button. */
  fileName?: string;
}

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InvoiceLivePreview({ formData, items, netto, brutto, fileName }: InvoiceLivePreviewProps) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [isXl, setIsXl] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches
  );
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Immer die aktuellsten Props verwenden (wie im Vorschau-Dialog).
  const formDataRef = useRef(formData);
  const itemsRef = useRef(items);
  formDataRef.current = formData;
  itemsRef.current = items;

  // Sequenz-Guard + aktuelle Blob-URL (für Revoke).
  const seqRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  // Caches (einmal pro Mount bzw. je Typ).
  const settingsRef = useRef<{ bank: BankData; uid: string; layout: InvoiceLayoutSettings } | null>(null);
  const logoLoadedRef = useRef(false);
  const logoRef = useRef<string | undefined>(undefined);
  const docTextsRef = useRef<Record<string, any>>({});

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = (e: MediaQueryListEvent) => setIsXl(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Blob-URL beim Unmount freigeben.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* localStorage nicht verfügbar — Toggle bleibt Session-lokal */
      }
      return next;
    });
  };

  const generate = async () => {
    const seq = ++seqRef.current;
    setGenerating(true);
    setError(null);
    try {
      // Bank/UID/Layout einmalig laden und cachen.
      if (!settingsRef.current) {
        const bank: BankData = { ...DEFAULT_BANK };
        let uid = "";
        let layout: InvoiceLayoutSettings = DEFAULT_LAYOUT;
        try {
          const { data } = await supabase
            .from("app_settings")
            .select("key, value")
            .in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid", "invoice_layout"]);
          data?.forEach((row: any) => {
            if (row.key === "bank_kontoinhaber") bank.kontoinhaber = row.value;
            if (row.key === "bank_iban") bank.iban = row.value;
            if (row.key === "bank_bic") bank.bic = row.value;
            if (row.key === "firmen_uid") uid = row.value;
            if (row.key === "invoice_layout") layout = parseLayoutSettings(row.value);
          });
        } catch {
          /* Defaults verwenden */
        }
        settingsRef.current = { bank, uid, layout };
      }
      if (!logoLoadedRef.current) {
        logoRef.current = await loadInvoiceLogo();
        logoLoadedRef.current = true;
      }

      const fd = formDataRef.current;
      const its = itemsRef.current;
      if (!fd || !its) return;

      // Textbausteine je Dokumenttyp cachen.
      if (!(fd.typ in docTextsRef.current)) {
        docTextsRef.current[fd.typ] = await loadDocumentTexts(fd.typ);
      }

      let qrDataUri: string | undefined;
      if (PAYABLE_QR_TYPES.has(fd.typ) && Number(fd.brutto_summe) > 0) {
        try {
          qrDataUri = await generateEpcQrCode(
            Number(fd.brutto_summe),
            fd.nummer || "Rechnung",
            settingsRef.current.bank
          );
        } catch {
          /* QR optional */
        }
      }

      const tageMatch = (fd.zahlungsbedingungen || "").match(/\d+/);
      const invoiceWithTexts = applyDocumentTextsToInvoice(fd, docTextsRef.current[fd.typ], {
        tage: tageMatch ? Number(tageMatch[0]) : 14,
      });

      const blob = await generateInvoicePdf(
        invoiceWithTexts,
        its,
        settingsRef.current.bank,
        logoRef.current,
        qrDataUri,
        settingsRef.current.uid,
        settingsRef.current.layout
      );

      // Veraltetes Ergebnis (inzwischen neuer Lauf gestartet) verwerfen.
      if (seq !== seqRef.current) return;

      const nextUrl = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = nextUrl;
      setPdfUrl(nextUrl);
    } catch (err: any) {
      console.error("Live-Vorschau Fehler:", err);
      if (seq === seqRef.current) setError(err?.message || "Vorschau konnte nicht erstellt werden");
    } finally {
      if (seq === seqRef.current) setGenerating(false);
    }
  };

  // Debounced Auto-Refresh: 800 ms nach der letzten Änderung an Form/Positionen.
  const fingerprint = JSON.stringify([formData, items]);
  useEffect(() => {
    if (!isXl || !open) return;
    const t = window.setTimeout(() => {
      void generate();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, isXl, open]);

  // Unterhalb xl übernimmt der bestehende Vorschau-Dialog.
  if (!isXl) return null;

  // Eingeklappt: schmale Leiste zum Wieder-Einblenden (Zustand in localStorage).
  if (!open) {
    return (
      <div className="hidden xl:flex sticky top-20 shrink-0 self-start flex-col items-center gap-2 rounded-lg border bg-card p-1.5 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleOpen}
          title="Live-Vorschau einblenden"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        <span className="text-[10px] font-medium text-muted-foreground [writing-mode:vertical-rl] py-1 select-none">
          Vorschau
        </span>
      </div>
    );
  }

  return (
    <div
      className="hidden xl:flex w-[40%] shrink-0 sticky top-20 self-start flex-col rounded-lg border bg-card shadow-sm overflow-hidden"
      style={{ height: "calc(100vh - 6.5rem)" }}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold truncate">Live-Vorschau</span>
          {generating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void generate()}
            disabled={generating}
            title="Vorschau jetzt neu erzeugen"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => { if (pdfUrl) window.open(pdfUrl, "_blank"); }}
            disabled={!pdfUrl}
            title="Drucken — öffnet das PDF in neuem Tab mit Druckfunktion"
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (!pdfUrl) return;
              const a = document.createElement("a");
              a.href = pdfUrl;
              a.download = `${fileName || "Beleg"}.pdf`;
              a.click();
            }}
            disabled={!pdfUrl}
            title="Als PDF exportieren"
          >
            <FileDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleOpen}
            title="Vorschau ausblenden"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Netto/Brutto-Zeile im KingBill-Stil */}
      {netto !== undefined && brutto !== undefined && (
        <div className="flex items-center justify-end gap-3 border-b bg-muted/20 px-3 py-1 text-xs">
          <span className="text-muted-foreground">
            Netto <span className="font-semibold text-foreground">€ {eur(netto)}</span>
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">
            Brutto <span className="font-semibold text-foreground">€ {eur(brutto)}</span>
          </span>
        </div>
      )}

      <div className="flex-1 overflow-hidden bg-gray-200">
        {error ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="text-center">
              <p className="mb-2 text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void generate()}>
                Nochmal versuchen
              </Button>
            </div>
          </div>
        ) : pdfUrl ? (
          // Eigene Scrollbar: der PDF-Viewer im iframe scrollt selbst.
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0`}
            className="h-full w-full border-0"
            title="Beleg Live-Vorschau"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              <p className="text-sm">Vorschau wird erstellt…</p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        Aktualisiert sich automatisch beim Bearbeiten (ca. 1 Sek. nach der letzten Eingabe).
      </div>
    </div>
  );
}
