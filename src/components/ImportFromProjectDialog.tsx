import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Package, FolderOpen } from "lucide-react";
import { parseDecimal, toNumber, formatForInput } from "@/lib/num";

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


interface ImportItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  selected: boolean;
  source: "zeit" | "material";
  detail?: string;
  /** Roh-Eingaben der Zahlenfelder — damit "12,5" beim Tippen erhalten bleibt. */
  mengeInput?: string;
  preisInput?: string;
}

interface ImportFromProjectDialogProps {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  customerId?: string | null;
  mode?: "zeit" | "material" | "alle";
  onImport: (items: { beschreibung: string; menge: number; einheit: string; einzelpreis: number }[]) => void;
}

export function ImportFromProjectDialog({
  open, onClose, projectId, customerId, mode = "alle", onImport,
}: ImportFromProjectDialogProps) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"zeit" | "material">(mode === "material" ? "material" : "zeit");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [localProjectId, setLocalProjectId] = useState<string | null>(projectId ?? null);

  // Wenn von außen kein Projekt gesetzt ist, laden wir die Liste für Auswahl
  useEffect(() => {
    if (!open) return;
    setLocalProjectId(projectId ?? null);
    if (!projectId) {
      let q = supabase.from("projects").select("id, name")
        .not("status", "eq", "Abgeschlossen").order("name");
      if (customerId) q = q.eq("customer_id", customerId) as any;
      q.then(({ data }) => setProjects((data as any) || []));
    }
  }, [open, projectId, customerId]);

  useEffect(() => {
    if (open && localProjectId) fetchAll();
    else if (open) setItems([]);
  }, [open, localProjectId]);

  const fetchAll = async () => {
    if (!localProjectId) return;
    setLoading(true);

    const [timeItems, materialItems] = await Promise.all([
      mode === "material" ? Promise.resolve([]) : fetchTimeEntries(localProjectId),
      mode === "zeit" ? Promise.resolve([]) : fetchMaterialEntries(localProjectId),
    ]);

    setItems([...timeItems, ...materialItems]);
    setLoading(false);
  };

  const fetchTimeEntries = async (pid: string): Promise<ImportItem[]> => {
    const { data } = await supabase
      .from("time_entries")
      .select("user_id, stunden, taetigkeit")
      .eq("project_id", pid);

    if (!data || data.length === 0) return [];

    const userIds = [...new Set(data.map(e => e.user_id))];
    const [{ data: profiles }, { data: employees }] = await Promise.all([
      (supabase.from("profiles" as never) as any).select("id, vorname, nachname, hidden").in("id", userIds),
      supabase.from("employees").select("user_id, stundenlohn, position").in("user_id", userIds),
    ]);
    // Hidden User (Admin/Inhaber) nicht als Position aufführen
    const visibleProfiles = ((profiles as any[]) || []).filter((p: any) => !p.hidden);

    const empMap = new Map(
      (employees || []).map((e: any) => [e.user_id, { satz: Number(e.stundenlohn) || 45, rolle: e.position || "Monteur" }])
    );

    const profileMap = new Map(
      visibleProfiles.map((p: any) => {
        const emp = empMap.get(p.id) || { satz: 45, rolle: "Monteur" };
        return [p.id, { name: `${p.vorname} ${p.nachname}`, satz: emp.satz, rolle: emp.rolle }];
      })
    );

    // Group by user (hidden User werden ausgefiltert)
    const visibleIds = new Set(visibleProfiles.map((p: any) => p.id));
    const groups = new Map<string, { stunden: number; taetigkeiten: Set<string> }>();
    data.forEach(e => {
      const uid = e.user_id;
      if (!visibleIds.has(uid)) return; // hidden User überspringen
      if (!groups.has(uid)) groups.set(uid, { stunden: 0, taetigkeiten: new Set() });
      const g = groups.get(uid)!;
      g.stunden += Number(e.stunden);
      if (e.taetigkeit) g.taetigkeiten.add(e.taetigkeit);
    });

    return Array.from(groups.entries()).map(([uid, g]) => {
      const p = profileMap.get(uid) || { name: "Unbekannt", satz: 0, rolle: "Monteur" };
      const taetigkeiten = Array.from(g.taetigkeiten).slice(0, 3).join(", ");
      return {
        beschreibung: `Arbeitszeit ${p.name}${taetigkeiten ? ` (${taetigkeiten})` : ""}`,
        menge: Math.round(g.stunden * 100) / 100,
        einheit: "Std.",
        einzelpreis: p.satz,
        selected: g.stunden > 0,
        source: "zeit" as const,
        detail: `${p.rolle} · ${g.stunden.toFixed(1)} Std.`,
      };
    });
  };

  const fetchMaterialEntries = async (pid: string): Promise<ImportItem[]> => {
    // 1. Materialbuchungen des Projekts laden.
    //    FRÜHER: erst `lieferscheine` (Tabelle existiert in dieser Datenbank
    //    gar nicht → Query lief in einen Fehler, der verschluckt wurde), dann
    //    material_entries über lieferschein_id. Ergebnis: der Material-Import
    //    war IMMER leer ("Keine Lieferscheine gefunden"), obwohl auf dem
    //    Projekt Entnahmen gebucht waren. Die Materialliste (MaterialList.tsx)
    //    schreibt material_entries mit project_id — genau danach wird jetzt
    //    gefragt.
    const { data: entries, error: entriesError } = await supabase
      .from("material_entries")
      .select("material, menge, einheit, typ, einzelpreis")
      .eq("project_id", pid);

    if (entriesError) {
      console.error("Materialbuchungen konnten nicht geladen werden:", entriesError);
      return [];
    }
    if (!entries || entries.length === 0) return [];

    // 2. Load Angebot prices for this project
    const { data: angebote } = await supabase.from("invoices")
      .select("id").eq("project_id", pid).eq("typ", "angebot")
      .not("status", "eq", "storniert")
      .order("datum", { ascending: false }).limit(1);
    let angebotMap = new Map<string, { einzelpreis: number; menge: number; einheit: string }>();
    if (angebote?.[0]) {
      const { data: angebotItems } = await supabase.from("invoice_items")
        .select("beschreibung, kurztext, menge, einheit, einzelpreis")
        .eq("invoice_id", angebote[0].id);
      if (angebotItems) {
        angebotItems.forEach(ai => {
          const key = ((ai as any).kurztext || ai.beschreibung).toLowerCase().trim();
          angebotMap.set(key, { einzelpreis: Number(ai.einzelpreis), menge: Number(ai.menge), einheit: ai.einheit || "Stk." });
        });
      }
    }

    // 3. Buchungen je Material zusammenzählen
    type MatSumme = { material: string; einheit: string; entnommen: number; zurueck: number; storedPreis: number };
    const map = new Map<string, MatSumme>();
    entries.forEach(e => {
      const key = (e.material || "").toLowerCase().trim();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { material: e.material, einheit: e.einheit || "Stk.", entnommen: 0, zurueck: 0, storedPreis: 0 });
      }
      const s = map.get(key)!;
      // Menge steht als Text in der DB ("12,5 lfm") → deutsches Komma verstehen
      const menge = toNumber(String(e.menge ?? "").replace(/[^\d,.\-]/g, ""), 0);
      if (e.typ === "rueckgabe") s.zurueck += menge;
      else s.entnommen += menge; // 'entnahme' und Alt-Buchungen ohne typ
      // Bester bekannter Preis aus der Buchung (Katalogpreis beim Entnehmen)
      const ep = toNumber(e.einzelpreis, 0);
      if (ep > 0 && s.storedPreis === 0) s.storedPreis = ep;
    });

    return Array.from(map.values())
      .filter(s => s.entnommen - s.zurueck > 0)
      .map(s => {
        const verbraucht = Math.round((s.entnommen - s.zurueck) * 100) / 100;
        const angebot = angebotMap.get(s.material.toLowerCase().trim());
        return {
          beschreibung: s.material,
          menge: verbraucht,
          einheit: s.einheit,
          einzelpreis: angebot?.einzelpreis || s.storedPreis || 0,
          selected: true,
          source: "material" as const,
          detail: angebot
            ? `Angebot: ${angebot.menge} ${angebot.einheit} · Verbraucht: ${verbraucht} ${s.einheit} · Preis aus Angebot`
            : `Verbraucht: ${verbraucht} ${s.einheit} · Kein Angebotspreis`,
        };
      })
      .sort((a, b) => a.beschreibung.localeCompare(b.beschreibung));
  };

  const toggle = (idx: number) => {
    setItems(prev => prev.map((m, i) => i === idx ? { ...m, selected: !m.selected } : m));
  };

  const updateField = (idx: number, field: "menge" | "einzelpreis" | "einheit" | "beschreibung", val: any) => {
    setItems(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  };

  /**
   * Zahlenfeld-Eingabe: Roh-Text merken + über parseDecimal in die Zahl
   * umrechnen. Vorher lief das über <Input type="number"> + Number() —
   * damit wurde aus "12,5" beim Tippen 125 bzw. gar nichts.
   */
  const updateNumField = (idx: number, field: "menge" | "einzelpreis", raw: string) => {
    const inputKey = field === "menge" ? "mengeInput" : "preisInput";
    setItems(prev => prev.map((m, i) => i === idx
      ? { ...m, [inputKey]: raw, [field]: parseDecimal(raw) ?? 0 }
      : m));
  };

  const blurNumField = (idx: number, field: "menge" | "einzelpreis") => {
    const inputKey = field === "menge" ? "mengeInput" : "preisInput";
    setItems(prev => prev.map((m, i) => i === idx
      ? { ...m, [inputKey]: formatForInput(m[field], field === "menge" ? undefined : 2) }
      : m));
  };

  const handleImport = () => {
    const selected = items
      .filter(m => m.selected)
      .map(m => ({
        beschreibung: m.beschreibung,
        menge: m.menge,
        einheit: m.einheit,
        einzelpreis: m.einzelpreis,
      }));
    onImport(selected);
  };

  const zeitItems = items.filter(i => i.source === "zeit");
  const matItems = items.filter(i => i.source === "material");
  const selected = items.filter(i => i.selected);
  const total = selected.reduce((s, i) => s + i.menge * i.einzelpreis, 0);

  const renderItem = (item: ImportItem, globalIdx: number) => (
    <div key={globalIdx} className={`p-3 rounded-lg border ${item.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
      <div className="flex items-center gap-3">
        <Checkbox className="h-5 w-5" checked={item.selected} onCheckedChange={() => toggle(globalIdx)} aria-label={`${item.beschreibung} auswählen`} />
        <div className="flex-1 min-w-0">
          <Input
            value={item.beschreibung}
            onChange={(e) => updateField(globalIdx, "beschreibung", e.target.value)}
            className="font-medium text-sm h-9 mb-1"
          />
          <p className="text-xs text-muted-foreground">{item.detail}</p>
        </div>
      </div>
      {item.selected && (
        <div className="flex flex-wrap items-center gap-2 mt-2 sm:ml-9">
          <div className="flex items-center gap-1">
            <Input
              type="text"
              inputMode="decimal"
              value={item.mengeInput ?? formatForInput(item.menge)}
              onChange={(e) => updateNumField(globalIdx, "menge", e.target.value)}
              onBlur={() => blurNumField(globalIdx, "menge")}
              className="w-20 h-9 text-right text-sm"
              aria-label="Menge"
            />
            <span className="text-xs text-muted-foreground w-10">{item.einheit}</span>
          </div>
          <span className="text-xs text-muted-foreground">×</span>
          <div className="flex items-center gap-1">
            <Input
              type="text"
              inputMode="decimal"
              value={item.preisInput ?? formatForInput(item.einzelpreis, 2)}
              onChange={(e) => updateNumField(globalIdx, "einzelpreis", e.target.value)}
              onBlur={() => blurNumField(globalIdx, "einzelpreis")}
              className="w-24 h-9 text-right text-sm"
              placeholder="0,00"
              aria-label="Einzelpreis"
            />
            <span className="text-xs text-muted-foreground">€/{item.einheit}</span>
          </div>
          <span className="text-sm font-medium ml-auto whitespace-nowrap">
            = € {eur(item.menge * item.einzelpreis)}
          </span>
        </div>
      )}
    </div>
  );

  const title = mode === "zeit"
    ? "Arbeitszeiten aus Projekt importieren"
    : mode === "material"
      ? "Material aus Projekt importieren"
      : "Aus Projekt importieren";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Projekt-Auswahl — nur wenn von außen keins vorgegeben */}
        {!projectId && (
          <div className="space-y-1.5">
            <Label>Projekt</Label>
            <Select
              value={localProjectId || ""}
              onValueChange={(v) => setLocalProjectId(v)}
            >
              <SelectTrigger><SelectValue placeholder="Projekt auswählen…" /></SelectTrigger>
              <SelectContent>
                {projects.length === 0 && (
                  <SelectItem value="_none" disabled>Keine aktiven Projekte</SelectItem>
                )}
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {mode !== "zeit" && (
          <p className="text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-md p-2">
            Materialien aus dem tatsächlichen Verbrauch (Entnahmen minus Rückgaben in der Materialliste des Projekts). Preise kommen — wenn vorhanden — aus dem Angebot, sonst aus der Buchung.
          </p>
        )}
        {mode === "zeit" && (
          <p className="text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-md p-2">
            Arbeitszeiten aus den Zeitbuchungen dieses Projekts. Pro Mitarbeiter aggregiert. Beschreibung und Preis kannst du anpassen bevor du importierst.
          </p>
        )}

        {!localProjectId ? (
          <p className="text-center py-8 text-muted-foreground">
            Bitte zuerst ein Projekt auswählen.
          </p>
        ) : loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt Projektdaten...</p>
        ) : items.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            {mode === "zeit"
              ? "Keine Arbeitszeiten auf diesem Projekt gebucht."
              : mode === "material"
                ? "Keine Materialbuchungen für dieses Projekt gefunden."
                : "Keine Arbeitszeiten oder Materialbuchungen für dieses Projekt gefunden."}
          </p>
        ) : (
          <>
            {mode === "alle" ? (
              <Tabs value={tab} onValueChange={(v) => setTab(v as "zeit" | "material")}>
                <TabsList className="grid w-full grid-cols-2 h-auto">
                  <TabsTrigger value="zeit" className="gap-2 min-h-11 sm:min-h-0">
                    <Clock className="w-4 h-4" />
                    Arbeitszeit ({zeitItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="material" className="gap-2 min-h-11 sm:min-h-0">
                    <Package className="w-4 h-4" />
                    Material ({matItems.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="zeit" className="space-y-2 mt-3">
                  {zeitItems.length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground text-sm">Keine Arbeitszeiten gebucht</p>
                  ) : (
                    zeitItems.map((item) => {
                      const globalIdx = items.indexOf(item);
                      return renderItem(item, globalIdx);
                    })
                  )}
                </TabsContent>

                <TabsContent value="material" className="space-y-2 mt-3">
                  {matItems.length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground text-sm">Keine Materialbuchungen gefunden</p>
                  ) : (
                    matItems.map((item) => {
                      const globalIdx = items.indexOf(item);
                      return renderItem(item, globalIdx);
                    })
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-2 mt-1">
                {(mode === "zeit" ? zeitItems : matItems).map((item) => {
                  const globalIdx = items.indexOf(item);
                  return renderItem(item, globalIdx);
                })}
              </div>
            )}

            {/* Summary */}
            <div className="flex items-center justify-between pt-3 border-t text-sm">
              <span className="text-muted-foreground">
                {selected.length} Positionen ausgewählt
              </span>
              <span className="font-bold">Gesamt: € {eur(total)}</span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleImport} disabled={selected.length === 0} className="gap-2">
            <FolderOpen className="w-4 h-4" />
            {selected.length > 0 ? `${selected.length} Positionen importieren` : "Importieren"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
