import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Check, X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";
import { parseDecimal, toNumber, formatForInput } from "@/lib/num";

interface ParsedMaterial {
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  /** Roh-Eingabe des Preisfeldes (deutsches Komma erlaubt). */
  preisInput: string;
  selected: boolean;
}

interface MaterialFileImportProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Einheiten-Schreibweisen aus Preislisten auf die App-Einheiten mappen.
 * Die KI liefert z. B. "m2", "Stk", "Pkg." — ohne Normalisierung stand im
 * Select nichts drin und der Anwender sah ein leeres Feld.
 */
const EINHEIT_ALIAS: Record<string, string> = {
  "stk": "Stk.", "stk.": "Stk.", "stück": "Stk.", "stueck": "Stk.", "st": "Stk.", "pcs": "Stk.",
  "m2": "m²", "qm": "m²", "m^2": "m²", "quadratmeter": "m²",
  "m3": "m³", "fm": "m³", "kubikmeter": "m³",
  "lfm": "lfm", "m": "lfm", "lm": "lfm", "laufmeter": "lfm",
  "h": "Std.", "std": "Std.", "std.": "Std.", "stunde": "Std.", "stunden": "Std.",
  "kg": "kg", "l": "Liter", "ltr": "Liter", "liter": "Liter",
  "pkg": "Pkg.", "pkg.": "Pkg.", "paket": "Pkg.", "pack": "Pkg.",
  "sack": "Sack", "eimer": "Eimer", "rolle": "Rolle", "dose": "Dose",
  "karton": "Karton", "palette": "Palette", "psch": "Pauschal", "pauschale": "Pauschal",
};

function normalizeEinheit(raw: string | undefined | null, bekannt: string[]): string {
  const s = (raw || "").trim();
  if (!s) return bekannt[0] || "Stk.";
  const treffer = bekannt.find(e => e.toLowerCase() === s.toLowerCase());
  if (treffer) return treffer;
  const alias = EINHEIT_ALIAS[s.toLowerCase()];
  if (alias) {
    const t2 = bekannt.find(e => e.toLowerCase() === alias.toLowerCase());
    if (t2) return t2;
    return alias;
  }
  return s; // unbekannt → unverändert lassen (wird als Extra-Option angeboten)
}

