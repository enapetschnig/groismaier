import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2 } from "lucide-react";
import { type InvoiceLayoutSettings, DEFAULT_LAYOUT, parseLayoutSettings } from "@/lib/invoiceLayoutTypes";
import { loadInvoiceLogo } from "@/lib/logoLoader";
// JSZip loaded dynamically in handleExport

interface ExportInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
  bankData: { kontoinhaber: string; iban: string; bic: string };
}

const MONTHS = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function ExportInvoicesDialog({ open, onClose, bankData }: ExportInvoicesDialogProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear.toString());
  const [month, setMonth] = useState(currentMonth.toString());
  const [includeStorno, setIncludeStorno] = useState(true);
  const [exportAll, setExportAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");
  // Standardmäßig werden alle Rechnungs-artigen Typen exportiert
  // (Rechnung, Anzahlungsrechnung, Schlussrechnung, Gutschrift). User kann
  // via Checkboxen einzelne Typen ab- bzw. anwählen.
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>({
    rechnung: true,
    anzahlungsrechnung: true,
    schlussrechnung: true,
    gutschrift: true,
  });

  const handleExport = async () => {
    const activeTypes = Object.entries(selectedTypes).filter(([, v]) => v).map(([k]) => k);
    if (activeTypes.length === 0) {
      toast({ variant: "destructive", title: "Keine Dokumenttypen", description: "Wähle mindestens einen Dokumenttyp aus." });
      return;
    }

    setExporting(true);
    setProgress("Lade Rechnungen...");

    try {
      // Build query
      let query = supabase
        .from("invoices")
        .select("*")
        .in("typ", activeTypes)
        .eq("jahr", parseInt(year));

      if (!exportAll) {
        // Filter by month
        const monthNum = parseInt(month);
        const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
        const endMonth = monthNum === 12 ? 1 : monthNum + 1;
        const endYear = monthNum === 12 ? parseInt(year) + 1 : parseInt(year);
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        query = query.gte("datum", startDate).lt("datum", endDate);
      }

      if (!includeStorno) {
        query = query.neq("status", "storniert");
      }

      const { data: invoices, error } = await query.order("laufnummer");
      if (error) throw error;

      if (!invoices || invoices.length === 0) {
        toast({ variant: "destructive", title: "Keine Rechnungen", description: "Keine Rechnungen für den gewählten Zeitraum gefunden." });
        setExporting(false);
        return;
      }

      // Warnung bei sehr großen Exporten (>200) — verhindert Browser-Absturz
      if (invoices.length > 200) {
        const ok = window.confirm(
          `⚠️ ${invoices.length} Rechnungen werden exportiert. Das kann mehrere Minuten dauern und viel Speicher verbrauchen.\n\nEmpfehlung: Exportiere monatsweise statt alles auf einmal.\n\nTrotzdem fortfahren?`
        );
        if (!ok) { setExporting(false); return; }
      }

      // Load logo (Custom oder Default)
      const logoUri = await loadInvoiceLogo();

      // Load firmen UID + layout settings
      let firmenUid = "";
      let layout: InvoiceLayoutSettings = DEFAULT_LAYOUT;
      try {
        const { data: settings } = await supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["firmen_uid", "invoice_layout"]);
        if (settings) {
          settings.forEach((s: any) => {
            if (s.key === "firmen_uid") firmenUid = s.value;
            if (s.key === "invoice_layout") layout = parseLayoutSettings(s.value);
          });
        }
      } catch {}

      const { generateInvoicePdf } = await import("@/lib/pdfGenerator");
      const { generateEpcQrCode } = await import("@/lib/invoiceHtml");
      const { loadDocumentTexts, applyDocumentTextsToInvoice } = await import("@/lib/documentTextsLoader");
      // Textbausteine pro Typ vorladen (Cache), damit nicht jede Rechnung neu lädt
      const docTextsByTyp: Record<string, any> = {};

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      let failed = 0;
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        setProgress(`PDF ${i + 1} von ${invoices.length}: ${inv.nummer}...`);

        try {
          const { data: items } = await supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", inv.id)
            .order("position");

          // QR-Code nur für zahlbare Rechnungstypen (nicht Gutschrift).
          const _payableQR = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);
          let qrUri: string | undefined;
          if (_payableQR.has(inv.typ) && Number(inv.brutto_summe) > 0) {
            try {
              qrUri = await generateEpcQrCode(Number(inv.brutto_summe), inv.nummer || "", bankData);
            } catch {}
          }

          let pdfBlob: Blob;
          let fileName: string;

          if (inv.status === "storniert" && inv.storno_nummer) {
            // Stornierte Rechnungen: Stornobeleg-PDF exportieren
            const { generateStornoPdf } = await import("@/lib/pdfGenerator");
            pdfBlob = generateStornoPdf(
              { nummer: inv.nummer, kunde_name: inv.kunde_name, brutto_summe: Number(inv.brutto_summe), datum: inv.datum },
              inv.storno_nummer, inv.storno_datum || inv.datum, inv.storno_grund || "",
              bankData, logoUri, layout
            );
            fileName = `Storno_${inv.storno_nummer}.pdf`;
          } else {
            if (!docTextsByTyp[inv.typ]) docTextsByTyp[inv.typ] = await loadDocumentTexts(inv.typ);
            const tageMatchExp = (inv.zahlungsbedingungen || "").match(/\d+/);
            const invoiceWithTexts = applyDocumentTextsToInvoice({
              typ: inv.typ, nummer: inv.nummer, status: inv.status,
              kunde_name: inv.kunde_name, kunde_adresse: inv.kunde_adresse,
              kunde_plz: inv.kunde_plz, kunde_ort: inv.kunde_ort,
              kunde_land: inv.kunde_land, kunde_email: inv.kunde_email,
              kunde_telefon: inv.kunde_telefon, kunde_uid: inv.kunde_uid,
              datum: inv.datum, faellig_am: inv.faellig_am,
              leistungsdatum: inv.leistungsdatum, gueltig_bis: inv.gueltig_bis,
              zahlungsbedingungen: inv.zahlungsbedingungen, notizen: inv.notizen,
              netto_summe: Number(inv.netto_summe), mwst_satz: Number(inv.mwst_satz),
              mwst_betrag: Number(inv.mwst_betrag), brutto_summe: Number(inv.brutto_summe),
              bezahlt_betrag: Number(inv.bezahlt_betrag), rabatt_prozent: Number(inv.rabatt_prozent),
              rabatt_betrag: Number(inv.rabatt_betrag), mahnstufe: Number(inv.mahnstufe),
              skonto_prozent: Number(inv.skonto_prozent || 0), skonto_tage: Number(inv.skonto_tage || 0),
              kunde_anrede: (inv as any).kunde_anrede || "", kunde_titel: (inv as any).kunde_titel || "",
              reverse_charge: (inv as any).reverse_charge || false,
              anzahlung_prozent: Number((inv as any).anzahlung_prozent || 0) || undefined,
            }, docTextsByTyp[inv.typ], { tage: tageMatchExp ? Number(tageMatchExp[0]) : 14 });
            pdfBlob = await generateInvoicePdf(
              invoiceWithTexts,
              (items || []).map((it: any) => ({
                position: it.position, beschreibung: it.beschreibung,
                kurztext: it.kurztext || it.beschreibung, langtext: it.langtext || "",
                menge: Number(it.menge), einheit: it.einheit || "Stk.",
                einzelpreis: Number(it.einzelpreis), gesamtpreis: Number(it.gesamtpreis),
                mwst_exempt: !!(it as any).mwst_exempt,
              })),
              bankData, logoUri, qrUri, firmenUid, layout
            );
            fileName = `${inv.nummer}.pdf`;
          }
          zip.file(fileName, pdfBlob);
        } catch (err) {
          console.error(`PDF generation failed for ${inv.nummer}:`, err);
          failed++;
        }
      }

      setProgress("ZIP wird erstellt...");
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Download
      const monthLabel = exportAll ? "Gesamt" : MONTHS[parseInt(month) - 1];
      const zipName = `Rechnungen_${year}_${monthLabel}${includeStorno ? "_inkl_Storno" : ""}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(url);

      const successCount = invoices.length - failed;
      toast({
        title: "Export abgeschlossen",
        description: failed > 0
          ? `${successCount} von ${invoices.length} Rechnungen exportiert (${failed} fehlgeschlagen)`
          : `${successCount} Rechnungen als ZIP heruntergeladen`,
      });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export fehlgeschlagen", description: err.message });
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !exporting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Rechnungen exportieren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Jahr</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monat</Label>
              <Select value={month} onValueChange={setMonth} disabled={exportAll}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, idx) => (
                    <SelectItem key={idx} value={(idx + 1).toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="exportAll" checked={exportAll} onCheckedChange={(c) => setExportAll(!!c)} />
            <Label htmlFor="exportAll">Ganzes Jahr exportieren</Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="includeStorno" checked={includeStorno} onCheckedChange={(c) => setIncludeStorno(!!c)} />
            <Label htmlFor="includeStorno">Stornierte Rechnungen einschließen</Label>
          </div>

          <div className="space-y-2 pt-1 border-t">
            <Label className="text-xs text-muted-foreground">Welche Dokumenttypen?</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["rechnung", "Rechnungen"],
                ["anzahlungsrechnung", "Anzahlungsrechnungen"],
                ["schlussrechnung", "Schlussrechnungen"],
                ["gutschrift", "Gutschriften"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`typ-${key}`}
                    checked={selectedTypes[key]}
                    onCheckedChange={(c) => setSelectedTypes(prev => ({ ...prev, [key]: !!c }))}
                  />
                  <Label htmlFor={`typ-${key}`} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </div>

          {exporting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={exporting}>Abbrechen</Button>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? "Exportiert..." : "Als ZIP herunterladen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
