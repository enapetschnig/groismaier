import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Clock, Package, Wrench } from "lucide-react";
import { format } from "date-fns";
import { parseDecimal } from "@/lib/num";

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

interface ImportItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  selected: boolean;
  source: "zeit" | "material" | "maschine" | "titel";
}

interface ImportDisturbanceToInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * disturbanceIds: die tatsächlich importierten Regieberichte — der Beleg
   * markiert sie nach dem Speichern als verrechnet (Sammelrechnung).
   */
  onImport: (
    items: { beschreibung: string; menge: number; einheit: string; einzelpreis: number }[],
    kundeData: { kunde_name: string; kunde_adresse?: string; kunde_telefon?: string; kunde_email?: string } | undefined,
    disturbanceIds: string[],
  ) => void;
  preselectedId?: string | null;
  /** Mehrere Berichte vorausgewählt (Sammelrechnung aus der Regie-Liste). */
  preselectedIds?: string[] | null;
}

export function ImportDisturbanceToInvoiceDialog({ open, onClose, onImport, preselectedId, preselectedIds }: ImportDisturbanceToInvoiceDialogProps) {
  const { toast } = useToast();
  const [disturbances, setDisturbances] = useState<Disturbance[]>([]);
  // Auswahl-Phase: Checkboxen in der Liste; danach die Positions-Phase.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailIds, setDetailIds] = useState<string[]>([]);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(false);
  // Standardsatz kommt aus den Einstellungen (app_settings.regie_stundensatz);
  // 70 € ist nur noch der Fallback, wenn der Wert dort fehlt.
  const [stundensatz, setStundensatz] = useState(70);

  // Stabiler Schlüssel statt Array-Referenz: preselectedIds kommt vom Parent
  // bei jedem Render als NEUES Array — als direkte Effect-Dependency würde
  // jeder Parent-Render den Dialog neu laden und laufende Eingaben verwerfen.
  const vorwahlKey = `${preselectedId || ""}|${(preselectedIds || []).join(",")}`;

  useEffect(() => {
    if (open) {
      fetchDisturbances();
      const vorwahl = (preselectedIds && preselectedIds.length > 0)
        ? preselectedIds
        : preselectedId ? [preselectedId] : [];
      setSelectedIds(vorwahl);
      setDetailIds([]);
      setItems([]);
      // Erst den Satz laden, DANN die Positionen bauen — sonst stünde bei
      // vorausgewählten Berichten noch der Fallback-Satz in den Zeit-Zeilen.
      (async () => {
        const { data } = await supabase.from("app_settings").select("value").eq("key", "regie_stundensatz").maybeSingle();
        const satz = parseDecimal(String(data?.value ?? ""));
        const s = satz !== null && satz > 0 ? satz : 70;
        setStundensatz(s);
        if (vorwahl.length > 0) loadDetails(vorwahl, s);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vorwahlKey]);

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

  const toggleBericht = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const loadDetails = async (ids: string[], satzOverride?: number) => {
    const satz = satzOverride ?? stundensatz;
    const newItems: ImportItem[] = [];
    const geladene: Disturbance[] = [];
    const kundenNamen = new Set<string>();
    // Zeit-Zeilen, deren Beschreibung nach dem Namens-Nachladen noch die
    // beteiligten Mitarbeiter bekommt: Item-Index -> user_ids.
    const zeitZeilenMitarbeiter = new Map<number, string[]>();

    // Reihenfolge beibehalten: nacheinander laden (max. ~50 Berichte in der Liste).
    for (const id of ids) {
      const [{ data: dist }, { data: materials }, { data: maschinen }, { data: workers }] = await Promise.all([
        supabase.from("disturbances").select("id, datum, kunde_name, kunde_email, kunde_adresse, kunde_plz, kunde_ort, kunde_telefon, stunden, beschreibung, is_verrechnet, start_time, end_time").eq("id", id).single(),
        supabase.from("disturbance_materials").select("material, menge, einheit, einzelpreis").eq("disturbance_id", id),
        (supabase.from("disturbance_maschinen" as never) as any).select("maschine, menge, einheit, einzelpreis").eq("disturbance_id", id),
        supabase.from("disturbance_workers").select("user_id").eq("disturbance_id", id),
      ]);
      if (!dist) continue;
      geladene.push(dist as any);
      if (dist.kunde_name) kundenNamen.add(dist.kunde_name.trim());

      // Jeder beteiligte Mitarbeiter hat die Berichtsstunden selbst geleistet
      // (die Zeiterfassung bucht sie pro Kopf) — die Rechnung muss also
      // Stunden × Mitarbeiter ausweisen, nicht nur die Stunden des Erstellers.
      // Alte Berichte ohne Mitarbeiter-Zeilen zählen wie bisher einfach.
      const workerIds = (workers || []).map((w) => w.user_id);
      const anzahl = Math.max(1, workerIds.length);

      // Bei einer Sammelrechnung bekommt jeder Bericht eine Titelzeile,
      // damit am Beleg erkennbar bleibt, was zu welchem Einsatz gehört.
      if (ids.length > 1) {
        newItems.push({
          beschreibung: `Regiebericht ${format(new Date(dist.datum), "dd.MM.yyyy")}${dist.beschreibung ? ` — ${dist.beschreibung.slice(0, 80)}` : ""}`,
          menge: 0,
          einheit: "",
          einzelpreis: 0,
          selected: true,
          source: "titel",
        });
      }

      const zeitBeschreibung =
        `Arbeitszeit Regiebericht ${format(new Date(dist.datum), "dd.MM.yyyy")} (${dist.start_time?.slice(0, 5)} - ${dist.end_time?.slice(0, 5)})` +
        (anzahl > 1 ? `, ${anzahl} Mitarbeiter à ${Number(dist.stunden)} Std.` : "");
      newItems.push({
        beschreibung: zeitBeschreibung,
        menge: Number(dist.stunden) * anzahl,
        einheit: "Std.",
        einzelpreis: satz,
        selected: true,
        source: "zeit",
      });
      if (anzahl > 1) zeitZeilenMitarbeiter.set(newItems.length - 1, workerIds);

      (materials || []).forEach(m => {
        newItems.push({
          beschreibung: m.material,
          // parseFloat schneidet bei "2,5" nach dem Komma ab -> 2. Die Menge
          // im Regiebericht ist ein Freitextfeld mit oesterreichischem Komma.
          menge: parseDecimal(m.menge || "") ?? 1,
          einheit: m.einheit || "Stk.",
          einzelpreis: Number(m.einzelpreis) || 0,
          selected: true,
          source: "material",
        });
      });

      // Maschinen/Geräte des Einsatzes — kamen bisher NIE auf die Rechnung.
      ((maschinen as any[]) || []).forEach(ma => {
        newItems.push({
          beschreibung: ma.maschine || "Maschine",
          // Fehlende Menge = 0 statt still 1 — sonst landete eine vergessene
          // Mengenangabe als voller Stundensatz auf der Rechnung (Review-Befund).
          menge: parseDecimal(String(ma.menge ?? "")) ?? 0,
          einheit: ma.einheit || "h",
          einzelpreis: Number(ma.einzelpreis) || 0,
          selected: true,
          source: "maschine",
        });
      });
    }

    // Namen der beteiligten Mitarbeiter in die Zeit-Zeilen schreiben, damit
    // am Beleg nachvollziehbar bleibt, wessen Stunden verrechnet werden.
    // Scheitert das Nachladen, bleibt die Anzahl trotzdem korrekt.
    if (zeitZeilenMitarbeiter.size > 0) {
      const alleIds = [...new Set([...zeitZeilenMitarbeiter.values()].flat())];
      const { data: profile } = await supabase.from("profiles").select("id, vorname, nachname").in("id", alleIds);
      const nameVon = new Map((profile || []).map((p) => [p.id, `${p.vorname || ""} ${p.nachname || ""}`.trim()]));
      for (const [idx, userIds] of zeitZeilenMitarbeiter) {
        const namen = userIds.map((u) => nameVon.get(u)).filter(Boolean).join(", ");
        if (namen) newItems[idx] = { ...newItems[idx], beschreibung: `${newItems[idx].beschreibung} (${namen})` };
      }
    }

    // Berichte, die (noch) nicht in der Liste stehen (z.B. per URL
    // vorausgewählt und älter als die letzten 50), ergänzen.
    setDisturbances(prev => {
      const fehlen = geladene.filter(g => !prev.some(p => p.id === g.id));
      return fehlen.length > 0 ? [...fehlen, ...prev] : prev;
    });
    setItems(newItems);
    setDetailIds(ids);
    // Die Rechnung bekommt die Kundendaten des ERSTEN Berichts — bei
    // gemischten Kunden muss das sichtbar sein, bevor importiert wird.
    if (kundenNamen.size > 1) {
      toast({
        title: "Verschiedene Kunden gewählt",
        description: `Die Berichte gehören zu ${kundenNamen.size} Kunden — die Rechnung übernimmt die Daten des ersten Berichts. Bitte prüfen.`,
        duration: 8000,
      });
    }
  };

  const toggle = (idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const updateField = (idx: number, field: string, val: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const handleImport = async () => {
    // Kundendaten kommen aus dem ERSTEN gewählten Bericht.
    const erster = disturbances.find(d => d.id === detailIds[0]) || disturbances.find(d => detailIds.includes(d.id));
    const selected = items.filter(i => i.selected);

    let kundeData: any = erster ? { kunde_name: erster.kunde_name } : undefined;
    if (erster?.kunde_name) {
      const { data: matchedCustomer } = await supabase
        .from("customers")
        .select("id, name, adresse, plz, ort, land, email, telefon, uid_nummer")
        .ilike("name", `%${erster.kunde_name}%`)
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
        const dist = await supabase
          .from("disturbances")
          .select("kunde_name, kunde_adresse, kunde_plz, kunde_ort, kunde_email, kunde_telefon")
          .eq("id", detailIds[0])
          .maybeSingle();
        const d: any = dist.data || erster;
        kundeData = {
          kunde_name: d.kunde_name,
          kunde_adresse: d.kunde_adresse || "",
          kunde_plz: d.kunde_plz || "",
          kunde_ort: d.kunde_ort || "",
          kunde_email: d.kunde_email || "",
          kunde_telefon: d.kunde_telefon || "",
        };
      }
    }

    onImport(
      selected.map(i => ({ beschreibung: i.beschreibung, menge: i.menge, einheit: i.einheit, einzelpreis: i.einzelpreis })),
      kundeData,
      detailIds,
    );
  };

  const selected = items.filter(i => i.selected);
  const total = selected.reduce((s, i) => s + i.menge * i.einzelpreis, 0);
  const inDetail = detailIds.length > 0;

  const sourceIcon = (s: ImportItem["source"]) =>
    s === "zeit" ? <Clock className="w-3.5 h-3.5 text-blue-500" />
      : s === "maschine" ? <Wrench className="w-3.5 h-3.5 text-slate-500" />
        : s === "titel" ? <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          : <Package className="w-3.5 h-3.5 text-orange-500" />;

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
        ) : !inDetail ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              Regieberichte auswählen — mehrere Häkchen ergeben eine <strong>Sammelrechnung</strong>:
            </p>
            {disturbances.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Keine Regieberichte vorhanden</p>
            ) : (
              disturbances.map(d => (
                <div
                  key={d.id}
                  onClick={() => toggleBericht(d.id)}
                  className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedIds.includes(d.id) ? "border-primary/50 bg-primary/5" : d.is_verrechnet ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.includes(d.id)}
                      onCheckedChange={() => toggleBericht(d.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Regiebericht vom ${format(new Date(d.datum), "dd.MM.yyyy")} auswählen`}
                    />
                    <div className="flex-1 min-w-0">
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
            <Button variant="ghost" size="sm" onClick={() => { setDetailIds([]); setItems([]); }}>
              ← Andere Regieberichte wählen
            </Button>

            {detailIds.length === 1 && (() => {
              const dist = disturbances.find(d => d.id === detailIds[0]);
              return dist?.beschreibung ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-800 mb-1">Durchgeführte Arbeiten:</p>
                  <p className="text-sm text-blue-700">{dist.beschreibung}</p>
                </div>
              ) : null;
            })()}
            {detailIds.length > 1 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-800">
                  Sammelrechnung aus {detailIds.length} Regieberichten — jeder Bericht bekommt eine Titelzeile.
                </p>
              </div>
            )}

            {/* Stundensatz */}
            <div className="flex items-center gap-3 pb-2 border-b">
              <label className="text-sm font-medium whitespace-nowrap">Stundensatz:</label>
              <Input
                type="text"
                inputMode="decimal"
                value={stundensatz}
                onChange={(e) => {
                  // "71,50" darf nicht zu 7150 werden (oesterreichisches Komma)
                  const val = parseDecimal(e.target.value) ?? 0;
                  setStundensatz(val);
                  setItems(prev => prev.map(i => i.source === "zeit" ? { ...i, einzelpreis: val } : i));
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">€/Std. (Standard aus den Einstellungen)</span>
            </div>

            {/* Items */}
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${item.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-3">
                    <Checkbox checked={item.selected} onCheckedChange={() => toggle(idx)} />
                    <div className="flex items-center gap-1.5">
                      {sourceIcon(item.source)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.beschreibung}
                        onChange={(e) => updateField(idx, "beschreibung", e.target.value)}
                        className={`h-7 text-sm ${item.source === "titel" ? "font-semibold" : ""}`}
                      />
                    </div>
                  </div>
                  {item.selected && item.source !== "titel" && (
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

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          {!inDetail && (
            <Button onClick={() => selectedIds.length > 0 && loadDetails(selectedIds)} disabled={selectedIds.length === 0} className="gap-2">
              <FileText className="w-4 h-4" />
              {selectedIds.length > 1 ? `${selectedIds.length} Berichte übernehmen` : "Weiter"}
            </Button>
          )}
          {inDetail && (
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
