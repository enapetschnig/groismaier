import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Check, X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";

interface ParsedMaterial {
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  selected: boolean;
}

interface MaterialFileImportProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function MaterialFileImport({ open, onClose, onImported }: MaterialFileImportProps) {
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState<ParsedMaterial[]>([]);
  const [fileName, setFileName] = useState("");

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
        // Read as text (basic parsing)
        fileContent = await file.text();
      } else if (fileType === "pdf") {
        // Convert PDF to base64 text representation
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let text = "";
        for (let i = 0; i < bytes.length; i++) {
          const char = bytes[i];
          if (char >= 32 && char <= 126) text += String.fromCharCode(char);
          else if (char === 10 || char === 13) text += "\n";
          else text += " ";
        }
        fileContent = text.slice(0, 8000); // Limit for API
      } else {
        fileContent = await file.text();
      }

      if (!fileContent.trim()) {
        toast({ variant: "destructive", title: "Leere Datei" });
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
        setMaterials(deduped.map((m: any) => ({ ...m, selected: true })));
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

      const { error } = await supabase.from("invoice_templates").insert(
        toInsert.map(m => ({
          name: m.name.trim(),
          beschreibung: m.beschreibung?.trim() || null,
          einheit: m.einheit || "Stk.",
          einzelpreis: m.einzelpreis || 0,
        }))
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

  const selectedCount = materials.filter(m => m.selected).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { onClose(); setMaterials([]); setFileName(""); } }}>
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
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{materials.length} Materialien erkannt aus "{fileName}"</p>
              <Badge variant="secondary">{selectedCount} ausgewählt</Badge>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {materials.map((mat, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${mat.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30 opacity-60"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={mat.selected} onChange={() => toggleMaterial(idx)} className="rounded" />
                    <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <Input
                        value={mat.name}
                        onChange={(e) => updateMaterial(idx, "name", e.target.value)}
                        placeholder="Name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={mat.beschreibung}
                        onChange={(e) => updateMaterial(idx, "beschreibung", e.target.value)}
                        placeholder="Beschreibung"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <Select value={mat.einheit} onValueChange={(v) => updateMaterial(idx, "einheit", v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {einheiten.map(e => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={mat.einzelpreis}
                        onChange={(e) => updateMaterial(idx, "einzelpreis", Number(e.target.value))}
                        placeholder="Preis"
                        className="h-8 text-sm text-right"
                        min={0}
                        step={0.01}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { onClose(); setMaterials([]); setFileName(""); }}>Abbrechen</Button>
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
