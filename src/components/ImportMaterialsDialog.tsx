import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDecimal, toNumber, formatForInput } from "@/lib/num";

type ImportItem = {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
};

type Project = {
  id: string;
  name: string;
};

type GroupedMaterial = {
  material: string;
  totalMenge: number;
  einheit: string;
  einzelpreis: number;
  selected: boolean;
  /** Roh-Eingabe des Preisfeldes (deutsches Komma erlaubt). */
  preisInput: string;
  /** Für die Anzeige: was wurde entnommen / zurückgegeben. */
  entnommen: number;
  zurueck: number;
};

type ImportMaterialsDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (items: ImportItem[]) => void;
  projectId?: string | null;
};

/**
 * Menge aus dem Textfeld `material_entries.menge` lesen. Die Einheit steht in
 * einer eigenen Spalte — sie wird nur benutzt, wenn im Mengentext
 * ausnahmsweise eine mitgeschrieben wurde ("150 lfm").
 * parseDecimal versteht dabei auch "12,5".
 */
function parseMenge(mengeStr: string | null): { value: number; einheit: string | null } {
  if (!mengeStr) return { value: 0, einheit: null };

  const trimmed = mengeStr.trim();
  const match = trimmed.match(/^(-?[\d.,]+)\s*(.*)$/);
  if (match) {
    const value = parseDecimal(match[1]) ?? 0;
    const einheit = match[2].trim() || null;
    return { value, einheit };
  }

  return { value: 0, einheit: null };
}

export const ImportMaterialsDialog = ({
  open,
  onClose,
  onImport,
  projectId: preselectedProjectId,
}: ImportMaterialsDialogProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [materials, setMaterials] = useState<GroupedMaterial[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProjects();
      if (preselectedProjectId) {
        setSelectedProjectId(preselectedProjectId);
      }
    } else {
      setSelectedProjectId("");
      setMaterials([]);
    }
  }, [open, preselectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchMaterials(selectedProjectId);
    } else {
      setMaterials([]);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .not("status", "eq", "Abgeschlossen")
      .order("name");

    if (data) {
      setProjects(data);
    }
  };

  const fetchMaterials = async (projectId: string) => {
    setLoading(true);

    const { data, error } = await supabase
      .from("material_entries")
      .select("material, menge, einheit, typ, einzelpreis, notizen")
      .eq("project_id", projectId)
      .order("material");

    if (error || !data) {
      setLoading(false);
      return;
    }

    // Je Material aufsummieren. WICHTIG: Rückgaben werden ABGEZOGEN — vorher
    // wurde alles addiert, dadurch stieg der "Verbrauch" bei jeder Rückgabe
    // (150 lfm raus + 20 lfm retour ergab 170 statt 130).
    // Ebenso: die Einheit steht in einer eigenen Spalte; sie wurde ignoriert,
    // sodass jede Position als "Stk" in die Rechnung ging.
    const grouped = new Map<string, {
      name: string; entnommen: number; zurueck: number; einheit: string; einzelpreis: number;
    }>();

    for (const entry of data as any[]) {
      const key = (entry.material || "").trim().toLowerCase();
      if (!key) continue;
      const { value, einheit: einheitAusText } = parseMenge(entry.menge);
      const einheit = (entry.einheit || "").trim() || einheitAusText || "Stk.";

      if (!grouped.has(key)) {
        grouped.set(key, {
          name: (entry.material || "").trim(),
          entnommen: 0, zurueck: 0, einheit, einzelpreis: 0,
        });
      }
      const g = grouped.get(key)!;
      if (entry.typ === "rueckgabe") g.zurueck += value;
      else g.entnommen += value; // "entnahme" und Alt-Buchungen ohne typ
      const preis = toNumber(entry.einzelpreis, 0);
      if (preis > 0 && g.einzelpreis === 0) g.einzelpreis = preis;
    }

    const result: GroupedMaterial[] = [];
    for (const g of grouped.values()) {
      const verbrauch = Math.round((g.entnommen - g.zurueck) * 1000) / 1000;
      if (verbrauch > 0) {
        result.push({
          material: g.name,
          totalMenge: verbrauch,
          einheit: g.einheit,
          einzelpreis: g.einzelpreis,
          preisInput: g.einzelpreis > 0 ? formatForInput(g.einzelpreis, 2) : "",
          selected: true,
          entnommen: g.entnommen,
          zurueck: g.zurueck,
        });
      }
    }

    setMaterials(result);
    setLoading(false);
  };

  const toggleItem = (index: number) => {
    setMaterials((prev) =>
      prev.map((m, i) => (i === index ? { ...m, selected: !m.selected } : m))
    );
  };

  const updateEinzelpreis = (index: number, value: string) => {
    setMaterials((prev) =>
      prev.map((m, i) => (i === index
        ? { ...m, preisInput: value, einzelpreis: parseDecimal(value) ?? 0 }
        : m))
    );
  };

  const blurEinzelpreis = (index: number) => {
    setMaterials((prev) =>
      prev.map((m, i) => (i === index
        ? { ...m, preisInput: m.einzelpreis > 0 ? formatForInput(m.einzelpreis, 2) : "" }
        : m))
    );
  };

  const handleImport = () => {
    const selected = materials.filter((m) => m.selected);
    const items: ImportItem[] = selected.map((m) => ({
      beschreibung: m.material,
      menge: m.totalMenge,
      einheit: m.einheit,
      einzelpreis: m.einzelpreis,
    }));
    onImport(items);
    onClose();
  };

  const selectedCount = materials.filter((m) => m.selected).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Materialien importieren</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Projekt</label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Projekt auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
            </div>
          )}

          {!loading && selectedProjectId && materials.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine Materialien gefunden.
            </p>
          )}

          {!loading && materials.length > 0 && (
            <div className="space-y-2">
              {materials.map((m, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <Checkbox
                    className="h-5 w-5"
                    aria-label={`${m.material} auswählen`}
                    checked={m.selected}
                    onCheckedChange={() => toggleItem(index)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.material}</p>
                    <p className="text-xs text-muted-foreground">
                      Verbrauch: {formatForInput(m.totalMenge)} {m.einheit}
                      {m.zurueck > 0 && (
                        <span className="ml-1">
                          ({formatForInput(m.entnommen)} entnommen − {formatForInput(m.zurueck)} retour)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="w-28 shrink-0">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Preis"
                      aria-label={`Preis ${m.material}`}
                      className="h-9 text-sm text-right"
                      value={m.preisInput}
                      onChange={(e) => updateEinzelpreis(index, e.target.value)}
                      onBlur={() => blurEinzelpreis(index)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={handleImport} disabled={selectedCount === 0}>
              Importieren ({selectedCount})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
