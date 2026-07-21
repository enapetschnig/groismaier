import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Percent, Euro, AlertTriangle, RefreshCw, TrendingUp } from "lucide-react";
import { parseDecimal } from "@/lib/num";

/**
 * Geldbetrag im österreichischen Format: 4.303,50 (statt 4303.50).
 * Gleiche Schreibweise wie im Beleg-Editor (Punkt als Tausendertrenner) —
 * toLocaleString("de-AT") würde ein schmales Leerzeichen setzen.
 */
const eur = (n: number): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00";
  const teile = Math.abs(v).toFixed(2).split(".");
  teile[0] = teile[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (v < 0 ? "-" : "") + teile.join(",");
};


/**
 * Bulk-Preissteigerung für den Material-Katalog.
 *
 * Filter (Kategorie, Lieferant, Set/Material-Typ) + Operator (+X%, +X€) +
 * Ziel-Feld (EK / VK / beide). Preview zeigt die ersten 20 Treffer, Apply
 * schreibt alle betroffenen Zeilen in einem Rutsch. Für EK-Änderungen:
 * alle Sets mit vk_preis_manuell=FALSE, die mindestens eine betroffene
 * Komponente enthalten, werden auf die neue Auto-VK-Kalkulation
 * (Σ EK × (1 + aufschlag/100)) nachgezogen ("Ripple-Effekt").
 */

interface BulkPriceDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  /** Alle verfügbaren Kategorien (aus dem aktuellen Katalog). */
  kategorien: string[];
  /** Alle verfügbaren Lieferanten. */
  lieferanten: string[];
}

type TypFilter = "alle" | "sets" | "materialien";
type TargetField = "ek" | "vk" | "beide";
type Operator = "prozent" | "euro";

interface Row {
  id: string;
  name: string;
  kurzbezeichnung: string | null;
  kategorie: string;
  lieferant: string | null;
  ist_set: boolean;
  ek_netto: number;
  vk_netto: number;
  aufschlag_prozent: number;
  vk_preis_manuell: boolean;
  ust_satz: number;
}

