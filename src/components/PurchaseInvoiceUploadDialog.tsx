import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, X, FileText, Image as ImageIcon, Loader2, Sparkles, Split, Plus, Camera, Percent, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseDecimal, toNumber, clamp, formatForInput } from "@/lib/num";

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
  // Neu (präzise Extraktion): Menge, Einheit und rabattierter Einzelpreis
  // je Zeile — für die Anzeige und spätere Projektzuordnung.
  menge?: number | null;
  einheit?: string | null;
  einzelpreis_netto?: number | null;
};

const eur = (n: number) => `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rabattbetrag (in €) aus Bruttobetrag + Eingabe berechnen.
 * typ "prozent" → Anteil vom Brutto, typ "euro" → Fixbetrag.
 * Ergebnis ist nie negativ und nie größer als der Bruttobetrag.
 */
function rabattEuro(brutto: number, wert: string, typ: "prozent" | "euro"): number {
  const w = parseDecimal(wert);
  if (w === null || w <= 0 || !Number.isFinite(brutto) || brutto <= 0) return 0;
  const betrag = typ === "prozent" ? (brutto * w) / 100 : w;
  return round2(Math.min(Math.max(betrag, 0), brutto));
}

/** Größe eines data:-URLs in Bytes (base64 → roh). */
const dataUrlBytes = (d: string) => Math.ceil(((d.length - (d.indexOf(",") + 1)) * 3) / 4);
// Supabase-Edge-Function nimmt max. 6 MB Body. Wir bleiben mit Puffer darunter,
// weil das JSON-Envelope noch dazukommt.
const MAX_SCAN_PAYLOAD = 4_200_000;

export function PurchaseInvoiceUploadDialog({ open, onOpenChange, onUploaded, prefillProjectId, initialFile }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [kategorien, setKategorien] = useState<{ value: string; label: string }[]>(FALLBACK_KATEGORIEN);
  // KI-extrahierte Positionen + Projekt-Zuordnung je Position (index → project_id)
  const [positionen, setPositionen] = useState<ParsedPosition[]>([]);
  // Rohtext der Positions-Betragsfelder (nur während des Tippens gesetzt) —
  // sonst würde „12," beim Neurendern sofort zu „12" umformatiert.
  const [posText, setPosText] = useState<Record<number, string>>({});
  const [posProjekte, setPosProjekte] = useState<Record<number, string>>({});
  const [posSelected, setPosSelected] = useState<Set<number>>(new Set());
  const [bulkProject, setBulkProject] = useState("");
  // Rabatt/Skonto auf den Rechnungsbetrag (kein eigenes DB-Feld → wird beim
  // Speichern in Brutto/Netto eingerechnet und als Notiz dokumentiert).
  const [rabattTyp, setRabattTyp] = useState<"prozent" | "euro">("prozent");
  const [rabattWert, setRabattWert] = useState("");
  // Ergebnis des letzten KI-Scans: Warnungen der Function + Kurz-Zusammenfassung.
  // Wichtig: GPT erfindet bei unleserlichen Fotos gelegentlich Werte —
  // deshalb IMMER einen Prüf-Hinweis anzeigen, nie stillschweigend übernehmen.
  const [scanInfo, setScanInfo] = useState<{ lieferant: string; brutto: string; warnings: string[] } | null>(null);

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
      setPosText({});
      setPosProjekte({});
      setPosSelected(new Set());
      setBulkProject("");
      setRabattTyp("prozent");
      setRabattWert("");
      setScanInfo(null);
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

  // ── Rabatt / Skonto ────────────────────────────────────────────────────
  // "Betrag Brutto" = Betrag laut Rechnung (vor Rabatt). Der zu zahlende
  // Betrag ergibt sich daraus abzüglich Rabatt; Netto wird davon abgeleitet.
  const bruttoLtRechnung = toNumber(form.betrag_brutto, 0);
  const rabattBetrag = rabattEuro(bruttoLtRechnung, rabattWert, rabattTyp);
  const zahlBrutto = round2(Math.max(0, bruttoLtRechnung - rabattBetrag));

  /** Netto aus Brutto (nach Rabatt) und USt-Satz — zentral für alle Felder. */
  const calcNetto = (brutto: string, ust: string, rWert = rabattWert, rTyp = rabattTyp) => {
    const b = parseDecimal(brutto);
    const u = parseDecimal(ust);
    if (b === null || u === null) return "";
    const zahl = Math.max(0, b - rabattEuro(b, rWert, rTyp));
    return (zahl / (1 + u / 100)).toFixed(2).replace(".", ",");
  };

  /**
   * Obergrenze für das Netto: Netto kann den Zahlbetrag brutto niemals
   * übersteigen (USt >= 0). Ohne diese Klemme war „Netto 1.200 / Brutto 10"
   * speicherbar → Nachkalkulation um Faktor 120 falsch.
   */
  const nettoObergrenze = (): number => zahlBrutto;

  /** Aus dem Brutto abgeleitetes Netto (Fallback + Referenzwert). */
  const nettoAusBrutto = (): number => {
    const u = parseDecimal(form.ust_satz);
    const satz = u !== null && u >= 0 ? u : 20;
    return round2(zahlBrutto / (1 + satz / 100));
  };

  /** true, sobald das frei editierbare Netto-Feld über dem Brutto liegt. */
  const nettoUeberBrutto = (): boolean => {
    const n = parseDecimal(form.betrag_netto);
    return n !== null && zahlBrutto > 0 && n - nettoObergrenze() > 0.005;
  };

  /** Rabatt ändern → Netto sofort nachziehen (der Chef sieht das Ergebnis live). */
  const setRabatt = (wert: string, typ: "prozent" | "euro") => {
    setRabattWert(wert);
    setRabattTyp(typ);
    const netto = calcNetto(form.betrag_brutto, form.ust_satz, wert, typ);
    if (netto !== "") setForm(prev => ({ ...prev, betrag_netto: netto }));
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
  // guter Kompromiss und bleibt normalerweise unter 2 MB.
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

  /**
   * Foto so weit verkleinern, dass es sicher unter dem Body-Limit der
   * Edge-Function bleibt (Handy-Kamera liefert 5-12 MB / 4000px+).
   */
  const compressImageToLimit = async (file: File): Promise<string> => {
    let dim = 2400;
    let quality = 0.92;
    let out = await compressImage(file, dim, quality);
    while (dataUrlBytes(out) > MAX_SCAN_PAYLOAD && dim > 900) {
      dim = Math.round(dim * 0.75);
      quality = Math.max(0.6, quality - 0.1);
      out = await compressImage(file, dim, quality);
    }
    return out;
  };

  // KI-Scan: Rechnungsdaten aus einer Datei extrahieren und Form vorausfüllen.
  // Funktioniert mit Bildern (direkt) UND PDFs (alle Seiten → JPEG-Rendering).
  const scanFileWithAi = async (file: File) => {
    setScanning(true);
    setScanInfo(null);
    try {
      // BEVORZUGT: der TEXTLAYER aller PDF-Seiten (pdfjs getTextContent) —
      // Zahlen, Rabatte und Mengen kommen damit 1:1 aus dem PDF statt über
      // fehleranfälliges OCR gerenderter Bilder. Nur Scans ohne Textlayer
      // fallen auf den Bild-Pfad zurück.
      let pdfText = "";
      let imagesBase64: string[] = [];

      if (file.type === "application/pdf") {
        try {
          const data = new Uint8Array(await file.arrayBuffer());
          const pdfjs = await import("pdfjs-dist");
          const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
          const pdf = await pdfjs.getDocument({ data }).promise;
          const teile: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            const seitentext = (tc.items as any[])
              .map((it) => (typeof it?.str === "string" ? it.str : ""))
              .join(" ");
            teile.push(`--- Seite ${i} ---\n${seitentext}`);
          }
          const voll = teile.join("\n\n").trim();
          // Scans haben (fast) keinen Textlayer — dann lieber Bilder schicken.
          if (voll.replace(/--- Seite \d+ ---/g, "").trim().length > 200) {
            pdfText = voll;
          }
        } catch (e) {
          console.warn("PDF-Textlayer-Extraktion fehlgeschlagen — Bild-Fallback:", e);
        }
      }

      if (!pdfText && file.type === "application/pdf") {
        const { pdfAllPagesToJpegDataUrls } = await import("@/lib/pdfToImage");
        imagesBase64 = await pdfAllPagesToJpegDataUrls(file);
        // Mehrseitige Scans sprengen sonst das 6-MB-Body-Limit der Function.
        const total = (arr: string[]) => arr.reduce((s, d) => s + dataUrlBytes(d), 0);
        if (total(imagesBase64) > MAX_SCAN_PAYLOAD) {
          imagesBase64 = await pdfAllPagesToJpegDataUrls(file, 1100, 0.72, 6);
        }
        if (total(imagesBase64) > MAX_SCAN_PAYLOAD) {
          imagesBase64 = await pdfAllPagesToJpegDataUrls(file, 1000, 0.6, 3);
        }
      } else if (file.type.startsWith("image/")) {
        // Fotos/Scans: auf max 2400px/92% runterrechnen, bei Bedarf weiter.
        try {
          imagesBase64 = [await compressImageToLimit(file)];
        } catch (compressErr) {
          console.warn("Compression failed, using original:", compressErr);
          const raw = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          if (dataUrlBytes(raw) > MAX_SCAN_PAYLOAD) {
            throw new Error("Foto ist zu groß für den KI-Scan — bitte mit geringerer Auflösung fotografieren. Die Rechnung kann trotzdem manuell erfasst werden.");
          }
          imagesBase64 = [raw];
        }
      } else if (!pdfText) {
        // Weder PDF (mit oder ohne Textlayer) noch Bild → nichts zu scannen.
        setScanning(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("parse-invoice-document", {
        // pdfText (Textlayer aller Seiten) bevorzugt — präziseste Extraktion;
        // sonst imagesBase64 (mehrere Seiten) bzw. imageBase64 (Einzelbild).
        body: pdfText
          ? { pdfText }
          : imagesBase64.length > 1
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
        // Anzeige in österreichischer Schreibweise (Komma) — parseDecimal
        // liest beide Formate wieder ein.
        betrag_brutto: parsed.betrag_brutto ? formatForInput(Number(parsed.betrag_brutto)) : prev.betrag_brutto,
        betrag_netto: parsed.betrag_netto ? formatForInput(Number(parsed.betrag_netto)) : prev.betrag_netto,
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
      setPosText({});
      setPosProjekte({});
      setPosSelected(new Set());

      setScanInfo({
        lieferant: parsed.lieferant || "",
        brutto: parsed.betrag_brutto != null ? String(parsed.betrag_brutto) : "",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      });

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
      const ust = parseDecimal(form.ust_satz);
      const satz = ust !== null && ust >= 0 ? ust : 20;
      return round2(p.betrag_brutto / (1 + satz / 100));
    }
    return null;
  };

  // Netto-Gesamtbetrag der Rechnung NACH Rabatt (für "Zugeordnet X von Y").
  //
  // WICHTIG: Das Netto-Feld ist frei editierbar. Wird die Zuordnungsgrenze
  // allein daraus abgeleitet, kann man durch Hochsetzen des Netto-Feldes
  // beliebig viel auf Projekte buchen. Deshalb ist der tatsächliche
  // Rechnungsbetrag (Brutto nach Rabatt) die harte Obergrenze.
  const invoiceNetto = (): number => {
    const n = parseDecimal(form.betrag_netto);
    if (n !== null && n > 0) return Math.min(n, nettoObergrenze() || n);
    if (zahlBrutto > 0) return nettoAusBrutto();
    return 0;
  };

  const zugeordnetSumme = positionen.reduce((s, p, idx) => {
    if (!posProjekte[idx]) return s;
    return s + (positionNetto(p) || 0);
  }, 0);

  const positionenSumme = positionen.reduce((s, p) => s + (positionNetto(p) || 0), 0);
  // Positionen passen nicht zum Rechnungsbetrag (typisch bei Rabatt/Skonto
  // "oben drauf": die Zeilen summieren auf den Betrag VOR Abzug).
  const positionenAbweichung = round2(positionenSumme - invoiceNetto());
  const zeigeAngleich = positionen.length > 0 && invoiceNetto() > 0 && positionenSumme > 0 && Math.abs(positionenAbweichung) > 0.02;

  /** Alle Positionen anteilig so kürzen/erhöhen, dass sie den Rechnungsnetto ergeben. */
  const scalePositionen = () => {
    const ziel = invoiceNetto();
    if (!(ziel > 0) || !(positionenSumme > 0)) return;
    const f = ziel / positionenSumme;
    setPosText({});
    setPositionen(prev => prev.map(p => ({
      beschreibung: p.beschreibung,
      betrag_netto: round2((positionNetto(p) || 0) * f),
      betrag_brutto: null,
    })));
    toast({ title: "Positionen angeglichen", description: `Alle Positionen anteilig auf ${eur(ziel)} netto gekürzt.` });
  };

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
    setPosText({});
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
      toast({ variant: "destructive", title: "Datei fehlt", description: "Bitte ein Foto aufnehmen oder eine Datei wählen" });
      return;
    }
    if (!form.lieferant.trim()) {
      toast({ variant: "destructive", title: "Lieferant fehlt", description: "Bitte Lieferant eingeben" });
      return;
    }
    if (bruttoLtRechnung <= 0) {
      toast({ variant: "destructive", title: "Betrag fehlt", description: "Bitte Bruttobetrag eingeben" });
      return;
    }
    if (zahlBrutto <= 0) {
      toast({ variant: "destructive", title: "Rabatt zu hoch", description: "Nach Abzug des Rabatts bleibt kein Zahlbetrag übrig." });
      return;
    }
    // Netto darf den Zahlbetrag brutto nicht übersteigen. Vorher war
    // „Netto 1.200 bei Brutto 10" speicherbar → Nachkalkulation komplett falsch.
    if (nettoUeberBrutto()) {
      toast({
        variant: "destructive",
        title: "Netto größer als Brutto",
        description: `Das Netto (${eur(toNumber(form.betrag_netto, 0))}) kann nicht größer sein als der Bruttobetrag (${eur(zahlBrutto)}). Es wurde auf ${eur(nettoAusBrutto())} korrigiert — bitte prüfen und erneut speichern.`,
        duration: 9000,
      });
      update("betrag_netto", formatForInput(nettoAusBrutto(), 2));
      return;
    }
    // Überzuordnung blockieren — sonst tauchen in der Nachkalkulation mehr
    // Fremdkosten auf, als die Rechnung überhaupt hergibt. Geprüft wird
    // gegen den tatsächlichen Rechnungsbetrag (Brutto nach Rabatt), NICHT
    // gegen das frei editierbare Netto-Feld.
    if (zugeordnetSumme - invoiceNetto() > 0.01) {
      toast({
        variant: "destructive",
        title: "Zu viel zugeordnet",
        description: `Den Projekten sind ${eur(zugeordnetSumme)} zugeordnet, die Rechnung hat aber nur ${eur(invoiceNetto())} netto (${eur(zahlBrutto)} brutto). Bitte die Positionsbeträge korrigieren.`,
        duration: 9000,
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Rabatt/Skonto ist (noch) kein eigenes DB-Feld → als Notiz dokumentieren,
      // damit im Detail nachvollziehbar bleibt, warum der Betrag niedriger ist.
      const rabattNotiz = rabattBetrag > 0
        ? `Rabatt/Skonto: ${rabattTyp === "prozent" ? `${rabattWert} %` : eur(rabattBetrag)} auf ${eur(bruttoLtRechnung)} = −${eur(rabattBetrag)} → Zahlbetrag ${eur(zahlBrutto)} brutto`
        : "";
      const notizenFinal = [form.notizen.trim(), rabattNotiz].filter(Boolean).join("\n") || null;

      for (const [fileIdx, file] of files.entries()) {
        // 1. Create DB entry
        const ust = toNumber(form.ust_satz, 20);
        // Brutto = Zahlbetrag NACH Rabatt (das ist der Betrag, der wirklich
        // gezahlt und in der Nachkalkulation verrechnet wird).
        const brutto = zahlBrutto;
        // Netto: manuelle Eingabe wenn gültig, sonst aus Brutto+USt ableiten
        // (Nachkalkulation rechnet mit betrag_netto — darf nie fehlen/negativ
        // sein und nie über dem Brutto liegen).
        const nettoInput = parseDecimal(form.betrag_netto);
        const netto = nettoInput !== null && nettoInput > 0
          ? clamp(nettoInput, 0, brutto)
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
            notizen: notizenFinal,
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
              betrag_netto: round2(positionNetto(x.p) || 0),
              position_index: x.idx,
            }))
            .filter(r => r.betrag_netto > 0);
          // Sobald allocations existieren, ignoriert die Nachkalkulation den
          // Kopf-Betrag der Rechnung. Damit der nicht zugeordnete Rest weiter
          // zum Hauptprojekt zählt, wird er als eigene Teilbetrags-Zeile
          // auf das Hauptprojekt gebucht.
          if (rows.length > 0 && form.project_id) {
            const rowsSumme = rows.reduce((s, r) => s + r.betrag_netto, 0);
            const rest = round2(invoiceNetto() - rowsSumme);
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
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 text-base sm:text-lg">
            <Upload className="h-5 w-5 shrink-0" />
            Eingangsrechnung hochladen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Aufnahme-Aktionen — am Handy die wichtigste Funktion: Foto machen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="h-14 gap-2 text-base font-semibold"
            >
              <Camera className="h-6 w-6" />
              Foto aufnehmen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-14 gap-2 text-base font-semibold"
            >
              <Upload className="h-5 w-5" />
              Datei wählen
            </Button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid="camera-input-dialog"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFiles([f]);
              if (cameraInputRef.current) cameraInputRef.current.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />

          {/* Dropzone (Desktop: Drag & Drop) */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`hidden sm:block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-medium">Datei hier ablegen oder klicken</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG · Mehrfachauswahl möglich</p>
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
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded hover:bg-muted"
                    aria-label="Datei entfernen"
                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {files.length > 1 && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  Es werden {files.length} eigene Rechnungen mit den unten eingetragenen Daten
                  (Lieferant, Betrag …) angelegt. Für unterschiedliche Beträge bitte einzeln hochladen.
                </p>
              )}
            </div>
          )}

          {/* Live-Preview der ersten Datei */}
          {previewUrl && files[0] && (
            <div className="rounded-lg border overflow-hidden bg-muted/20">
              {files[0].type === "application/pdf" ? (
                <iframe
                  src={previewUrl}
                  title={files[0].name}
                  className="w-full h-[260px] sm:h-[420px] bg-white"
                />
              ) : files[0].type.startsWith("image/") ? (
                <img
                  src={previewUrl}
                  alt={files[0].name}
                  className="w-full max-h-[260px] sm:max-h-[420px] object-contain bg-white"
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
              className="w-full h-11 gap-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 hover:from-blue-100 hover:to-cyan-100"
            >
              {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> KI liest Rechnung...</> : <><Sparkles className="h-4 w-4 text-blue-600" /> Erneut mit KI scannen</>}
            </Button>
          )}

          {/* Nach jedem KI-Scan: expliziter Prüf-Hinweis. GPT kann bei
              unscharfen/leeren Fotos Werte erfinden — der Chef muss das sehen. */}
          {scanInfo && !scanning && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-1" data-testid="scan-hinweis">
              <p className="flex items-start gap-1.5 text-xs font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                KI-Vorschlag — bitte mit dem Beleg vergleichen
              </p>
              <p className="text-[11px] text-amber-800">
                Erkannt: <span className="font-medium">{scanInfo.lieferant || "kein Lieferant"}</span>
                {scanInfo.brutto ? <> · Brutto <span className="font-mono">{eur(Number(scanInfo.brutto))}</span></> : " · kein Betrag erkannt"}
              </p>
              {scanInfo.warnings.length > 0 && (
                <ul className="list-disc pl-4 text-[11px] text-amber-800">
                  {scanInfo.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Positionen: einzelne oder mehrere Positionen Projekten zuordnen.
              Wird auch ohne KI-Treffer angezeigt, damit man von Hand aufteilen kann. */}
          {files.length > 0 && (
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Split className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Positionen auf Projekte aufteilen (optional)</Label>
                {positionen.length > 0 && (
                  <Badge variant="outline" className="text-[10px] py-0 h-4">{positionen.length} erkannt</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Einzelne Positionen anhaken und gemeinsam einem Projekt zuordnen — oder je Position
                direkt ein Projekt wählen. Nicht zugeordnete Beträge zählen zum Hauptprojekt (unten).
              </p>

              {zeigeAngleich && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-2 space-y-1.5">
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    Die Positionen ergeben {eur(positionenSumme)} netto, die Rechnung aber {eur(invoiceNetto())}
                    {rabattBetrag > 0 ? " (nach Rabatt)" : ""} — Differenz {eur(positionenAbweichung)}.
                  </p>
                  <Button type="button" size="sm" variant="outline" className="h-11 text-xs w-full sm:w-auto" onClick={scalePositionen}>
                    Positionen anteilig auf Rechnungsbetrag angleichen
                  </Button>
                </div>
              )}

              {posSelected.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
                  <span className="text-xs whitespace-nowrap font-medium">{posSelected.size} ausgewählt</span>
                  <Select value={bulkProject || "none"} onValueChange={v => setBulkProject(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-11 text-xs flex-1 min-w-[8rem]"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Projekt wählen...</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" className="h-11" onClick={assignBulk} disabled={!bulkProject}>
                    Auswahl zuordnen
                  </Button>
                </div>
              )}

              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {positionen.map((p, idx) => {
                  const netto = positionNetto(p);
                  const projId = posProjekte[idx] || "";
                  return (
                    <div key={idx} data-testid={`pos-row-${idx}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-2">
                      {/* 44px-Tap-Ziel um die Checkbox — am Handy sonst kaum treffbar. */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={posSelected.has(idx)}
                        aria-label={`Position ${idx + 1} auswählen`}
                        onClick={() => togglePosSelected(idx)}
                        className="flex h-11 w-9 shrink-0 items-center justify-center rounded hover:bg-muted"
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                          posSelected.has(idx) ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        }`}>
                          {posSelected.has(idx) && <Check className="h-4 w-4" />}
                        </span>
                      </button>
                      <div className="min-w-[7rem] flex-1">
                        <Input
                          value={p.beschreibung || ""}
                          onChange={e => updatePosition(idx, { beschreibung: e.target.value })}
                          placeholder={`Position ${idx + 1}`}
                          className="h-11 text-xs"
                        />
                        {/* Menge × Einheit à Einzelpreis (rabattiert) — aus der
                            präzisen Extraktion; nur anzeigen, wenn vorhanden. */}
                        {(p.menge != null || p.einzelpreis_netto != null) && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                            {p.menge != null ? `${p.menge.toLocaleString("de-AT")} ${p.einheit || ""}`.trim() : ""}
                            {p.menge != null && p.einzelpreis_netto != null ? " à " : ""}
                            {p.einzelpreis_netto != null ? `€ ${p.einzelpreis_netto.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : ""}
                          </p>
                        )}
                      </div>
                      <Input
                        type="text" inputMode="decimal"
                        // Rohtext während des Tippens stehen lassen, damit
                        // „12,50" eingebbar bleibt; Zahlenwert läuft parallel mit.
                        value={posText[idx] ?? (netto != null ? formatForInput(netto) : "")}
                        onChange={e => {
                          const roh = e.target.value;
                          setPosText(prev => ({ ...prev, [idx]: roh }));
                          updatePosition(idx, { betrag_netto: parseDecimal(roh), betrag_brutto: null });
                        }}
                        onBlur={() => {
                          const n = parseDecimal(posText[idx] ?? "");
                          setPosText(prev => {
                            const next = { ...prev };
                            delete next[idx];
                            return next;
                          });
                          if (n !== null) updatePosition(idx, { betrag_netto: round2(n), betrag_brutto: null });
                        }}
                        placeholder="0,00"
                        aria-label={`Netto Position ${idx + 1}`}
                        className="h-11 w-24 shrink-0 text-xs text-right font-mono"
                      />
                      <Select
                        value={projId || "none"}
                        onValueChange={v => setPosProjekte(prev => {
                          const next = { ...prev };
                          if (v === "none") delete next[idx]; else next[idx] = v;
                          return next;
                        })}
                      >
                        <SelectTrigger data-testid={`pos-projekt-${idx}`} className="h-11 flex-1 min-w-[8rem] text-xs">
                          <SelectValue placeholder="Projekt" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Hauptprojekt —</SelectItem>
                          {projects.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                        title="Position entfernen" aria-label={`Position ${idx + 1} entfernen`} onClick={() => removePosition(idx)}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button type="button" variant="outline" size="sm" className="h-11 gap-1 text-xs" onClick={addPosition}>
                <Plus className="h-4 w-4" /> Position hinzufügen
              </Button>

              <div className={`text-xs pt-1 border-t ${zugeordnetSumme - invoiceNetto() > 0.005 ? "text-destructive font-medium" : "text-muted-foreground"}`} data-testid="zuordnung-summe">
                Zugeordnet: <span className="font-mono tabular-nums">{eur(zugeordnetSumme)}</span> von{" "}
                <span className="font-mono tabular-nums">{eur(invoiceNetto())}</span>{" "}
                (Rest: <span className="font-mono tabular-nums">{eur(round2(invoiceNetto() - zugeordnetSumme))}</span>)
                {zugeordnetSumme - invoiceNetto() > 0.005 && " — mehr zugeordnet als Rechnungsbetrag!"}
              </div>
            </div>
          )}

          {/* Quick form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
            <div className="sm:col-span-2">
              <Label>Lieferant *</Label>
              <Input data-testid="up-lieferant" value={form.lieferant} onChange={e => update("lieferant", e.target.value)} placeholder="z.B. Hornbach" />
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
                data-testid="up-brutto"
                type="text"
                inputMode="decimal"
                value={form.betrag_brutto}
                onChange={e => {
                  // Rohtext beibehalten, Netto live nachziehen.
                  update("betrag_brutto", e.target.value);
                  const netto = calcNetto(e.target.value, form.ust_satz);
                  if (netto !== "") update("betrag_netto", netto);
                }}
                onBlur={() => {
                  const n = parseDecimal(form.betrag_brutto);
                  if (n === null) return;
                  update("betrag_brutto", formatForInput(round2(Math.max(0, n)), 2));
                }}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Betrag laut Rechnung (vor Rabatt)</p>
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

            {/* Rabatt / Skonto — wirkt direkt auf den Zahlbetrag */}
            <div className="sm:col-span-2 rounded-lg border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Rabatt / Skonto (optional)</Label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Rabatt"
                  value={rabattWert}
                  onChange={e => setRabatt(e.target.value, rabattTyp)}
                  className="h-10 w-24 shrink-0 text-right font-mono"
                />
                <Select value={rabattTyp} onValueChange={(v: any) => setRabatt(rabattWert, v)}>
                  <SelectTrigger className="h-10 w-24 shrink-0" aria-label="Rabatt-Art"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prozent">%</SelectItem>
                    <SelectItem value="euro">€</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-1.5">
                  {["2", "3"].map(p => (
                    <Button key={p} type="button" variant="outline" size="sm" className="h-10 px-2 text-xs"
                      onClick={() => setRabatt(p, "prozent")}>
                      {p} % Skonto
                    </Button>
                  ))}
                  {(rabattWert !== "" && rabattWert !== "0") && (
                    <Button type="button" variant="ghost" size="sm" className="h-10 px-2 text-xs"
                      onClick={() => setRabatt("", rabattTyp)}>
                      Zurücksetzen
                    </Button>
                  )}
                </div>
              </div>
              {rabattBetrag > 0 && (
                <div className="text-xs space-y-0.5 rounded-md bg-background border px-2 py-1.5" data-testid="rabatt-info">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Brutto lt. Rechnung</span>
                    <span className="font-mono tabular-nums">{eur(bruttoLtRechnung)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-orange-700">
                    <span>− Rabatt {rabattTyp === "prozent" ? `${rabattWert} %` : ""}</span>
                    <span className="font-mono tabular-nums">− {eur(rabattBetrag)}</span>
                  </div>
                  <div className="flex justify-between gap-2 font-semibold border-t pt-0.5">
                    <span>= Zahlbetrag brutto</span>
                    <span className="font-mono tabular-nums">{eur(zahlBrutto)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-muted-foreground">
                    <span>davon netto</span>
                    <span className="font-mono tabular-nums">{eur(invoiceNetto())}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label>Betrag Netto (€)</Label>
              <Input
                data-testid="up-netto"
                type="text"
                inputMode="decimal"
                value={form.betrag_netto}
                onChange={e => update("betrag_netto", e.target.value)}
                onBlur={() => {
                  // Leer → aus Brutto/USt ableiten. Größer als Brutto →
                  // klemmen (Netto kann nie über dem Bruttobetrag liegen).
                  if (!form.betrag_netto.trim()) {
                    if (zahlBrutto > 0) update("betrag_netto", formatForInput(nettoAusBrutto(), 2));
                    return;
                  }
                  const n = parseDecimal(form.betrag_netto);
                  if (n === null) {
                    if (zahlBrutto > 0) update("betrag_netto", formatForInput(nettoAusBrutto(), 2));
                    return;
                  }
                  if (zahlBrutto > 0 && n - nettoObergrenze() > 0.005) {
                    update("betrag_netto", formatForInput(nettoAusBrutto(), 2));
                    toast({
                      variant: "destructive",
                      title: "Netto größer als Brutto",
                      description: `Netto ${eur(n)} ist größer als der Bruttobetrag ${eur(zahlBrutto)} — korrigiert auf ${eur(nettoAusBrutto())}.`,
                      duration: 7000,
                    });
                    return;
                  }
                  update("betrag_netto", formatForInput(round2(Math.max(0, n)), 2));
                }}
                placeholder="auto aus Brutto"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Zahlbetrag netto (nach Rabatt)</p>
              {nettoUeberBrutto() && (
                <p className="text-[11px] font-medium text-destructive mt-0.5" data-testid="up-netto-warnung">
                  Netto darf nicht größer sein als Brutto ({eur(zahlBrutto)}).
                </p>
              )}
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
                <SelectTrigger data-testid="up-hauptprojekt"><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
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
            <div className="sm:col-span-2">
              <Label>Notizen</Label>
              <Textarea value={form.notizen} onChange={e => update("notizen", e.target.value)} rows={2} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-11" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichert...</> : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
