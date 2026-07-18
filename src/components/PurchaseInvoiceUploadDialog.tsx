import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, X, FileText, Image as ImageIcon, Loader2, Sparkles, Split, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
  prefillProjectId?: string | null;
  initialFile?: File | null;
}

const FALLBACK_KATEGORIEN = [
  { value: "material", label: "Material" },
  { value: "verbrauchsmaterial", label: "Verbrauchsmaterial" },
  { value: "werkzeug", label: "Werkzeug / Maschinen" },
  { value: "werkstatt", label: "Werkstatt" },
  { value: "fremdleistung", label: "Fremdleistung" },
  { value: "miete", label: "Miete / Leasing" },
  { value: "treibstoff", label: "Treibstoff / KFZ" },
  { value: "geschaeftsessen", label: "Geschäftsessen / Bewirtung" },
  { value: "buero", label: "Büro / Verwaltung" },
  { value: "fortbildung", label: "Fortbildung / Schulung" },
  { value: "versicherung", label: "Versicherung / Gebühren" },
  { value: "reise", label: "Reise / Hotel" },
  { value: "sonstiges", label: "Sonstiges" },
];

// Von der KI extrahierte Rechnungsposition (Zeile). Kommt aus
// parse-invoice-document als data.positionen — kann fehlen (null), wenn
// die Positionen nicht sicher lesbar sind (z.B. Kassabon).
type ParsedPosition = {
  beschreibung: string;
  betrag_netto: number | null;
  betrag_brutto: number | null;
};

