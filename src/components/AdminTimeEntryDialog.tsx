import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Loader2, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Voll-editierbarer Zeit-Eintrag-Dialog für Admins.
 *
 * Modes:
 *   create — neuer Eintrag für einen beliebigen Mitarbeiter (Nachtrag).
 *            Schreibt nachgetragen_von + nachgetragen_am automatisch.
 *   edit   — bestehender Eintrag (eigener oder fremder).
 *
 * Der Dialog arbeitet bewusst OHNE worker_links-Kaskade: Änderungen
 * wirken nur auf den ausgewählten Eintrag. Team-Partner müssen bei
 * Bedarf einzeln bearbeitet werden.
 */

export interface AdminTimeEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Zielmitarbeiter (erforderlich bei create). */
  userId: string;
  /** Datum für neuen Eintrag (bei create). Bei edit aus Eintrag geladen. */
  datum?: string;
  /** Bestehender Eintrag zum Bearbeiten. Wenn null: create-Mode. */
  entryId?: string | null;
  /** Name des Mitarbeiters (nur für Dialog-Titel). */
  employeeLabel?: string;
}

interface ProjectOpt { id: string; name: string; adresse?: string | null }
interface VehicleOpt { id: string; bezeichnung: string; kennzeichen?: string | null }
interface KfzRow {
  id?: string;
  vehicle_id: string;
  modus: "gefahren" | "start_ende";
  km_gefahren: string;
  km_start: string;
  km_ende: string;
}

const LOCATION_OPTIONS = [
  { value: "baustelle", label: "Baustelle" },
  { value: "werkstatt", label: "Werkstatt" },
  { value: "regie",     label: "Regie / Büro" },
];

const ABWESENHEITS_TAETIGKEITEN = new Set(["Urlaub", "Krankenstand", "Weiterbildung", "Zeitausgleich", "Feiertag"]);

