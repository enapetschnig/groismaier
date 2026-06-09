import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";

interface TimeGroup {
  name: string;
  stunden: number;
  taetigkeiten: string[];
  selected: boolean;
  stundensatz: number;
}

interface ImportTimeItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
}

interface ImportTimeDialogProps {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  onImport: (items: ImportTimeItem[]) => void;
}

export function ImportTimeDialog({ open, onClose, projectId, onImport }: ImportTimeDialogProps) {
  const [groups, setGroups] = useState<TimeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [defaultStundensatz, setDefaultStundensatz] = useState(45);

  useEffect(() => {
    if (open && projectId) {
      fetchTimeEntries();
    } else if (open && !projectId) {
      setGroups([]);
    }
  }, [open, projectId]);

  const fetchTimeEntries = async () => {
    if (!projectId) return;
    setLoading(true);

    const { data } = await supabase
      .from("time_entries")
      .select("user_id, stunden, taetigkeit, datum")
      .eq("project_id", projectId)
      .order("datum");

    if (!data || data.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    // Get profile names (hidden User werden ignoriert)
    const userIds = [...new Set(data.map(e => e.user_id))];
    const { data: profiles } = await (supabase.from("profiles" as never) as any)
      .select("id, vorname, nachname, hidden")
      .in("id", userIds);

    const visibleIds = new Set(((profiles as any[]) || []).filter((p: any) => !p.hidden).map((p: any) => p.id));
    const profileMap = new Map(
      ((profiles as any[]) || []).filter((p: any) => !p.hidden).map((p: any) => [p.id, `${p.vorname} ${p.nachname}`])
    );

    // Group by user (hidden User ausfiltern)
    const userGroups = new Map<string, { stunden: number; taetigkeiten: Set<string> }>();
    data.forEach(e => {
      if (!visibleIds.has(e.user_id)) return;
      const name = profileMap.get(e.user_id) || "Unbekannt";
      if (!userGroups.has(name)) {
        userGroups.set(name, { stunden: 0, taetigkeiten: new Set() });
      }
      const g = userGroups.get(name)!;
      g.stunden += Number(e.stunden);
      if (e.taetigkeit) g.taetigkeiten.add(e.taetigkeit);
    });

    setGroups(
      Array.from(userGroups.entries()).map(([name, g]) => ({
        name,
        stunden: Math.round(g.stunden * 100) / 100,
        taetigkeiten: Array.from(g.taetigkeiten),
        selected: true,
        stundensatz: defaultStundensatz,
      }))
    );
    setLoading(false);
  };

  const toggleGroup = (idx: number) => {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, selected: !g.selected } : g));
  };

  const updateStundensatz = (idx: number, val: number) => {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, stundensatz: val } : g));
  };

  const applyDefaultToAll = () => {
    setGroups(prev => prev.map(g => ({ ...g, stundensatz: defaultStundensatz })));
  };

  const handleImport = () => {
    const items: ImportTimeItem[] = groups
      .filter(g => g.selected && g.stunden > 0)
      .map(g => ({
        beschreibung: `Arbeitszeit ${g.name}${g.taetigkeiten.length > 0 ? ` (${g.taetigkeiten.slice(0, 3).join(", ")})` : ""}`,
        menge: g.stunden,
        einheit: "Std.",
        einzelpreis: g.stundensatz,
      }));
    onImport(items);
  };

  const selectedGroups = groups.filter(g => g.selected);
  const totalStunden = selectedGroups.reduce((s, g) => s + g.stunden, 0);
  const totalBetrag = selectedGroups.reduce((s, g) => s + g.stunden * g.stundensatz, 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Arbeitszeit importieren
          </DialogTitle>
        </DialogHeader>

        {!projectId ? (
          <p className="text-center py-8 text-muted-foreground">
            Bitte zuerst ein Projekt auswählen, um Arbeitszeiten zu importieren.
          </p>
        ) : loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt Zeiteinträge...</p>
        ) : groups.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            Keine Zeiteinträge für dieses Projekt gefunden.
          </p>
        ) : (
          <>
            {/* Default Stundensatz */}
            <div className="flex items-center gap-3 pb-2 border-b">
              <label className="text-sm font-medium whitespace-nowrap">Stundensatz für alle:</label>
              <Input
                type="number"
                value={defaultStundensatz}
                onChange={(e) => setDefaultStundensatz(Number(e.target.value))}
                className="w-24"
                min={0}
                step={0.5}
              />
              <span className="text-sm text-muted-foreground">€/Std.</span>
              <Button variant="outline" size="sm" onClick={applyDefaultToAll}>
                Auf alle anwenden
              </Button>
            </div>

            {/* Groups */}
            <div className="space-y-3">
              {groups.map((g, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${g.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-3">
                    <Checkbox checked={g.selected} onCheckedChange={() => toggleGroup(idx)} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.stunden} Stunden
                        {g.taetigkeiten.length > 0 && ` · ${g.taetigkeiten.slice(0, 3).join(", ")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={g.stundensatz}
                        onChange={(e) => updateStundensatz(idx, Number(e.target.value))}
                        className="w-20 text-right"
                        min={0}
                        step={0.5}
                      />
                      <span className="text-xs text-muted-foreground">€/h</span>
                    </div>
                    <p className="text-sm font-medium w-24 text-right">
                      € {(g.stunden * g.stundensatz).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between pt-2 border-t text-sm">
              <span className="text-muted-foreground">{selectedGroups.length} Mitarbeiter · {totalStunden.toFixed(1)} Std.</span>
              <span className="font-bold">Gesamt: € {totalBetrag.toFixed(2)}</span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={handleImport}
            disabled={selectedGroups.length === 0}
            className="gap-2"
          >
            <Clock className="w-4 h-4" />
            {selectedGroups.length > 0 ? `${selectedGroups.length} Positionen importieren` : "Importieren"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
