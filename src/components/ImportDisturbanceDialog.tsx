import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

type ImportItem = {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
};

type KundeData = {
  kunde_name: string;
  kunde_adresse: string;
  kunde_telefon: string;
  kunde_email: string;
};

type Disturbance = {
  id: string;
  datum: string;
  kunde_name: string;
  kunde_adresse: string | null;
  kunde_telefon: string | null;
  kunde_email: string | null;
  stunden: number;
  status: string;
};

type MaterialLine = {
  id: string;
  material: string;
  menge: string | null;
  selected: boolean;
  einzelpreis: number;
};

type ImportDisturbanceDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (items: ImportItem[], kundeData?: KundeData) => void;
};

export const ImportDisturbanceDialog = ({
  open,
  onClose,
  onImport,
}: ImportDisturbanceDialogProps) => {
  const [disturbances, setDisturbances] = useState<Disturbance[]>([]);
  const [selectedDisturbanceId, setSelectedDisturbanceId] = useState<string>("");
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  const [includeHours, setIncludeHours] = useState(true);
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchDisturbances();
    } else {
      setSelectedDisturbanceId("");
      setMaterials([]);
      setIncludeHours(true);
      setHourlyRate(0);
    }
  }, [open]);

  useEffect(() => {
    if (selectedDisturbanceId) {
      fetchMaterials(selectedDisturbanceId);
    } else {
      setMaterials([]);
    }
  }, [selectedDisturbanceId]);

  const fetchDisturbances = async () => {
    setLoading(true);

    const { data } = await supabase
      .from("disturbances")
      .select("id, datum, kunde_name, kunde_adresse, kunde_telefon, kunde_email, stunden, status")
      .eq("is_verrechnet", false)
      .neq("status", "offen")
      .order("datum", { ascending: false });

    if (data) {
      setDisturbances(data);
    }
    setLoading(false);
  };

  const fetchMaterials = async (disturbanceId: string) => {
    const { data } = await supabase
      .from("disturbance_materials")
      .select("id, material, menge")
      .eq("disturbance_id", disturbanceId)
      .order("created_at", { ascending: true });

    if (data) {
      setMaterials(
        data.map((m) => ({
          ...m,
          selected: true,
          einzelpreis: 0,
        }))
      );
    }
  };

  const toggleMaterial = (index: number) => {
    setMaterials((prev) =>
      prev.map((m, i) => (i === index ? { ...m, selected: !m.selected } : m))
    );
  };

  const updateMaterialPreis = (index: number, value: string) => {
    const parsed = parseFloat(value.replace(",", ".")) || 0;
    setMaterials((prev) =>
      prev.map((m, i) => (i === index ? { ...m, einzelpreis: parsed } : m))
    );
  };

  const selectedDisturbance = disturbances.find(
    (d) => d.id === selectedDisturbanceId
  );

  const handleImport = async () => {
    if (!selectedDisturbance) return;
    setImporting(true);

    const items: ImportItem[] = [];

    // Add hours line item
    if (includeHours) {
      const datumFormatted = format(new Date(selectedDisturbance.datum), "dd.MM.yyyy");
      items.push({
        beschreibung: `Regiearbeit am ${datumFormatted} - ${selectedDisturbance.stunden}h`,
        menge: selectedDisturbance.stunden,
        einheit: "Std",
        einzelpreis: hourlyRate,
      });
    }

    // Add selected materials
    for (const m of materials) {
      if (!m.selected) continue;

      const mengeValue = parseMengeValue(m.menge);
      items.push({
        beschreibung: m.material,
        menge: mengeValue.value,
        einheit: mengeValue.einheit,
        einzelpreis: m.einzelpreis,
      });
    }

    // Mark disturbance as invoiced
    await supabase
      .from("disturbances")
      .update({ is_verrechnet: true })
      .eq("id", selectedDisturbanceId);

    const kundeData: KundeData = {
      kunde_name: selectedDisturbance.kunde_name,
      kunde_adresse: selectedDisturbance.kunde_adresse || "",
      kunde_telefon: selectedDisturbance.kunde_telefon || "",
      kunde_email: selectedDisturbance.kunde_email || "",
    };

    onImport(items, kundeData);
    setImporting(false);
    onClose();
  };

  const hasSelection =
    includeHours || materials.some((m) => m.selected);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regiebericht importieren</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
            </div>
          )}

          {!loading && disturbances.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine offenen Regieberichte gefunden.
            </p>
          )}

          {!loading && disturbances.length > 0 && (
            <>
              <div>
                <label className="text-sm font-medium">Regiebericht</label>
                <Select
                  value={selectedDisturbanceId}
                  onValueChange={setSelectedDisturbanceId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Regiebericht auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {disturbances.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {format(new Date(d.datum), "dd.MM.yyyy")} -{" "}
                        {d.kunde_name} - {d.stunden}h ({d.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedDisturbance && (
                <div className="space-y-3">
                  {/* Hours line item */}
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                    <Checkbox
                      checked={includeHours}
                      onCheckedChange={(checked) =>
                        setIncludeHours(checked === true)
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        Regiearbeit am{" "}
                        {format(new Date(selectedDisturbance.datum), "dd.MM.yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedDisturbance.stunden} Stunden
                      </p>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Std-Satz"
                        className="w-full text-sm border rounded px-2 py-1"
                        value={hourlyRate || ""}
                        onChange={(e) =>
                          setHourlyRate(
                            parseFloat(e.target.value.replace(",", ".")) || 0
                          )
                        }
                      />
                    </div>
                  </div>

                  {/* Materials */}
                  {materials.length > 0 && (
                    <>
                      <p className="text-sm font-medium text-muted-foreground">
                        Materialien
                      </p>
                      {materials.map((m, index) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 p-3 border rounded-lg"
                        >
                          <Checkbox
                            checked={m.selected}
                            onCheckedChange={() => toggleMaterial(index)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {m.material}
                            </p>
                            {m.menge && (
                              <p className="text-xs text-muted-foreground">
                                Menge: {m.menge}
                              </p>
                            )}
                          </div>
                          <div className="w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Preis"
                              className="w-full text-sm border rounded px-2 py-1"
                              value={m.einzelpreis || ""}
                              onChange={(e) =>
                                updateMaterialPreis(index, e.target.value)
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {materials.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Keine Materialien erfasst.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedDisturbanceId || !hasSelection || importing}
            >
              {importing ? "Importiere..." : "Importieren"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function parseMengeValue(mengeStr: string | null): {
  value: number;
  einheit: string;
} {
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