const eur = (n: number) => `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PurchaseInvoiceUploadDialog({ open, onOpenChange, onUploaded, prefillProjectId, initialFile }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [kategorien, setKategorien] = useState<{ value: string; label: string }[]>(FALLBACK_KATEGORIEN);
  // KI-extrahierte Positionen + Projekt-Zuordnung je Position (index → project_id)
  const [positionen, setPositionen] = useState<ParsedPosition[]>([]);
  const [posProjekte, setPosProjekte] = useState<Record<number, string>>({});
  const [posSelected, setPosSelected] = useState<Set<number>>(new Set());
  const [bulkProject, setBulkProject] = useState("");

  useEffect(() => {
    if (files.length === 0) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(files[0]);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  const [form, setForm] = useState({
    lieferant: "",
    rechnungsnummer: "",
    rechnungsdatum: new Date().toISOString().split("T")[0],
    faellig_am: "",
    betrag_brutto: "",
    betrag_netto: "",
    ust_satz: "20",
    kategorie: "material",
    project_id: "",
    zahlungsart: "ueberweisung",
    status: "offen",
    notizen: "",
  });

  useEffect(() => {
    if (open) {
      setFiles([]);
      setPositionen([]);
      setPosProjekte({});
      setPosSelected(new Set());
      setBulkProject("");
      setForm({
        lieferant: "",
        rechnungsnummer: "",
        rechnungsdatum: new Date().toISOString().split("T")[0],
        faellig_am: "",
        betrag_brutto: "",
        betrag_netto: "",
        ust_satz: "20",
        kategorie: "material",
        project_id: prefillProjectId || "",
        zahlungsart: "ueberweisung",
        status: "offen",
        notizen: "",
      });
      // Load projects — vorausgewähltes Projekt (?project=) immer aufnehmen,
      // auch wenn es abgeschlossen ist, sonst zeigt das Select fälschlich
      // "Kein Projekt" obwohl die Zuordnung gesetzt ist.
      supabase.from("projects").select("id, name").not("status", "eq", "Abgeschlossen").order("name").then(async ({ data }) => {
        let list = data || [];
        if (prefillProjectId && !list.some(p => p.id === prefillProjectId)) {
          const { data: pre } = await supabase.from("projects").select("id, name").eq("id", prefillProjectId).maybeSingle();
          if (pre) list = [pre, ...list];
        }
        setProjects(list);
      });
      // Kategorien aus admin_config_options laden (fallback: hardcoded)
      (supabase.from("admin_config_options" as never) as any)
        .select("wert, label, sort_order")
        .eq("kategorie", "eingangsrechnung_kategorie")
        .eq("is_active", true)
        .order("sort_order")
        .then(({ data }: any) => {
          if (data && data.length > 0) {
            setKategorien(data.map((r: any) => ({ value: r.wert, label: r.label })));
          }
        });
      // Wenn per Kamera-Button geöffnet → Datei direkt übernehmen + scannen
      if (initialFile) {
        setFiles([initialFile]);
        void scanFileWithAi(initialFile);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillProjectId, initialFile]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  // Calculate netto from brutto on ust change
  const calcNetto = (brutto: string, ust: string) => {
    const b = parseFloat(brutto);
    const u = parseFloat(ust);
    if (!isNaN(b) && !isNaN(u)) {
      return (b / (1 + u / 100)).toFixed(2);
    }
    return "";
  };

  const handleFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter(f => {
      const ok = f.type === "application/pdf" || f.type.startsWith("image/");
      if (!ok) toast({ variant: "destructive", title: "Nicht unterstützt", description: `${f.name}: nur PDF, JPG, PNG` });
      return ok;
    });
    setFiles(prev => [...prev, ...arr]);
    // Automatischer KI-Scan auf die erste hochgeladene Datei — Brutto + andere
    // Felder werden direkt extrahiert, damit der User nichts tippen muss.
    if (arr.length > 0) {
      void scanFileWithAi(arr[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // Kamera-Fotos sind oft 5-12 MB. Supabase-Edge-Function hat 6 MB
  // Body-Limit. Wir skalieren nur wenig und nutzen hohe JPEG-Qualität,
  // damit die OCR-Zahlen gut lesbar bleiben — 2400px/92% ist ein
  // guter Kompromiss und bleibt unter 2 MB.
  const compressImage = async (file: File, maxDim = 2400, quality = 0.92): Promise<string> => {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      image.src = url;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas-Context nicht verfügbar");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };

  // KI-Scan: Rechnungsdaten aus einer Datei extrahieren und Form vorausfüllen.
  // Funktioniert mit Bildern (direkt) UND PDFs (1. Seite → JPEG-Rendering).
  const scanFileWithAi = async (file: File) => {
    setScanning(true);
    try {
      // Für mehrseitige PDFs: ALLE Seiten rendern → an GPT schicken.
      // Bei Rechnungen steht der Brutto-/Gesamtbetrag oft auf der letzten Seite,
      // deshalb ist die Gesamtsicht entscheidend für korrekte Extraktion.
      let imagesBase64: string[] = [];

      if (file.type === "application/pdf") {
        const { pdfAllPagesToJpegDataUrls } = await import("@/lib/pdfToImage");
        imagesBase64 = await pdfAllPagesToJpegDataUrls(file);
      } else if (file.type.startsWith("image/")) {
        // Fotos/Scans: auf max 2400px/92% runterrechnen.
        try {
          imagesBase64 = [await compressImage(file)];
        } catch (compressErr) {
          console.warn("Compression failed, using original:", compressErr);
          const raw = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          imagesBase64 = [raw];
        }
      } else {
        setScanning(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("parse-invoice-document", {
        // imagesBase64 (Array, mehrere Seiten) wird bevorzugt; fallback imageBase64
        body: imagesBase64.length > 1
          ? { imagesBase64 }
          : { imageBase64: imagesBase64[0] },
      });
      // Supabase-Funktionsfehler zeigt im .message nur "non-2xx status".
      // Den echten Fehler liefert .context als Response — Body auslesen.
      if (error) {
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.clone === "function") {
            const body = await ctx.clone().text();
            console.error("parse-invoice-document raw response:", ctx.status, body);
            try {
              const j = JSON.parse(body);
              detail = j?.details || j?.error || body || detail;
            } catch {
              if (body) detail = body;
            }
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.details || data.error);

      const parsed = data?.data;
      if (!parsed) throw new Error("Keine Daten erkannt");

      // Form vorausfüllen — KI-Werte haben Vorrang (überschreiben leere Defaults),
      // bestehende manuelle Eingabe bleibt nur dann, wenn KI nichts findet.
      setForm(prev => ({
        ...prev,
        lieferant: parsed.lieferant || prev.lieferant,
        rechnungsnummer: parsed.rechnungsnummer || prev.rechnungsnummer,
        rechnungsdatum: parsed.rechnungsdatum || prev.rechnungsdatum,
        faellig_am: parsed.faellig_am || prev.faellig_am,
        betrag_brutto: parsed.betrag_brutto ? String(parsed.betrag_brutto) : prev.betrag_brutto,
        betrag_netto: parsed.betrag_netto ? String(parsed.betrag_netto) : prev.betrag_netto,
        ust_satz: parsed.ust_satz ? String(parsed.ust_satz) : prev.ust_satz,
        kategorie: parsed.kategorie || prev.kategorie,
        notizen: parsed.notizen || prev.notizen,
      }));

      // Extrahierte Positionen übernehmen — können dann einzeln oder
      // mehrfach ausgewählt und verschiedenen Projekten zugeordnet werden.
      const pos: ParsedPosition[] = Array.isArray(parsed.positionen)
        ? parsed.positionen.filter((p: any) => p && (p.beschreibung || p.betrag_netto != null || p.betrag_brutto != null))
        : [];
      setPositionen(pos);
      setPosProjekte({});
      setPosSelected(new Set());

      toast({
        title: "KI-Scan erfolgreich",
        description: parsed.betrag_brutto
          ? `Brutto € ${Number(parsed.betrag_brutto).toFixed(2)} · Bitte prüfen`
          : "Daten wurden übernommen — bitte prüfen",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "KI-Scan fehlgeschlagen", description: err.message });
    } finally {
      setScanning(false);
    }
  };

  // Netto einer Position: bevorzugt extrahiertes Netto, sonst Brutto
  // über den USt-Satz der Rechnung zurückrechnen (Fallback 20% → /1,2).
  const positionNetto = (p: ParsedPosition): number | null => {
    if (p.betrag_netto != null && Number.isFinite(p.betrag_netto)) return p.betrag_netto;
    if (p.betrag_brutto != null && Number.isFinite(p.betrag_brutto)) {
      const ust = parseFloat(form.ust_satz);
      const satz = Number.isFinite(ust) && ust >= 0 ? ust : 20;
      return Math.round((p.betrag_brutto / (1 + satz / 100)) * 100) / 100;
    }
    return null;
  };

  // Netto-Gesamtbetrag der Rechnung (für "Zugeordnet X von Y (Rest Z)")
  const invoiceNetto = (): number => {
    const n = parseFloat(form.betrag_netto);
    if (Number.isFinite(n) && n > 0) return n;
    const b = parseFloat(form.betrag_brutto);
    const ust = parseFloat(form.ust_satz);
    if (Number.isFinite(b) && b > 0) return b / (1 + (Number.isFinite(ust) ? ust : 20) / 100);
    return 0;
  };

  const zugeordnetSumme = positionen.reduce((s, p, idx) => {
    if (!posProjekte[idx]) return s;
    return s + (positionNetto(p) || 0);
  }, 0);

  const togglePosSelected = (idx: number) => {
    setPosSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  /** Position manuell korrigieren (Beschreibung/Netto-Betrag). */
  const updatePosition = (idx: number, patch: Partial<ParsedPosition>) => {
    setPositionen(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  /** Position entfernen — Index-basierte Auswahl/Zuordnung mitverschieben. */
  const removePosition = (idx: number) => {
    setPositionen(prev => prev.filter((_, i) => i !== idx));
    setPosProjekte(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < idx) next[i] = v;
        else if (i > idx) next[i - 1] = v;
      });
      return next;
    });
    setPosSelected(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  };

  /** Manuell eine Position ergänzen (falls die KI etwas nicht erkannt hat). */
  const addPosition = () => {
    setPositionen(prev => [...prev, { beschreibung: "", betrag_netto: null, betrag_brutto: null }]);
  };

  const assignBulk = () => {
    if (!bulkProject || posSelected.size === 0) return;
    setPosProjekte(prev => {
      const next = { ...prev };
      posSelected.forEach(idx => { next[idx] = bulkProject; });
      return next;
    });
    setPosSelected(new Set());
  };

  const handleSave = async () => {
    if (files.length === 0) {
      toast({ variant: "destructive", title: "Datei fehlt", description: "Bitte mindestens eine Datei hochladen" });
      return;
    }
    if (!form.lieferant.trim()) {
      toast({ variant: "destructive", title: "Lieferant fehlt", description: "Bitte Lieferant eingeben" });
      return;
    }
    if (!form.betrag_brutto || parseFloat(form.betrag_brutto) <= 0) {
      toast({ variant: "destructive", title: "Betrag fehlt", description: "Bitte Bruttobetrag eingeben" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      for (const [fileIdx, file] of files.entries()) {
        // 1. Create DB entry
        const brutto = parseFloat(form.betrag_brutto);
        const ust = parseFloat(form.ust_satz);
        // Netto: manuelle Eingabe wenn gültig, sonst aus Brutto+USt ableiten
        // (Nachkalkulation rechnet mit betrag_netto — darf nie fehlen/negativ sein).
        const nettoInput = parseFloat(form.betrag_netto);
        const netto = Number.isFinite(nettoInput) && nettoInput > 0
          ? nettoInput
          : (brutto / (1 + ust / 100));

        const { data: inv, error } = await supabase
          .from("purchase_invoices")
          .insert({
            created_by: user.id,
            project_id: form.project_id || null,
            lieferant: form.lieferant.trim(),
            rechnungsnummer: form.rechnungsnummer.trim() || null,
            rechnungsdatum: form.rechnungsdatum || null,
            faellig_am: form.faellig_am || null,
            betrag_brutto: brutto,
            betrag_netto: parseFloat(netto.toFixed(2)),
            ust_satz: ust,
            kategorie: form.kategorie,
            zahlungsart: form.zahlungsart || null,
            status: form.status,
            notizen: form.notizen.trim() || null,
            file_name: file.name,
            mime_type: file.type,
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);

        // 2. Upload file — sanitize filename (keep extension, replace special chars)
        const safeName = file.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")           // remove diacritics
          .replace(/[^a-zA-Z0-9._-]/g, "_")          // replace anything else with _
          .replace(/_+/g, "_")                        // collapse multiple _
          .replace(/^_+|_+$/g, "");                   // trim leading/trailing _
        const finalName = safeName || `file_${Date.now()}.pdf`;
        const path = `${inv.id}/${finalName}`;
        const { error: upErr } = await supabase.storage
          .from("purchase-invoices")
          .upload(path, file, { upsert: true });

        if (upErr) {
          // Rollback: lösche leeres DB-Record bei Upload-Fehler
          await supabase.from("purchase_invoices").delete().eq("id", inv.id);
          throw new Error(upErr.message);
        }

        // 3. Update pdf_path + original filename + beleg_locked.
        // Der Beleg ist ab jetzt unveränderbar — kein Re-Upload, kein Delete
        // des Files ohne explizite Entsperrung durch Admin.
        await supabase.from("purchase_invoices").update({
          pdf_path: path,
          file_name: file.name,
          beleg_locked: true,
        } as any).eq("id", inv.id);

        // 4. Projekt-Aufteilung: zugeordnete KI-Positionen als allocations
        // speichern — nur für die erste (gescannte) Datei, die Positionen
        // stammen aus deren KI-Scan.
        if (fileIdx === 0) {
          const rows = positionen
            .map((p, idx) => ({ p, idx, projectId: posProjekte[idx] }))
            .filter(x => x.projectId)
            .map(x => ({
              purchase_invoice_id: inv.id,
              project_id: x.projectId,
              beschreibung: x.p.beschreibung || null,
              betrag_netto: Math.round((positionNetto(x.p) || 0) * 100) / 100,
              position_index: x.idx,
            }))
            .filter(r => r.betrag_netto > 0);
          // Sobald allocations existieren, ignoriert die Nachkalkulation den
          // Kopf-Betrag der Rechnung. Damit der nicht zugeordnete Rest weiter
          // zum Hauptprojekt zählt, wird er als eigene Teilbetrags-Zeile
          // auf das Hauptprojekt gebucht.
          if (rows.length > 0 && form.project_id) {
            const rowsSumme = rows.reduce((s, r) => s + r.betrag_netto, 0);
            const rest = Math.round((invoiceNetto() - rowsSumme) * 100) / 100;
            if (rest > 0.005) {
              rows.push({
                purchase_invoice_id: inv.id,
                project_id: form.project_id,
                beschreibung: "Restbetrag (Hauptprojekt)",
                betrag_netto: rest,
                position_index: null as any,
              });
            }
          }
          if (rows.length > 0) {
            const { error: allocErr } = await (supabase.from("purchase_invoice_allocations" as never) as any)
              .insert(rows);
            if (allocErr) {
              // Rechnung ist bereits gespeichert — Zuordnung kann im
              // Detail-Dialog nachgeholt werden, deshalb nur Warnung.
              toast({
                variant: "destructive",
                title: "Projekt-Zuordnung fehlgeschlagen",
                description: `Rechnung wurde gespeichert, aber die Positions-Zuordnung nicht: ${allocErr.message}`,
              });
            }
          }
        }
      }

      toast({ title: "Gespeichert", description: `${files.length} ${files.length === 1 ? "Rechnung" : "Rechnungen"} hochgeladen` });
      onUploaded();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Eingangsrechnung hochladen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Datei hier ablegen oder klicken</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG · Mehrfachauswahl möglich</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2 text-sm">
                  {f.type === "application/pdf"
                    ? <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    : <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                  }
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-muted"
                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Live-Preview der ersten Datei */}
          {previewUrl && files[0] && (
            <div className="rounded-lg border overflow-hidden bg-muted/20">
              {files[0].type === "application/pdf" ? (
                <iframe
                  src={previewUrl}
                  title={files[0].name}
                  className="w-full h-[420px] bg-white"
                />
              ) : files[0].type.startsWith("image/") ? (
                <img
                  src={previewUrl}
                  alt={files[0].name}
                  className="w-full max-h-[420px] object-contain bg-white"
                />
              ) : null}
            </div>
          )}

          {/* KI-Scan läuft automatisch beim Upload — Indikator + erneutes Scannen */}
          {files.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => scanFileWithAi(files[0])}
              disabled={scanning}
              className="w-full gap-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 hover:from-blue-100 hover:to-cyan-100"
            >
              {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> KI liest Rechnung...</> : <><Sparkles className="h-4 w-4 text-blue-600" /> Erneut mit KI scannen</>}
            </Button>
          )}

          {/* KI-Positionen: einzelne oder mehrere Positionen Projekten zuordnen */}
          {positionen.length > 0 && (
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Split className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Positionen auf Projekte aufteilen (optional)</Label>
                <Badge variant="outline" className="text-[10px] py-0 h-4">{positionen.length} erkannt</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Einzelne Positionen anhaken und gemeinsam einem Projekt zuordnen — oder je Position
                direkt ein Projekt wählen. Nicht zugeordnete Beträge zählen zum Hauptprojekt (unten).
              </p>

              {posSelected.size > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
                  <span className="text-xs whitespace-nowrap font-medium">{posSelected.size} ausgewählt</span>
                  <Select value={bulkProject || "none"} onValueChange={v => setBulkProject(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Projekt wählen...</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" className="h-8" onClick={assignBulk} disabled={!bulkProject}>
                    Auswahl zuordnen
                  </Button>
                </div>
              )}

              <div className="space-y-1 max-h-64 overflow-y-auto">
                {positionen.map((p, idx) => {
                  const netto = positionNetto(p);
                  const projId = posProjekte[idx] || "";
                  return (
                    <div key={idx} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                      <Checkbox
                        checked={posSelected.has(idx)}
                        onCheckedChange={() => togglePosSelected(idx)}
                        className="shrink-0"
                      />
                      <Input
                        value={p.beschreibung || ""}
                        onChange={e => updatePosition(idx, { beschreibung: e.target.value })}
                        placeholder={`Position ${idx + 1}`}
                        className="flex-1 min-w-0 h-7 text-xs"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number" step="0.01" inputMode="decimal"
                          value={netto != null ? netto : ""}
                          onChange={e => {
                            const n = parseFloat(e.target.value);
                            updatePosition(idx, { betrag_netto: Number.isFinite(n) ? n : null, betrag_brutto: null });
                          }}
                          placeholder="0.00"
                          className="h-7 w-24 text-xs text-right font-mono"
                        />
                        <span className="text-[10px] text-muted-foreground">€</span>
                      </div>
                      <Select
                        value={projId || "none"}
                        onValueChange={v => setPosProjekte(prev => {
                          const next = { ...prev };
                          if (v === "none") delete next[idx]; else next[idx] = v;
                          return next;
                        })}
                      >
                        <SelectTrigger className="h-7 w-[140px] text-xs shrink-0">
                          <SelectValue placeholder="Projekt" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Hauptprojekt —</SelectItem>
                          {projects.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        title="Position entfernen" onClick={() => removePosition(idx)}>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addPosition}>
                <Plus className="h-3.5 w-3.5" /> Position hinzufügen
              </Button>

              <div className={`text-xs pt-1 border-t ${invoiceNetto() - zugeordnetSumme < -0.005 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                Zugeordnet: <span className="font-mono tabular-nums">{eur(zugeordnetSumme)}</span> von{" "}
                <span className="font-mono tabular-nums">{eur(invoiceNetto())}</span>{" "}
                (Rest: <span className="font-mono tabular-nums">{eur(Math.round((invoiceNetto() - zugeordnetSumme) * 100) / 100)}</span>)
                {invoiceNetto() - zugeordnetSumme < -0.005 && " — mehr zugeordnet als Rechnungsbetrag!"}
              </div>
            </div>
          )}

          {/* Quick form */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="col-span-2">
              <Label>Lieferant *</Label>
              <Input value={form.lieferant} onChange={e => update("lieferant", e.target.value)} placeholder="z.B. Hornbach" />
            </div>
            <div>
              <Label>Rechnungsnummer</Label>
              <Input value={form.rechnungsnummer} onChange={e => update("rechnungsnummer", e.target.value)} />
            </div>
            <div>
              <Label>Rechnungsdatum</Label>
              <Input type="date" value={form.rechnungsdatum} onChange={e => update("rechnungsdatum", e.target.value)} />
            </div>
            <div>
              <Label>Betrag Brutto * (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.betrag_brutto}
                onChange={e => {
                  update("betrag_brutto", e.target.value);
                  update("betrag_netto", calcNetto(e.target.value, form.ust_satz));
                }}
              />
            </div>
            <div>
              <Label>Betrag Netto (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.betrag_netto}
                onChange={e => update("betrag_netto", e.target.value)}
                placeholder="auto aus Brutto"
              />
            </div>
            <div>
              <Label>USt-Satz (%)</Label>
              <Select value={form.ust_satz} onValueChange={v => {
                update("ust_satz", v);
                update("betrag_netto", calcNetto(form.betrag_brutto, v));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                  <SelectItem value="13">13%</SelectItem>
                  <SelectItem value="20">20%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategorie</Label>
              <Select value={form.kategorie} onValueChange={v => update("kategorie", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kategorien.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{positionen.length > 0 ? "Hauptprojekt (Rest)" : "Projekt (optional)"}</Label>
              <Select value={form.project_id || "none"} onValueChange={v => update("project_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Projekt</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offen">Offen</SelectItem>
                  <SelectItem value="bezahlt">Bezahlt</SelectItem>
                  <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fällig am</Label>
              <Input type="date" value={form.faellig_am} onChange={e => update("faellig_am", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Notizen</Label>
              <Textarea value={form.notizen} onChange={e => update("notizen", e.target.value)} rows={2} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichert...</> : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
