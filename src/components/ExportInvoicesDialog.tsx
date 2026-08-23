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
  bankData: { kontoinhaber: string; iban: string; bic: string; institut?: string };
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
  /**
   * Eingangsrechnungen (Original-Belege) mit ins Paket (Kundenwunsch
   * 23.08.2026: "Ich speichere bis jetzt alle Rechnungen monatsweise in
   * einen Ordner für die Buchhaltung"). Das ZIP bekommt dann die gewohnte
   * Ordnerstruktur Ausgangsrechnungen/ + Eingangsrechnungen/.
   */
  const [includeEingang, setIncludeEingang] = useState(true);
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
        // NICHT nach der Spalte `jahr` filtern: die traegt das Jahr der
        // Belegnummer (Anlagejahr). Eine im Januar 2027 erfasste Rechnung mit
        // Leistungsdatum Dezember 2026 fiel damit aus dem Buchhaltungs-Export
        // heraus — der Steuerberater bekam sie nie. Massgeblich ist das
        // Belegdatum; die Monats-/Jahresgrenzen setzt der Datumsfilter unten.
        .gte("datum", `${year}-01-01`)
        .lte("datum", `${year}-12-31`);

      if (!exportAll) {
        // Filter by month
        const monthNum = parseInt(month);
        const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
        const endMonth = monthNum === 12 ? 1 : monthNum + 1;
        const endYear = monthNum === 12 ? parseInt(year) + 1 : parseInt(year);
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        query = query.gte("datum", startDate).lt("datum", endDate);
      }

      // Entwürfe IMMER ausschließen — sie tragen nur eine Platzhalter-Nummer
      // und sind keine ausgestellten Belege (Regel aus src/lib/belegEntwurf.ts).
      // Vorher hing der Entwurf-Filter fälschlich an der Storno-Checkbox:
      // mit "inkl. Storno" (Standard!) wanderten Entwürfe in den
      // Buchhaltungs-Export.
      query = query.neq("status", "entwurf");
      if (!includeStorno) {
        query = query.neq("status", "storniert");
      }

      const { data: invoicesRoh, error } = await query.order("laufnummer");
      if (error) throw error;
      const invoices = invoicesRoh || [];

      // Ohne Eingangsrechnungs-Teil ist ein leerer Monat ein Abbruch; MIT
      // ihm läuft der Export weiter — sonst käme ein Monat, in dem nur
      // Lieferantenbelege existieren, nie in die Buchhaltung.
      if (invoices.length === 0 && !includeEingang) {
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
      const { zahlungsQrFuerBeleg } = await import("@/lib/invoiceHtml");
      const { loadDocumentTexts, applyDocumentTextsToInvoice } = await import("@/lib/documentTextsLoader");
      // Textbausteine pro Typ vorladen (Cache), damit nicht jede Rechnung neu lädt
      const docTextsByTyp: Record<string, any> = {};

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      // Mit Eingangsrechnungen: Ordnerstruktur wie Christians Buchhaltungs-
      // Ordner (Ausgangsrechnungen/ + Eingangsrechnungen/); ohne: flach wie bisher.
      const ordnerAus = includeEingang ? "Ausgangsrechnungen/" : "";

      let failed = 0;
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        setProgress(`PDF ${i + 1} von ${invoices.length}: ${inv.nummer}...`);

        try {
          // KingBill-Altbestand: das ORIGINAL-PDF aus dem Storage ist der
          // Beleg, den der Kunde bekommen hat — für die Buchhaltung zählt
          // das Original, nicht eine Neu-Erzeugung im heutigen Layout.
          const originalPfad = (inv as any).original_pdf_path as string | null;
          if (originalPfad && inv.status !== "storniert") {
            const { data: orig } = await supabase.storage.from("invoice-pdfs").download(originalPfad);
            if (orig) {
              zip.file(`${ordnerAus}${inv.nummer}.pdf`, orig);
              continue;
            }
            // Original nicht ladbar → unten normal neu erzeugen.
          }

          const { data: items } = await supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", inv.id)
            .order("position");

          // Zahlungs-QR — dieselbe Regel wie überall (zahlungsQrFuerBeleg).
          const qrUri = await zahlungsQrFuerBeleg(inv.typ, Number(inv.brutto_summe), inv.nummer || "", bankData);

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
              // Komplette Zeile spreaden — neue Felder + Beleg-Texte mitnehmen (Audit).
              ...(inv as any),
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
                rabatt_prozent: Number(it.rabatt_prozent) || 0,
                produktnummer: it.produktnummer || "",
                gruppe: it.gruppe || null,
                auf_pdf: it.auf_pdf !== false,
                ist_gruppensumme: !!it.ist_gruppensumme,
                mwst_exempt: !!(it as any).mwst_exempt,
              })),
              bankData, logoUri, qrUri, firmenUid, layout
            );
            fileName = `${inv.nummer}.pdf`;
          }
          zip.file(ordnerAus + fileName, pdfBlob);
        } catch (err) {
          console.error(`PDF generation failed for ${inv.nummer}:`, err);
          failed++;
        }
      }

      // Eingangsrechnungen: Original-Belege (PDF/Foto) aus dem Storage in
      // den Unterordner Eingangsrechnungen/ — maßgeblich ist das
      // Rechnungsdatum des Lieferanten.
      let eingangAnzahl = 0;
      let eingangFehler = 0;
      let eingangOhneDatum = 0;
      if (includeEingang) {
        setProgress("Lade Eingangsrechnungen...");
        let erQuery = (supabase.from("purchase_invoices" as never) as any)
          .select("id, lieferant, rechnungsnummer, rechnungsdatum, pdf_path, file_name")
          .not("pdf_path", "is", null);
        if (exportAll) {
          erQuery = erQuery.gte("rechnungsdatum", `${year}-01-01`).lte("rechnungsdatum", `${year}-12-31`);
        } else {
          const monthNum = parseInt(month);
          const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
          const endMonth = monthNum === 12 ? 1 : monthNum + 1;
          const endYear = monthNum === 12 ? parseInt(year) + 1 : parseInt(year);
          erQuery = erQuery
            .gte("rechnungsdatum", startDate)
            .lt("rechnungsdatum", `${endYear}-${String(endMonth).padStart(2, "0")}-01`);
        }
        const { data: eingaenge, error: erError } = await erQuery.order("rechnungsdatum");
        if (erError) {
          console.error("Eingangsrechnungen laden fehlgeschlagen:", erError);
          eingangFehler++;
        }
        // Belege ohne Rechnungsdatum können keinem Monat zugeordnet werden —
        // zählen und im Ergebnis ausweisen statt still auszulassen.
        if (!exportAll) {
          const { count } = await (supabase.from("purchase_invoices" as never) as any)
            .select("id", { count: "exact", head: true })
            .is("rechnungsdatum", null)
            .not("pdf_path", "is", null);
          eingangOhneDatum = count ?? 0;
        }
        const sauber = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
        for (let i = 0; i < ((eingaenge as any[]) || []).length; i++) {
          const er = (eingaenge as any[])[i];
          setProgress(`Eingangsrechnung ${i + 1} von ${(eingaenge as any[]).length}: ${er.lieferant || ""}...`);
          try {
            const { data: datei, error: dlError } = await supabase.storage
              .from("purchase-invoices").download(er.pdf_path);
            if (dlError || !datei) throw dlError || new Error("Datei fehlt");
            const endung = (er.file_name || er.pdf_path).split(".").pop() || "pdf";
            const name = sauber(
              `${er.rechnungsdatum || ""}_${er.lieferant || "Unbekannt"}${er.rechnungsnummer ? `_${er.rechnungsnummer}` : ""}`,
            ) || `Beleg_${i + 1}`;
            zip.file(`Eingangsrechnungen/${name}.${endung}`, datei);
            eingangAnzahl++;
          } catch (err) {
            console.error(`Eingangsrechnung ${er.lieferant || er.id} fehlgeschlagen:`, err);
            eingangFehler++;
          }
        }
      }

      setProgress("ZIP wird erstellt...");
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Download
      const monthLabel = exportAll ? "Gesamt" : MONTHS[parseInt(month) - 1];
      const zipName = includeEingang
        ? `Buchhaltung_${year}_${monthLabel}.zip`
        : `Rechnungen_${year}_${monthLabel}${includeStorno ? "_inkl_Storno" : ""}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(url);

      const successCount = invoices.length - failed;
      const teile = [
        failed > 0
          ? `${successCount} von ${invoices.length} Ausgangsrechnungen (${failed} fehlgeschlagen)`
          : `${successCount} Ausgangsrechnungen`,
      ];
      if (includeEingang) {
        teile.push(eingangFehler > 0
          ? `${eingangAnzahl} Eingangsrechnungen (${eingangFehler} fehlgeschlagen)`
          : `${eingangAnzahl} Eingangsrechnungen`);
        if (eingangOhneDatum > 0) {
          teile.push(`${eingangOhneDatum} Eingangsbeleg${eingangOhneDatum === 1 ? "" : "e"} OHNE Rechnungsdatum nicht dabei — bitte Datum nachtragen`);
        }
      }
      toast({
        title: "Export abgeschlossen",
        description: `${teile.join(" · ")} — als ZIP heruntergeladen.`,
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

          {/* Ganze Zeile ist antippbar (min. 44 px hoch) — eine 16-px-Checkbox
              trifft man mit dem Finger auf der Baustelle nicht. */}
          <Label htmlFor="exportAll" className="flex items-center gap-3 min-h-11 sm:min-h-0 cursor-pointer font-normal">
            <Checkbox id="exportAll" className="h-5 w-5" checked={exportAll} onCheckedChange={(c) => setExportAll(!!c)} />
            <span>Ganzes Jahr exportieren</span>
          </Label>

          <Label htmlFor="includeStorno" className="flex items-center gap-3 min-h-11 sm:min-h-0 cursor-pointer font-normal">
            <Checkbox id="includeStorno" className="h-5 w-5" checked={includeStorno} onCheckedChange={(c) => setIncludeStorno(!!c)} />
            <span>Stornierte Rechnungen einschließen</span>
          </Label>

          <Label htmlFor="includeEingang" className="flex items-start gap-3 min-h-11 sm:min-h-0 cursor-pointer font-normal">
            <Checkbox id="includeEingang" className="mt-0.5 h-5 w-5" checked={includeEingang} onCheckedChange={(c) => setIncludeEingang(!!c)} />
            <span>
              Eingangsrechnungen (Original-Belege) mitexportieren
              <span className="block text-xs text-muted-foreground">
                Das ZIP bekommt dann die Ordner „Ausgangsrechnungen“ und
                „Eingangsrechnungen“ — fertig für die Buchhaltung.
              </span>
            </span>
          </Label>

          <div className="space-y-2 pt-1 border-t">
            <Label className="text-xs text-muted-foreground">Welche Dokumenttypen?</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2">
              {([
                ["rechnung", "Rechnungen"],
                ["anzahlungsrechnung", "Anzahlungsrechnungen"],
                ["schlussrechnung", "Schlussrechnungen"],
                ["gutschrift", "Gutschriften"],
              ] as const).map(([key, label]) => (
                <Label
                  key={key}
                  htmlFor={`typ-${key}`}
                  className="flex items-center gap-3 min-h-11 sm:min-h-0 text-sm font-normal cursor-pointer"
                >
                  <Checkbox
                    id={`typ-${key}`}
                    className="h-5 w-5"
                    checked={selectedTypes[key]}
                    onCheckedChange={(c) => setSelectedTypes(prev => ({ ...prev, [key]: !!c }))}
                  />
                  <span>{label}</span>
                </Label>
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

        <div className="flex flex-wrap justify-end gap-2 pt-2">
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