export function BulkPriceDialog({
  open,
  onClose,
  onApplied,
  kategorien,
  lieferanten,
}: BulkPriceDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // Filter
  const [filterKategorien, setFilterKategorien] = useState<Set<string>>(new Set());
  const [filterLieferanten, setFilterLieferanten] = useState<Set<string>>(new Set());
  const [filterTyp, setFilterTyp] = useState<TypFilter>("alle");

  // Operator
  const [operator, setOperator] = useState<Operator>("prozent");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState<TargetField>("vk");

  useEffect(() => {
    if (!open) return;
    // Reset + Reload bei jedem Öffnen
    setFilterKategorien(new Set());
    setFilterLieferanten(new Set());
    setFilterTyp("alle");
    setOperator("prozent");
    setValue("");
    setTarget("vk");
    void loadRows();
  }, [open]);

  const loadRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoice_templates")
      .select("id, name, kurzbezeichnung, kategorie, lieferant, ist_set, ek_netto, vk_netto, einzelpreis, netto_preis, aufschlag_prozent, vk_preis_manuell, ust_satz")
      .limit(10000);
    if (error) {
      toast({ variant: "destructive", title: "Laden fehlgeschlagen", description: error.message });
      setLoading(false);
      return;
    }
    setRows(((data as any[]) || []).map(d => {
      const vk = Number(d.vk_netto ?? d.netto_preis ?? d.einzelpreis) || 0;
      return {
        id: d.id,
        name: d.name,
        kurzbezeichnung: d.kurzbezeichnung,
        kategorie: d.kategorie || "Allgemein",
        lieferant: d.lieferant || null,
        ist_set: !!d.ist_set,
        ek_netto: Number(d.ek_netto ?? vk) || 0,
        vk_netto: vk,
        aufschlag_prozent: Number(d.aufschlag_prozent) || 0,
        vk_preis_manuell: !!d.vk_preis_manuell,
        ust_satz: Number(d.ust_satz) || 20,
      } as Row;
    }));
    setLoading(false);
  };

  const toggleKat = (k: string) => setFilterKategorien(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const toggleLief = (l: string) => setFilterLieferanten(prev => {
    const next = new Set(prev);
    if (next.has(l)) next.delete(l); else next.add(l);
    return next;
  });

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterKategorien.size > 0 && !filterKategorien.has(r.kategorie)) return false;
      if (filterLieferanten.size > 0 && !filterLieferanten.has(r.lieferant || "")) return false;
      if (filterTyp === "sets" && !r.ist_set) return false;
      if (filterTyp === "materialien" && r.ist_set) return false;
      return true;
    });
  }, [rows, filterKategorien, filterLieferanten, filterTyp]);

  // "2,5" muss funktionieren — mit <Input type="number"> + Number() verwarf der
  // Browser das Komma und der Anwender bekam wortlos 0 (Knopf blieb inaktiv).
  const numValue = parseDecimal(value) ?? 0;

  const applyOp = (base: number): number => {
    if (operator === "prozent") return Math.round(base * (1 + numValue / 100) * 100) / 100;
    return Math.round((base + numValue) * 100) / 100;
  };

  const computeNew = (r: Row): { ek: number; vk: number; changed: boolean } => {
    const touchEk = target === "ek" || target === "beide";
    const touchVk = target === "vk" || target === "beide";
    const newEk = touchEk ? Math.max(0, applyOp(r.ek_netto)) : r.ek_netto;
    const newVk = touchVk ? Math.max(0, applyOp(r.vk_netto)) : r.vk_netto;
    const changed =
      (touchEk && Math.abs(newEk - r.ek_netto) > 0.005) ||
      (touchVk && Math.abs(newVk - r.vk_netto) > 0.005);
    return { ek: newEk, vk: newVk, changed };
  };

  const preview = useMemo(() => {
    if (!numValue) return [] as Array<Row & { newEk: number; newVk: number }>;
    return filtered
      .map(r => {
        const { ek, vk, changed } = computeNew(r);
        return changed ? { ...r, newEk: ek, newVk: vk } : null;
      })
      .filter(Boolean)
      .slice(0, 20) as Array<Row & { newEk: number; newVk: number }>;
  }, [filtered, numValue, operator, target]);

  const totalChanged = useMemo(() => {
    if (!numValue) return 0;
    return filtered.filter(r => computeNew(r).changed).length;
  }, [filtered, numValue, operator, target]);

  // Ripple: alle Sets, die potenziell durch EK-Änderungen auto-recalculiert werden.
  const [rippleCount, setRippleCount] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    const calc = async () => {
      if (!numValue || (target !== "ek" && target !== "beide")) {
        setRippleCount(0);
        return;
      }
      // IDs der betroffenen Nicht-Set-Materialien (Set selbst hat EK, aber
      // Ripple betrifft andere Sets — deswegen filtern wir Materialien).
      const affectedMaterialIds = filtered
        .filter(r => !r.ist_set && computeNew(r).changed)
        .map(r => r.id);
      if (affectedMaterialIds.length === 0) {
        setRippleCount(0);
        return;
      }
      // Sets mit Auto-VK, die mindestens eine betroffene Komponente haben
      const { data } = await (supabase as any)
        .from("invoice_template_components")
        .select("parent_template_id, parent:invoice_templates!parent_template_id(id, vk_preis_manuell, ist_set)")
        .in("component_template_id", affectedMaterialIds);
      if (cancelled) return;
      const parentIds = new Set<string>();
      for (const r of (data as any[] || [])) {
        const p = r.parent;
        if (p?.ist_set && p?.vk_preis_manuell === false) parentIds.add(p.id);
      }
      setRippleCount(parentIds.size);
    };
    void calc();
    return () => { cancelled = true; };
  }, [filtered, numValue, operator, target]);

  const handleApply = async () => {
    if (!numValue || totalChanged === 0) return;
    const confirmMsg = `${totalChanged} Einträge werden angepasst.${rippleCount > 0 ? `\n\n+ ${rippleCount} Set(s) mit Auto-VK werden neu kalkuliert.` : ""}\n\nFortfahren?`;
    if (!window.confirm(confirmMsg)) return;

    setApplying(true);
    try {
      // 1) Batch-Updates auf die betroffenen Templates
      //    Jedes Update benötigt seinen eigenen RPC-Call (Supabase JS hat kein
      //    Batch-Update mit unterschiedlichen Werten). Für hunderte Zeilen
      //    reicht das; bei Millionen müsste ein SQL-Proc rein.
      const touchEk = target === "ek" || target === "beide";
      const touchVk = target === "vk" || target === "beide";
      const updated: { id: string; ek: number; vk: number }[] = [];
      for (const r of filtered) {
        const { ek, vk, changed } = computeNew(r);
        if (!changed) continue;
        const patch: any = {};
        if (touchEk) patch.ek_netto = ek;
        if (touchVk) {
          patch.vk_netto = vk;
          patch.netto_preis = vk;
          patch.einzelpreis = vk;
          patch.brutto_preis = Math.round(vk * (1 + r.ust_satz / 100) * 100) / 100;
          // Bei manuellem VK-Änderung keinen vk_preis_manuell-Flip erzwingen.
          // User wählt das Ziel bewusst — bleibt beim Set-Setting.
        }
        const { error } = await supabase.from("invoice_templates").update(patch).eq("id", r.id);
        if (error) throw error;
        updated.push({ id: r.id, ek, vk });
      }

      // 2) Ripple: für Sets mit Auto-VK (vk_preis_manuell=false), deren
      //    Komponenten betroffen sind, Auto-VK neu berechnen und speichern.
      if (rippleCount > 0 && (touchEk || touchVk)) {
        const affectedMaterialIds = updated
          .filter(u => {
            const r = filtered.find(x => x.id === u.id);
            return r && !r.ist_set;
          })
          .map(u => u.id);
        if (affectedMaterialIds.length > 0) {
          const { data: parentLinks } = await (supabase as any)
            .from("invoice_template_components")
            .select("parent_template_id, parent:invoice_templates!parent_template_id(id, vk_preis_manuell, ist_set, aufschlag_prozent, ust_satz)")
            .in("component_template_id", affectedMaterialIds);
          const setsToRecalc = new Map<string, { aufschlag: number; ust: number }>();
          for (const row of (parentLinks as any[] || [])) {
            const p = row.parent;
            if (p?.ist_set && p?.vk_preis_manuell === false) {
              setsToRecalc.set(p.id, {
                aufschlag: Number(p.aufschlag_prozent) || 0,
                ust: Number(p.ust_satz) || 20,
              });
            }
          }
          for (const [setId, meta] of setsToRecalc) {
            // Alle Komponenten dieses Sets + deren aktueller EK laden
            const { data: comps } = await (supabase as any)
              .from("invoice_template_components")
              .select("menge, component:invoice_templates!component_template_id(ek_netto, einzelpreis, netto_preis)")
              .eq("parent_template_id", setId);
            let sumEk = 0;
            for (const c of (comps as any[] || [])) {
              const cVk = Number(c.component?.vk_netto ?? c.component?.netto_preis ?? c.component?.einzelpreis) || 0;
              const cEk = Number(c.component?.ek_netto ?? cVk) || 0;
              sumEk += cEk * (Number(c.menge) || 0);
            }
            const autoVk = Math.round(sumEk * (1 + meta.aufschlag / 100) * 100) / 100;
            await supabase.from("invoice_templates").update({
              vk_netto: autoVk,
              netto_preis: autoVk,
              einzelpreis: autoVk,
              brutto_preis: Math.round(autoVk * (1 + meta.ust / 100) * 100) / 100,
            }).eq("id", setId);
          }
        }
      }

      toast({
        title: "Preise angepasst",
        description: `${updated.length} Einträge${rippleCount > 0 ? ` + ${rippleCount} Set(s) nachkalkuliert` : ""}.`,
      });
      onApplied();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Anpassung fehlgeschlagen", description: err.message });
    } finally {
      setApplying(false);
    }
  };

  const opLabel = operator === "prozent"
    ? `${numValue >= 0 ? "+" : ""}${numValue} %`
    : `${numValue >= 0 ? "+" : "-"}€ ${eur(Math.abs(numValue))}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !applying && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Preise anpassen (Bulk)
          </DialogTitle>
          <DialogDescription>
            Filter auswählen → Operator setzen → Preview prüfen → Anwenden.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Lädt Katalog...</p>
        ) : (
          <div className="space-y-4">
            {/* Filter */}
            <div className="border rounded-lg p-3 space-y-3">
              <Label className="text-sm font-medium">Filter</Label>

              <div>
                <Label className="text-xs text-muted-foreground">Typ</Label>
                <Select value={filterTyp} onValueChange={(v) => setFilterTyp(v as TypFilter)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle (Materialien + Sets)</SelectItem>
                    <SelectItem value="materialien">Nur Materialien</SelectItem>
                    <SelectItem value="sets">Nur Sets</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Kategorie {filterKategorien.size > 0 && <span>({filterKategorien.size} gewählt)</span>}
                </Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {kategorien.map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleKat(k)}
                      className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                        filterKategorien.has(k)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-accent"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                  {kategorien.length === 0 && <span className="text-xs text-muted-foreground italic">Keine Kategorien</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Keine Auswahl = alle Kategorien.
                </p>
              </div>

              {lieferanten.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Lieferant {filterLieferanten.size > 0 && <span>({filterLieferanten.size} gewählt)</span>}
                  </Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {lieferanten.map(l => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => toggleLief(l)}
                        className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                          filterLieferanten.has(l)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-accent"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {/* <div> (Badge) darf nicht in <p> stehen — React meldete
                    sonst bei jedem Öffnen eine validateDOMNesting-Warnung. */}
                <div className="text-xs flex items-center gap-1">
                  <Badge variant="secondary">{filtered.length}</Badge> Material(ien) in der Auswahl.
                </div>
                {/* Materialien zur gewählten Kategorie/Filter direkt anzeigen —
                    sofort sichtbar, noch bevor ein Wert eingegeben wird. */}
                {(filterKategorien.size > 0 || filterLieferanten.size > 0 || filterTyp !== "alle") && filtered.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-md border bg-background divide-y">
                    {filtered.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
                        <span className="truncate flex items-center gap-1">
                          {r.kurzbezeichnung || r.name}
                          {r.ist_set && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">Set</Badge>}
                        </span>
                        <span className="font-mono text-muted-foreground shrink-0">
                          EK €{eur(r.ek_netto)} · VK €{eur(r.vk_netto)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Operator */}
            <div className="border rounded-lg p-3 space-y-3">
              <Label className="text-sm font-medium">Änderung</Label>

              <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">Art</Label>
                  <div className="flex border rounded-md overflow-hidden h-9">
                    <button
                      type="button"
                      className={`px-3 flex items-center gap-1 transition-colors ${operator === "prozent" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      onClick={() => setOperator("prozent")}
                    >
                      <Percent className="w-3.5 h-3.5" /> %
                    </button>
                    <button
                      type="button"
                      className={`px-3 flex items-center gap-1 transition-colors ${operator === "euro" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      onClick={() => setOperator("euro")}
                    >
                      <Euro className="w-3.5 h-3.5" /> €
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Wert</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={operator === "prozent" ? "z. B. 5 für +5%" : "z. B. 2,50"}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Ziel</Label>
                  <Select value={target} onValueChange={(v) => setTarget(v as TargetField)}>
                    <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vk">VK</SelectItem>
                      <SelectItem value="ek">EK</SelectItem>
                      <SelectItem value="beide">EK + VK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Negative Werte zulässig (z. B. <code>-10</code> für Preissenkung).
              </p>
            </div>

            {/* Ripple-Warnung */}
            {rippleCount > 0 && (
              <div className="flex items-start gap-2 text-xs border border-amber-300 bg-amber-50 rounded-lg p-3">
                <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <b>{rippleCount} Set(s) mit Auto-VK</b> werden nach dem Update neu kalkuliert —
                  ihre Komponenten-EKs ändern sich.
                  Sets mit manuellem VK bleiben unverändert (Marge verschiebt sich entsprechend).
                </div>
              </div>
            )}

            {/* Preview */}
            {numValue !== 0 && (
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Vorschau</Label>
                  <Badge variant={totalChanged > 0 ? "default" : "secondary"}>
                    {totalChanged} {totalChanged === 1 ? "Änderung" : "Änderungen"} ({opLabel})
                  </Badge>
                </div>
                {preview.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Keine Änderungen — Filter oder Wert prüfen.</p>
                ) : (
                  <div className="space-y-0.5 text-xs font-mono max-h-64 overflow-y-auto">
                    {preview.map(p => (
                      <div key={p.id} className="grid grid-cols-[1fr_auto_auto] gap-3 py-0.5 border-b last:border-b-0">
                        <span className="font-sans truncate" title={p.name}>
                          {p.kurzbezeichnung || p.name}
                          {p.ist_set && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 h-3.5">Set</Badge>}
                        </span>
                        {(target === "ek" || target === "beide") && (
                          <span className="text-muted-foreground">
                            EK: € {eur(p.ek_netto)} → <span className="text-foreground">€ {eur(p.newEk)}</span>
                          </span>
                        )}
                        {(target === "vk" || target === "beide") && (
                          <span className="text-muted-foreground">
                            VK: € {eur(p.vk_netto)} → <span className="text-foreground">€ {eur(p.newVk)}</span>
                          </span>
                        )}
                      </div>
                    ))}
                    {totalChanged > preview.length && (
                      <p className="text-[10px] text-muted-foreground italic pt-2">
                        … und {totalChanged - preview.length} weitere.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!numValue && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="w-4 h-4" />
                Bitte einen Wert &gt; 0 (oder &lt; 0) eingeben, um die Vorschau zu sehen.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Abbrechen
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || loading || !numValue || totalChanged === 0}
            className="gap-2"
          >
            {applying ? "Wird angewendet..." : `Auf ${totalChanged} Einträge anwenden`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
