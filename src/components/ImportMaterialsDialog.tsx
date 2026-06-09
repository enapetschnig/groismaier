import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
};

type ImportMaterialsDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (items: ImportItem[]) => void;
  projectId?: string | null;
};

function parseMenge(mengeStr: string | null): { value: number; einheit: string } {
  if (!mengeStr) return { value: 1, einheit: "Stk" };

  const trimmed = mengeStr.trim();
  const match = trimmed.match(/^([\d.,]+)\s*(.*)/);
  if (match) {
    const value = parseFloat(match[1].replace(",", ".")) || 1;
    const einheit = match[2].trim() || "Stk";
    return { value, einheit };
  }

  return { value: 1, einheit: "Stk" };
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
      .select("material, menge, notizen")
      .eq("project_id", projectId)
      .order("material");

    if (error || !data) {
      setLoading(false);
      return;
    }

    // Group by material name and sum up quantities
    const grouped = new Map<string, { totalMenge: number; einheit: string }>();

    for (const entry of data) {
      const { value, einheit } = parseMenge(entry.menge);
      const key = entry.material.trim().toLowerCase();

      if (grouped.has(key)) {
        const existing = grouped.get(key)!;
        existing.totalMenge += value;
      } else {
        grouped.set(key, { totalMenge: value, einheit });
      }
    }

    // Build display list using original casing from first occurrence
    const nameMap = new Map<string, string>();
    for (const entry of data) {
      const key = entry.material.trim().toLowerCase();
      if (!nameMap.has(key)) {
        nameMap.set(key, entry.material.trim());
      }
    }

    const result: GroupedMaterial[] = [];
    for (const [key, { totalMenge, einheit }] of grouped) {
      if (totalMenge > 0) {
        result.push({
          material: nameMap.get(key) || key,
          totalMenge,
          einheit,
          einzelpreis: 0,
          selected: true,
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
    const parsed = parseFloat(value.replace(",", ".")) || 0;
    setMaterials((prev) =>
      prev.map((m, i) => (i === index ? { ...m, einzelpreis: parsed } : m))
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
                    checked={m.selected}
                    onCheckedChange={() => toggleItem(index)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.material}</p>
                    <p className="text-xs text-muted-foreground">
                      Verbrauch: {m.totalMenge} {m.einheit}
                    </p>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Preis"
                      className="w-full text-sm border rounded px-2 py-1"
                      value={m.einzelpreis || ""}
                      onChange={(e) => updateEinzelpreis(index, e.target.value)}
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
