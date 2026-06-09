import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Clock, Package } from "lucide-react";
import { format } from "date-fns";

interface Disturbance {
  id: string;
  datum: string;
  kunde_name: string;
  stunden: number;
  beschreibung: string;
  is_verrechnet: boolean;
  start_time: string;
  end_time: string;
}

interface DisturbanceMaterial {
  material: string;
  menge: string | null;
  einheit: string | null;
  einzelpreis: number | null;
}

interface ImportItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  selected: boolean;
  source: "zeit" | "material";
}

interface ImportDisturbanceToInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (items: { beschreibung: string; menge: number; einheit: string; einzelpreis: number }[], kundeData?: { kunde_name: string; kunde_adresse?: string; kunde_telefon?: string; kunde_email?: string }) => void;
  preselectedId?: string | null;
}

export function ImportDisturbanceToInvoiceDialog({ open, onClose, onImport, preselectedId }: ImportDisturbanceToInvoiceDialogProps) {
  const [disturbances, setDisturbances] = useState<Disturbance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId || null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stundensatz, setStundensatz] = useState(70);

  useEffect(() => {
    if (open) {
      fetchDisturbances();
      if (preselectedId) {
        setSelectedId(preselectedId);
      }
    }
  }, [open, preselectedId]);

  useEffect(() => {
    if (selectedId) loadDisturbanceDetails(selectedId);
  }, [selectedId]);

  const fetchDisturbances = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("disturbances")
      .select("id, datum, kunde_name, stunden, beschreibung, is_verrechnet, start_time, end_time")
      .order("datum", { ascending: false })
      .limit(50);
    setDisturbances(data || []);
    setLoading(false);
  };

  const loadDisturbanceDetails = async (id: string) => {
    // Load disturbance directly from DB (not from state — avoids race condition)
    const [{ data: distData }, { data: materials }] = await Promise.all([
      supabase.from("disturbances").select("id, datum, kunde_name, kunde_email, kunde_adresse, kunde_plz, kunde_ort, kunde_telefon, stunden, beschreibung, is_verrechnet, start_time, end_time").eq("id", id).single(),
      supabase.from("disturbance_materials").select("material, menge, einheit, einzelpreis").eq("disturbance_id", id),
    ]);

    const dist = distData;
    if (!dist) return;

    // Update disturbances list if not already there
    setDisturbances(prev => {
      if (prev.find(d => d.id === dist.id)) return prev;
      return [dist, ...prev];
    });

    const newItems: ImportItem[] = [];

    // Add time as position
    newItems.push({
      beschreibung: `Arbeitszeit Regiebericht ${format(new Date(dist.datum), "dd.MM.yyyy")} (${dist.start_time?.slice(0, 5)} - ${dist.end_time?.slice(0, 5)})`,
      menge: Number(dist.stunden),
      einheit: "Std.",
      einzelpreis: stundensatz,
      selected: true,
      source: "zeit",
    });

    // Add materials with einheit and preis from DB
    (materials || []).forEach(m => {
      newItems.push({
        beschreibung: m.material,
        menge: parseFloat(m.menge || "1") || 1,
        einheit: m.einheit || "Stk.",
        einzelpreis: Number(m.einzelpreis) || 0,
        selected: true,
        source: "material",
      });
    });

    setItems(newItems);
  };

  const toggle = (idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const updateField = (idx: number, field: string, val: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const handleImport = async () => {
    const dist = disturbances.find(d => d.id === selectedId);
    const selected = items.filter(i => i.selected);

    // Try to match customer from database
    let kundeData: any = dist ? { kunde_name: dist.kunde_name } : undefined;
    if (dist?.kunde_name) {
      const { data: matchedCustomer } = await supabase
        .from("customers")
        .select("id, name, adresse, plz, ort, land, email, telefon, uid_nummer")
        .ilike("name", `%${dist.kunde_name}%`)
        .limit(1)
        .maybeSingle();

      if (matchedCustomer) {
        kundeData = {
          customer_id: matchedCustomer.id,
          kunde_name: matchedCustomer.name,
          kunde_adresse: matchedCustomer.adresse,
          kunde_plz: matchedCustomer.plz,
          kunde_ort: matchedCustomer.ort,
          kunde_land: matchedCustomer.land,
          kunde_email: matchedCustomer.email,
          kunde_telefon: matchedCustomer.telefon,
          kunde_uid: matchedCustomer.uid_nummer,
        };
      } else {
        // Use data from Regiebericht directly
        kundeData = {
          kunde_name: dist.kunde_name,
          kunde_adresse: (dist as any).kunde_adresse || "",
          kunde_plz: (dist as any).kunde_plz || "",
          kunde_ort: (dist as any).kunde_ort || "",
          kunde_email: (dist as any).kunde_email || "",
          kunde_telefon: (dist as any).kunde_telefon || "",
        };
      }
    }

    onImport(
      selected.map(i => ({ beschreibung: i.beschreibung, menge: i.menge, einheit: i.einheit, einzelpreis: i.einzelpreis })),
      kundeData,
    );
  };

  const selected = items.filter(i => i.selected);
  const total = selected.reduce((s, i) => s + i.menge * i.einzelpreis, 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Aus Regiebericht importieren
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt Regieberichte...</p>
        ) : !selectedId ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">Regiebericht auswählen:</p>
            {disturbances.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Keine Regieberichte vorhanden</p>
            ) : (
              disturbances.map(d => (
                <div
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${d.is_verrechnet ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{d.kunde_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(d.datum), "dd.MM.yyyy")} · {d.stunden}h · {d.beschreibung.slice(0, 60)}{d.beschreibung.length > 60 ? "..." : ""}
                      </p>
                    </div>
                    {d.is_verrechnet && <Badge variant="secondary" className="text-xs">Verrechnet</Badge>}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Back button */}
            <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setItems([]); }}>
              ← Anderen Regiebericht wählen
            </Button>

            {/* Durchgeführte Arbeiten (Info, keine Position) */}
            {(() => {
              const dist = disturbances.find(d => d.id === selectedId);
              return dist?.beschreibung ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-800 mb-1">Durchgeführte Arbeiten:</p>
                  <p className="text-sm text-blue-700">{dist.beschreibung}</p>
                </div>
              ) : null;
            })()}

            {/* Stundensatz */}
            <div className="flex items-center gap-3 pb-2 border-b">
              <label className="text-sm font-medium whitespace-nowrap">Stundensatz:</label>
              <Input
                type="number"
                value={stundensatz}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStundensatz(val);
                  setItems(prev => prev.map(i => i.source === "zeit" ? { ...i, einzelpreis: val } : i));
                }}
                className="w-24"
                min={0}
                step={0.5}
              />
              <span className="text-sm text-muted-foreground">€/Std.</span>
            </div>

            {/* Items */}
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${item.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-3">
                    <Checkbox checked={item.selected} onCheckedChange={() => toggle(idx)} />
                    <div className="flex items-center gap-1.5">
                      {item.source === "zeit" ? <Clock className="w-3.5 h-3.5 text-blue-500" /> : <Package className="w-3.5 h-3.5 text-orange-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.beschreibung}
                        onChange={(e) => updateField(idx, "beschreibung", e.target.value)}
                        className="h-7 text-sm"
                      />
                    </div>
                  </div>
                  {item.selected && (
                    <div className="flex items-center gap-2 mt-2 ml-12 text-sm">
                      <Input type="number" value={item.menge} onChange={(e) => updateField(idx, "menge", Number(e.target.value))} className="w-20 h-7 text-right" min={0} step={0.1} />
                      <Input value={item.einheit} onChange={(e) => updateField(idx, "einheit", e.target.value)} className="w-16 h-7 text-center text-xs" />
                      <span className="text-xs text-muted-foreground">×</span>
                      <Input type="number" value={item.einzelpreis} onChange={(e) => updateField(idx, "einzelpreis", Number(e.target.value))} className="w-24 h-7 text-right" min={0} step={0.01} />
                      <span className="text-xs text-muted-foreground">€</span>
                      <span className="ml-auto font-medium">= € {(item.menge * item.einzelpreis).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t text-sm">
              <span className="text-muted-foreground">{selected.length} Positionen</span>
              <span className="font-bold">Gesamt: € {total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          {selectedId && (
            <Button onClick={handleImport} disabled={selected.length === 0} className="gap-2">
              <FileText className="w-4 h-4" />
              {selected.length > 0 ? `${selected.length} Positionen importieren` : "Importieren"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
