import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Search, Package, ShoppingCart, Plus, Minus, X } from "lucide-react";

interface CatalogItem {
  id: string;
  name: string;
  kurzbezeichnung: string | null;
  einheit: string;
  netto_preis: number;
  produktgruppe: string | null;
}

interface SelectedEntry {
  item: CatalogItem;
  menge: number;
}

interface MaterialCatalogDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: { material: string; menge: number; einheit: string; einzelpreis: number }) => void | Promise<void>;
}

export function MaterialCatalogDialog({ open, onClose, onSelect }: MaterialCatalogDialogProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectedEntry>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetchItems();
      setSearch("");
      setSelected(new Map());
    }
  }, [open]);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase.from("invoice_templates")
      .select("id, name, kurzbezeichnung, einheit, einzelpreis, kategorie")
      .order("kategorie")
      .order("name")
      .limit(5000);
    if (data) {
      setItems(data.map(d => ({
        id: d.id,
        name: d.name,
        kurzbezeichnung: (d as any).kurzbezeichnung || null,
        einheit: d.einheit || "Stk.",
        netto_preis: Number(d.einzelpreis) || 0,
        produktgruppe: d.kategorie || "Allgemein",
      })));
    }
    setLoading(false);
  };

  const s = search.toLowerCase();
  const filtered = items.filter(i => {
    if (!s) return true;
    return (i.kurzbezeichnung || "").toLowerCase().includes(s) || i.name.toLowerCase().includes(s) || (i.produktgruppe || "").toLowerCase().includes(s);
  });

  const grouped = new Map<string, CatalogItem[]>();
  filtered.forEach(i => {
    const g = i.produktgruppe || "Allgemein";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(i);
  });

  const setMenge = (item: CatalogItem, menge: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (menge <= 0) {
        next.delete(item.id);
      } else {
        next.set(item.id, { item, menge });
      }
      return next;
    });
  };

  const handleSubmitAll = async () => {
    for (const entry of selected.values()) {
      await onSelect({
        material: entry.item.kurzbezeichnung || entry.item.name,
        menge: entry.menge,
        einheit: entry.item.einheit,
        einzelpreis: entry.item.netto_preis,
      });
    }
    setSelected(new Map());
    onClose();
  };

  const selectedCount = selected.size;
  const displayName = (item: CatalogItem) => item.kurzbezeichnung || item.name;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Materialkatalog
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden px-5 pb-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Material suchen..."
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Material list — mit inline Mengen-Steuerung */}
          <div className="overflow-y-auto flex-1 space-y-3 min-h-0">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Lädt...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nichts gefunden</p>
            ) : (
              Array.from(grouped.entries()).map(([gruppe, gruppeItems]) => (
                <div key={gruppe}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 py-1">
                    {gruppe} <span className="font-normal">({gruppeItems.length})</span>
                  </p>
                  <div className="space-y-0.5">
                    {gruppeItems.map(item => {
                      const entry = selected.get(item.id);
                      const menge = entry?.menge ?? 0;
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                            menge > 0 ? "bg-orange-50 border border-orange-200" : "hover:bg-accent"
                          }`}
                        >
                          {/* Name */}
                          <span className="flex-1 truncate">{displayName(item)}</span>

                          {/* Mengen-Steuerung: immer sichtbar */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {menge > 0 && (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setMenge(item, menge - 1)}
                                >
                                  {menge === 1 ? <X className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                </Button>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0.1"
                                  value={menge}
                                  onChange={(e) => setMenge(item, Number(e.target.value) || 0)}
                                  className="w-14 h-7 text-center text-sm px-1"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </>
                            )}
                            <Button
                              variant={menge > 0 ? "outline" : "ghost"}
                              size="icon"
                              className={`h-7 w-7 ${menge === 0 ? "text-muted-foreground" : ""}`}
                              onClick={() => setMenge(item, menge + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Einheit */}
                          <span className="text-xs text-muted-foreground w-10 shrink-0">{item.einheit}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Submit button */}
          {selectedCount > 0 && (
            <Button
              className="w-full gap-2 bg-orange-600 hover:bg-orange-700"
              onClick={handleSubmitAll}
            >
              <ShoppingCart className="h-4 w-4" />
              {selectedCount} Material{selectedCount !== 1 ? "ien" : ""} entnehmen
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