export function MaterialFileImport({ open, onClose, onImported }: MaterialFileImportProps) {
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState<ParsedMaterial[]>([]);
  const [fileName, setFileName] = useState("");
  /** Preisspalte der Datei: Lieferanten-Preislisten sind EK, eigene Listen VK. */
  const [preisArt, setPreisArt] = useState<"ek" | "vk">("ek");
  const [aufschlagInput, setAufschlagInput] = useState("0");
  const [kategorie, setKategorie] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setProcessing(true);
    setMaterials([]);

    try {
      let fileContent = "";
      const fileType = file.name.split(".").pop()?.toLowerCase() || "txt";

      if (fileType === "csv" || fileType === "txt") {
        fileContent = await file.text();
      } else if (fileType === "xlsx" || fileType === "xls") {
        // Eine .xlsx ist ein ZIP-Archiv — file.text() lieferte Binärmüll, die
        // KI konnte daraus nie etwas erkennen (der Dialog bot Excel aber an).
        // Jetzt wird die Mappe echt gelesen und als CSV weitergereicht.
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        fileContent = wb.SheetNames
          .map(n => `# Tabellenblatt: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ";" })}`)
          .join("\n\n")
          .trim();
      } else if (fileType === "pdf") {
        // Text sauber über pdfjs holen. Die alte Byte-für-Byte-Variante las
        // komprimierte PDF-Streams als Zeichensalat — bei modernen PDFs kam
        // dabei nichts Brauchbares heraus.
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const seiten: string[] = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const content = await (await pdf.getPage(p)).getTextContent();
          seiten.push((content.items as any[]).map(i => i.str ?? "").join(" "));
        }
        fileContent = seiten.join("\n").trim();
      } else {
        fileContent = await file.text();
      }

      if (!fileContent.trim()) {
        toast({
          variant: "destructive",
          title: "Kein Text in der Datei",
          description: "Aus dieser Datei ließ sich kein Text lesen (z. B. ein eingescanntes PDF). Bitte eine CSV/Excel-Preisliste verwenden.",
        });
        setProcessing(false);
        return;
      }

      // Chunking: große Dateien in 50KB-Blöcke aufteilen und nacheinander verarbeiten
      const CHUNK_SIZE = 50000;
      const MAX_TOTAL = 500000; // Hard-Cap bei 500KB — darüber sollte manuell importiert werden
      if (fileContent.length > MAX_TOTAL) {
        toast({
          variant: "destructive",
          title: "Datei zu groß",
          description: `Datei hat ${Math.round(fileContent.length / 1024)}KB. Max. ${Math.round(MAX_TOTAL / 1024)}KB. Bitte Datei splitten oder manuell importieren.`,
        });
        return;
      }

      const allMaterials: any[] = [];
      const chunks: string[] = [];
      for (let i = 0; i < fileContent.length; i += CHUNK_SIZE) {
        chunks.push(fileContent.slice(i, i + CHUNK_SIZE));
      }

      for (let idx = 0; idx < chunks.length; idx++) {
        const { data, error } = await supabase.functions.invoke("parse-material-file", {
          body: { fileContent: chunks[idx], fileType },
        });
        if (error) {
          console.error(`Chunk ${idx + 1} error:`, error);
          continue; // Einzelne Chunks dürfen fehlschlagen
        }
        if (data?.materials) allMaterials.push(...data.materials);
      }

      if (allMaterials.length > 0) {
        // Duplikate innerhalb des Imports entfernen (case-insensitive)
        const seen = new Set<string>();
        const deduped = allMaterials.filter(m => {
          const key = (m.name || "").trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setMaterials(deduped.map((m: any) => {
          const preis = toNumber(m.einzelpreis, 0);
          return {
            name: String(m.name || "").trim(),
            beschreibung: String(m.beschreibung || "").trim(),
            einheit: normalizeEinheit(m.einheit, einheiten),
            einzelpreis: preis,
            preisInput: formatForInput(preis, 2),
            selected: true,
          } as ParsedMaterial;
        }));
      } else {
        toast({ variant: "destructive", title: "Keine Materialien erkannt", description: "Die KI konnte keine Materialien aus der Datei extrahieren." });
      }
    } catch (err: any) {
      console.error("Import error:", err);
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Datei konnte nicht verarbeitet werden" });
    } finally {
      setProcessing(false);
    }
  };

  const toggleMaterial = (idx: number) => {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, selected: !m.selected } : m));
  };

  const updateMaterial = (idx: number, field: keyof ParsedMaterial, value: any) => {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const handleSave = async () => {
    const selected = materials.filter(m => m.selected && m.name.trim());
    if (selected.length === 0) return;

    setSaving(true);
    try {
      // user_id ist in invoice_templates NOT NULL (und RLS verlangt den
      // eigenen User) — ohne diese Zeile scheiterte JEDER Import mit
      // 'null value in column "user_id" ... violates not-null constraint'.
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Nicht angemeldet — bitte neu einloggen.");

      // Duplikat-Check: bestehende Materialien laden und nach Name (case-insensitive, trimmed) vergleichen
      const { data: existing } = await supabase
        .from("invoice_templates")
        .select("id, name");
      const existingNames = new Set(
        (existing || []).map((e: any) => (e.name || "").trim().toLowerCase())
      );

      const toInsert: typeof selected = [];
      const skipped: string[] = [];
      for (const m of selected) {
        const key = m.name.trim().toLowerCase();
        if (existingNames.has(key)) {
          skipped.push(m.name.trim());
        } else {
          existingNames.add(key); // auch Duplikate innerhalb des Imports filtern
          toInsert.push(m);
        }
      }

      if (toInsert.length === 0) {
        toast({
          variant: "destructive",
          title: "Nichts zu importieren",
          description: `Alle ${selected.length} Materialien existieren bereits.`,
        });
        return;
      }

      // Der Katalog führt fünf parallele Preisfelder (Legacy einzelpreis/
      // netto_preis/brutto_preis + aktuell ek_netto/vk_netto). Wer nur
      // einzelpreis schreibt, sieht in der Artikelmaske überall 0,00 €.
      const aufschlag = Math.max(0, toNumber(aufschlagInput, 0));
      const { error } = await supabase.from("invoice_templates").insert(
        toInsert.map(m => {
          const preis = Math.max(0, m.einzelpreis || 0);
          const ek = preisArt === "ek" ? preis : preis;
          const vk = preisArt === "ek"
            ? Math.round(preis * (1 + aufschlag / 100) * 100) / 100
            : preis;
          const name = m.name.trim();
          return {
            user_id: userId,
            name,
            // beschreibung ist NOT NULL → niemals null einfügen
            beschreibung: m.beschreibung?.trim() || name,
            kurzbezeichnung: name,
            langbezeichnung: m.beschreibung?.trim() || null,
            kategorie: kategorie.trim() || null,
            einheit: m.einheit || "Stk.",
            einzelpreis: vk,
            netto_preis: vk,
            brutto_preis: Math.round(vk * 1.2 * 100) / 100,
            ust_satz: 20,
            ek_netto: ek,
            vk_netto: vk,
            aufschlag_prozent: preisArt === "ek" ? aufschlag : 0,
            ist_aktiv: true,
          };
        })
      );
      if (error) throw error;

      const skipMsg = skipped.length > 0
        ? ` (${skipped.length} bereits vorhanden, übersprungen)`
        : "";
      toast({
        title: "Materialien importiert",
        description: `${toInsert.length} Materialien angelegt${skipMsg}`,
      });
      onImported();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const resetState = () => {
    setMaterials([]);
    setFileName("");
    setPreisArt("ek");
    setAufschlagInput("0");
    setKategorie("");
  };

  const selectedCount = materials.filter(m => m.selected).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { onClose(); resetState(); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Materialien importieren
          </DialogTitle>
        </DialogHeader>

        {/* File Upload */}
        {materials.length === 0 && !processing && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Lade eine CSV, Excel oder PDF-Datei mit Materialien hoch. Die KI erkennt automatisch Name, Einheit und Preis.
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Datei hochladen</p>
              <p className="text-sm text-muted-foreground mt-1">CSV, Excel (.xlsx) oder PDF</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pdf,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Processing */}
        {processing && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">KI analysiert "{fileName}"...</p>
          </div>
        )}

        {/* Results */}
        {materials.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium">{materials.length} Materialien erkannt aus "{fileName}"</p>
              <Badge variant="secondary">{selectedCount} ausgewählt</Badge>
            </div>

            {/* Preisart + Kategorie — eine Lieferanten-Preisliste enthält EK,
                der Katalog braucht aber auch einen VK. */}
            <div className="grid gap-3 sm:grid-cols-3 rounded-lg border bg-muted/30 p-3">
              <div className="space-y-1">
                <Label className="text-xs">Preisspalte ist</Label>
                <Select value={preisArt} onValueChange={(v) => setPreisArt(v as "ek" | "vk")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ek">Einkaufspreis (EK)</SelectItem>
                    <SelectItem value="vk">Verkaufspreis (VK)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aufschlag auf EK (%)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={aufschlagInput}
                  onChange={(e) => setAufschlagInput(e.target.value)}
                  onBlur={() => setAufschlagInput(formatForInput(Math.max(0, toNumber(aufschlagInput, 0)), 2))}
                  disabled={preisArt !== "ek"}
                  className="h-9 text-right"
                  placeholder="z. B. 25"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kategorie (optional)</Label>
                <Input
                  value={kategorie}
                  onChange={(e) => setKategorie(e.target.value)}
                  className="h-9"
                  placeholder="z. B. Holz"
                />
              </div>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {materials.map((mat, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${mat.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30 opacity-60"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={mat.selected} onChange={() => toggleMaterial(idx)} className="rounded" />
                    <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 sm:col-span-5">
                      <Input
                        value={mat.name}
                        onChange={(e) => updateMaterial(idx, "name", e.target.value)}
                        placeholder="Name"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <Input
                        value={mat.beschreibung}
                        onChange={(e) => updateMaterial(idx, "beschreibung", e.target.value)}
                        placeholder="Beschreibung"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Select value={mat.einheit} onValueChange={(v) => updateMaterial(idx, "einheit", v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {/* Einheit aus der Datei, die nicht im Stamm steht,
                              trotzdem anbieten — sonst leeres Feld. */}
                          {!einheiten.includes(mat.einheit) && mat.einheit && (
                            <SelectItem value={mat.einheit}>{mat.einheit} (aus Datei)</SelectItem>
                          )}
                          {einheiten.map(e => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={mat.preisInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setMaterials(prev => prev.map((m, i) => i === idx
                            ? { ...m, preisInput: raw, einzelpreis: parseDecimal(raw) ?? 0 }
                            : m));
                        }}
                        onBlur={() => setMaterials(prev => prev.map((m, i) => i === idx
                          ? { ...m, preisInput: formatForInput(m.einzelpreis, 2) }
                          : m))}
                        placeholder="Preis"
                        className="h-9 text-sm text-right"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { onClose(); resetState(); }}>Abbrechen</Button>
          {materials.length > 0 && (
            <Button onClick={handleSave} disabled={saving || selectedCount === 0} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Speichert..." : `${selectedCount} Materialien anlegen`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