export function AdminTimeEntryDialog({
  open, onClose, onSaved, userId, datum, entryId, employeeLabel,
}: AdminTimeEntryDialogProps) {
  const { toast } = useToast();
  const isEdit = !!entryId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [isAbsence, setIsAbsence] = useState(false);

  const [form, setForm] = useState({
    datum: datum || new Date().toISOString().slice(0, 10),
    project_id: "",
    location_type: "baustelle" as "baustelle" | "werkstatt" | "regie",
    start_time: "07:00",
    end_time: "15:30",
    pause_minutes: 30,
    stunden: 8,
    taetigkeit: "",
    wetterschicht_stunden: "",
    notizen: "",
  });
  const [kfzRows, setKfzRows] = useState<KfzRow[]>([]);
  const [originalKfzIds, setOriginalKfzIds] = useState<string[]>([]);

  // Stammdaten + ggf. Eintrag laden
  useEffect(() => {
    if (!open) return;
    void (async () => {
      setLoading(true);
      try {
        const [projRes, vehRes] = await Promise.all([
          supabase.from("projects").select("id, name, adresse").not("status", "eq", "Abgeschlossen").order("name"),
          (supabase.from("vehicles" as never) as any).select("id, bezeichnung, kennzeichen").eq("is_active", true).order("bezeichnung"),
        ]);
        setProjects(((projRes.data as any[]) || []).map(p => ({ id: p.id, name: p.name, adresse: p.adresse })));
        setVehicles(((vehRes.data as any[]) || []).map((v: any) => ({ id: v.id, bezeichnung: v.bezeichnung, kennzeichen: v.kennzeichen })));

        if (isEdit && entryId) {
          const { data } = await supabase
            .from("time_entries")
            .select("*, time_entry_vehicles(id, vehicle_id, modus, km_gefahren, km_start, km_ende)")
            .eq("id", entryId)
            .maybeSingle();
          if (data) {
            const d: any = data;
            setForm({
              datum: d.datum,
              project_id: d.project_id || "",
              location_type: (d.location_type || "baustelle"),
              start_time: (d.start_time || "07:00").slice(0, 5),
              end_time: (d.end_time || "15:30").slice(0, 5),
              pause_minutes: d.pause_minutes ?? 30,
              stunden: Number(d.stunden) || 0,
              taetigkeit: d.taetigkeit || "",
              wetterschicht_stunden: d.wetterschicht_stunden != null ? String(d.wetterschicht_stunden) : "",
              notizen: d.notizen || "",
            });
            setIsAbsence(ABWESENHEITS_TAETIGKEITEN.has((d.taetigkeit || "").trim()));
            const kfz = ((d.time_entry_vehicles as any[]) || []).map((k: any) => ({
              id: k.id,
              vehicle_id: k.vehicle_id,
              modus: k.modus || "gefahren",
              km_gefahren: k.km_gefahren != null ? String(k.km_gefahren) : "",
              km_start: k.km_start != null ? String(k.km_start) : "",
              km_ende: k.km_ende != null ? String(k.km_ende) : "",
            }));
            setKfzRows(kfz);
            setOriginalKfzIds(kfz.map(k => k.id).filter(Boolean) as string[]);
          }
        } else {
          // Reset auf create-Defaults
          setForm({
            datum: datum || new Date().toISOString().slice(0, 10),
            project_id: "",
            location_type: "baustelle",
            start_time: "07:00",
            end_time: "15:30",
            pause_minutes: 30,
            stunden: 8,
            taetigkeit: "",
            wetterschicht_stunden: "",
            notizen: "",
          });
          setKfzRows([]);
          setOriginalKfzIds([]);
          setIsAbsence(false);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, entryId, datum, isEdit]);

  // Stunden auto-berechnen, sofern User nicht manuell überschreibt
  const recalcStunden = (start: string, end: string, pause: number): number => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const totalMin = (eh * 60 + em) - (sh * 60 + sm) - (pause || 0);
    return Math.max(0, Math.round(totalMin / 60 * 100) / 100);
  };

  const updateTimeField = (field: "start_time" | "end_time" | "pause_minutes", value: string | number) => {
    setForm(prev => {
      const next = { ...prev, [field]: value } as typeof prev;
      next.stunden = recalcStunden(next.start_time, next.end_time, Number(next.pause_minutes));
      return next;
    });
  };

  const addKfzRow = () => {
    setKfzRows(prev => [...prev, { vehicle_id: "", modus: "gefahren", km_gefahren: "", km_start: "", km_ende: "" }]);
  };
  const updateKfzRow = (idx: number, patch: Partial<KfzRow>) => {
    setKfzRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };
  const removeKfzRow = (idx: number) => {
    setKfzRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!userId) return;
    if (isAbsence) {
      toast({
        variant: "destructive",
        title: "Abwesenheit nicht editierbar",
        description: "Urlaub, Krankenstand, ZA etc. müssen über den normalen Abwesenheits-Flow bearbeitet werden — sonst läuft das Zeitkonto auseinander.",
        duration: 7000,
      });
      return;
    }
    if (!form.taetigkeit.trim()) {
      toast({ variant: "destructive", title: "Tätigkeit fehlt" });
      return;
    }
    if (form.location_type === "baustelle" && !form.project_id) {
      toast({ variant: "destructive", title: "Projekt fehlt", description: "Bei Baustelle ist ein Projekt erforderlich." });
      return;
    }

    setSaving(true);
    try {
      const { data: { user: caller } } = await supabase.auth.getUser();
      const callerId = caller?.id;

      const payload: any = {
        datum: form.datum,
        project_id: form.location_type === "baustelle" ? (form.project_id || null) : null,
        location_type: form.location_type,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        pause_minutes: Number(form.pause_minutes) || 0,
        stunden: Number(form.stunden) || 0,
        taetigkeit: form.taetigkeit.trim(),
        wetterschicht_stunden: form.location_type === "baustelle" && form.wetterschicht_stunden
          ? Number(form.wetterschicht_stunden) : null,
        notizen: form.notizen?.trim() || null,
      };

      let targetId = entryId || "";

      if (isEdit && entryId) {
        const { error } = await supabase.from("time_entries").update(payload).eq("id", entryId);
        if (error) throw error;
      } else {
        // Create: Audit-Felder nur setzen, wenn Admin für FREMDEN User einträgt
        const adminIsTarget = callerId === userId;
        const { data: ins, error } = await supabase.from("time_entries").insert({
          ...payload,
          user_id: userId,
          nachgetragen_von: adminIsTarget ? null : callerId,
          nachgetragen_am: adminIsTarget ? null : new Date().toISOString(),
        }).select("id").single();
        if (error) throw error;
        targetId = (ins as any).id;
      }

      // KFZ-Sync: entferne gelöschte, insert/update die restlichen
      if (targetId) {
        const currentIds = kfzRows.map(k => k.id).filter(Boolean) as string[];
        const toDelete = originalKfzIds.filter(id => !currentIds.includes(id));
        if (toDelete.length > 0) {
          await (supabase.from("time_entry_vehicles" as never) as any).delete().in("id", toDelete);
        }
        for (const k of kfzRows) {
          if (!k.vehicle_id) continue;
          const row: any = {
            vehicle_id: k.vehicle_id,
            modus: k.modus,
            km_gefahren: k.modus === "gefahren"
              ? (k.km_gefahren ? parseInt(k.km_gefahren, 10) : null)
              : (k.km_start && k.km_ende ? parseInt(k.km_ende, 10) - parseInt(k.km_start, 10) : null),
            km_start: k.modus === "start_ende" && k.km_start ? parseInt(k.km_start, 10) : null,
            km_ende:  k.modus === "start_ende" && k.km_ende  ? parseInt(k.km_ende, 10)  : null,
          };
          if (k.id) {
            await (supabase.from("time_entry_vehicles" as never) as any).update(row).eq("id", k.id);
          } else {
            await (supabase.from("time_entry_vehicles" as never) as any).insert({ ...row, time_entry_id: targetId });
          }
        }
      }

      toast({ title: isEdit ? "Eintrag aktualisiert" : "Eintrag nachgetragen" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Speichern fehlgeschlagen" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entryId) return;
    if (!window.confirm("Diesen Zeit-Eintrag endgültig löschen? KFZ-Daten werden mit entfernt.")) return;
    setSaving(true);
    try {
      // CASCADE entfernt time_entry_vehicles automatisch
      const { error } = await supabase.from("time_entries").delete().eq("id", entryId);
      if (error) throw error;
      toast({ title: "Eintrag gelöscht" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? "Zeit-Eintrag bearbeiten" : "Zeit-Eintrag nachtragen"}
            {employeeLabel && <Badge variant="secondary">{employeeLabel}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Änderungen wirken nur auf diesen Eintrag. Team-Partner (wenn vorhanden) bleiben unberührt."
              : "Der Eintrag wird als Admin-Nachtrag markiert (Audit-Trail). Für Abwesenheiten bitte den normalen Flow nutzen."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {isAbsence && (
              <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3">
                Dieser Eintrag ist eine Abwesenheit ({form.taetigkeit}). Zur Vermeidung von Zeitkonto-
                Inkonsistenzen (Urlaub / ZA / Krankenstand) ist die Bearbeitung hier gesperrt — bitte
                den Eintrag löschen und über den Abwesenheits-Flow neu anlegen.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>Datum</Label>
                <Input
                  type="date"
                  value={form.datum}
                  onChange={(e) => setForm(f => ({ ...f, datum: e.target.value }))}
                  disabled={isAbsence}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Select
                  value={form.location_type}
                  onValueChange={(v) => setForm(f => ({ ...f, location_type: v as any, project_id: v !== "baustelle" ? "" : f.project_id }))}
                  disabled={isAbsence}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOCATION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.location_type === "baustelle" && (
                <div>
                  <Label>Projekt *</Label>
                  <Select
                    value={form.project_id || "_"}
                    onValueChange={(v) => setForm(f => ({ ...f, project_id: v === "_" ? "" : v }))}
                    disabled={isAbsence}
                  >
                    <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">—</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label>Start</Label>
                <Input type="time" value={form.start_time} onChange={(e) => updateTimeField("start_time", e.target.value)} disabled={isAbsence} />
              </div>
              <div>
                <Label>Ende</Label>
                <Input type="time" value={form.end_time} onChange={(e) => updateTimeField("end_time", e.target.value)} disabled={isAbsence} />
              </div>
              <div>
                <Label>Pause (Min)</Label>
                <Input type="number" min={0} max={600} value={form.pause_minutes}
                  onChange={(e) => updateTimeField("pause_minutes", Number(e.target.value) || 0)}
                  disabled={isAbsence}
                />
              </div>
              <div>
                <Label>Stunden</Label>
                <Input type="number" min={0} step={0.25} value={form.stunden}
                  onChange={(e) => setForm(f => ({ ...f, stunden: Number(e.target.value) || 0 }))}
                  disabled={isAbsence}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Auto aus Start/End/Pause, manuell überschreibbar.</p>
              </div>
            </div>

            <div>
              <Label>Tätigkeit *</Label>
              <Input
                value={form.taetigkeit}
                onChange={(e) => setForm(f => ({ ...f, taetigkeit: e.target.value }))}
                placeholder="z. B. Montage, Verkabelung, Abnahme..."
                disabled={isAbsence}
              />
            </div>

            {form.location_type === "baustelle" && (
              <div>
                <Label>Wetterschicht-Stunden (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  value={form.wetterschicht_stunden}
                  onChange={(e) => setForm(f => ({ ...f, wetterschicht_stunden: e.target.value }))}
                  disabled={isAbsence}
                />
              </div>
            )}

            {/* KFZ-Zeilen */}
            <div className="border rounded-lg p-3 bg-muted/10 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Car className="w-4 h-4" /> Fahrzeuge (optional)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addKfzRow} disabled={isAbsence || vehicles.length === 0}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> KFZ
                </Button>
              </div>
              {kfzRows.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Keine Fahrzeuge erfasst.</p>
              ) : (
                kfzRows.map((k, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_110px_1fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-[10px]">Fahrzeug</Label>
                      <Select value={k.vehicle_id || "_"} onValueChange={(v) => updateKfzRow(idx, { vehicle_id: v === "_" ? "" : v })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Wählen" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">—</SelectItem>
                          {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.bezeichnung}{v.kennzeichen ? ` (${v.kennzeichen})` : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Modus</Label>
                      <Select value={k.modus} onValueChange={(v) => updateKfzRow(idx, { modus: v as any })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gefahren">km gefahren</SelectItem>
                          <SelectItem value="start_ende">Start/Ende</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-1">
                      {k.modus === "gefahren" ? (
                        <Input type="number" min={0} placeholder="km"
                          value={k.km_gefahren}
                          onChange={(e) => updateKfzRow(idx, { km_gefahren: e.target.value })}
                          className="h-8"
                        />
                      ) : (
                        <>
                          <Input type="number" min={0} placeholder="Start"
                            value={k.km_start}
                            onChange={(e) => updateKfzRow(idx, { km_start: e.target.value })}
                            className="h-8"
                          />
                          <Input type="number" min={0} placeholder="Ende"
                            value={k.km_ende}
                            onChange={(e) => updateKfzRow(idx, { km_ende: e.target.value })}
                            className="h-8"
                          />
                        </>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeKfzRow(idx)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div>
              <Label>Notizen</Label>
              <Textarea value={form.notizen} onChange={(e) => setForm(f => ({ ...f, notizen: e.target.value }))} rows={2} disabled={isAbsence} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 justify-between sm:justify-between">
          <div>
            {isEdit && (
              <Button variant="destructive" onClick={handleDelete} disabled={saving || loading}>
                <Trash2 className="w-4 h-4 mr-1" /> Löschen
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving || loading || isAbsence}>
              {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Speichert...</> : <><Save className="w-4 h-4 mr-1" /> Speichern</>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
