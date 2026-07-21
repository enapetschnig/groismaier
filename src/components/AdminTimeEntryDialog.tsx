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
import { parseDecimal, toNumber, clamp, formatForInput } from "@/lib/num";

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
interface KostenstelleOpt { wert: string; label: string }
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

/**
 * Fallback-Kostenstellen — identisch zu TimeTracking.tsx. Ohne explizite
 * Kostenstelle landete jeder Admin-Nachtrag per DB-Default unter „Baustelle";
 * die Kostenstellen-Auswertung war dadurch falsch.
 */
const KOSTENSTELLEN_FALLBACK: KostenstelleOpt[] = [
  { wert: "baustelle", label: "Baustelle" },
  { wert: "werkstatt", label: "Werkstatt" },
  { wert: "lagerwerkstatt", label: "Lagerwerkstatt" },
  { wert: "lagerplatz", label: "Lagerplatz" },
];

/** Obergrenze für einen einzelnen Zeit-Eintrag (ein Kalendertag hat 24 h). */
const MAX_STUNDEN_PRO_TAG = 24;

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
  const [kostenstellen, setKostenstellen] = useState<KostenstelleOpt[]>(KOSTENSTELLEN_FALLBACK);
  const [isAbsence, setIsAbsence] = useState(false);

  // Zahlenfelder werden als ROHTEXT gehalten (österreichische Schreibweise
  // „8,5" muss tippbar bleiben) und erst beim Speichern über parseDecimal
  // in Zahlen umgesetzt.
  const [form, setForm] = useState({
    datum: datum || new Date().toISOString().slice(0, 10),
    project_id: "",
    kostenstelle: "baustelle",
    location_type: "baustelle" as "baustelle" | "werkstatt" | "regie",
    start_time: "07:00",
    end_time: "15:30",
    pause_minutes: "30",
    stunden: "8",
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
        const [projRes, vehRes, ksRes] = await Promise.all([
          supabase.from("projects").select("id, name, adresse").not("status", "eq", "Abgeschlossen").order("name"),
          // Spalte heißt `aktiv` (nicht is_active) — sonst bleibt die Auswahl leer.
          (supabase.from("vehicles" as never) as any).select("id, bezeichnung, kennzeichen").eq("aktiv", true).order("bezeichnung"),
          // Gleiche Quelle wie die Zeiterfassung der Mitarbeiter.
          (supabase.from("admin_config_options" as never) as any)
            .select("wert, label, sort_order")
            .eq("kategorie", "kostenstelle")
            .eq("is_active", true)
            .order("sort_order"),
        ]);
        setProjects(((projRes.data as any[]) || []).map(p => ({ id: p.id, name: p.name, adresse: p.adresse })));
        setVehicles(((vehRes.data as any[]) || []).map((v: any) => ({ id: v.id, bezeichnung: v.bezeichnung, kennzeichen: v.kennzeichen })));
        const ksList = ((ksRes?.data as any[]) || []).map((o: any) => ({ wert: o.wert as string, label: o.label as string }));
        if (ksList.length > 0) setKostenstellen(ksList);

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
              kostenstelle: d.kostenstelle || "baustelle",
              location_type: (d.location_type || "baustelle"),
              start_time: (d.start_time || "07:00").slice(0, 5),
              end_time: (d.end_time || "15:30").slice(0, 5),
              pause_minutes: formatForInput(Number(d.pause_minutes ?? 30)),
              stunden: formatForInput(Number(d.stunden) || 0),
              taetigkeit: d.taetigkeit || "",
              wetterschicht_stunden: d.wetterschicht_stunden != null ? formatForInput(Number(d.wetterschicht_stunden)) : "",
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
            kostenstelle: "baustelle",
            location_type: "baustelle",
            start_time: "07:00",
            end_time: "15:30",
            pause_minutes: "30",
            stunden: "8",
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

  // Stunden auto-berechnen, sofern User nicht manuell überschreibt.
  // Endzeit vor Startzeit = Schicht über Mitternacht.
  const recalcStunden = (start: string, end: string, pause: number): number => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some(n => !Number.isFinite(n))) return 0;
    let totalMin = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMin < 0) totalMin += 24 * 60;
    totalMin -= Math.max(0, pause || 0);
    return Math.max(0, Math.round(totalMin / 60 * 100) / 100);
  };

  /** Stunden laut Start/Ende/Pause — Referenzwert für die Plausibilisierung. */
  const stundenAusZeiten = (): number =>
    recalcStunden(form.start_time, form.end_time, toNumber(form.pause_minutes, 0));

  const updateTimeField = (field: "start_time" | "end_time" | "pause_minutes", value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value } as typeof prev;
      next.stunden = formatForInput(
        recalcStunden(next.start_time, next.end_time, toNumber(next.pause_minutes, 0)),
      );
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
    if (!form.kostenstelle) {
      toast({ variant: "destructive", title: "Kostenstelle fehlt", description: "Bitte eine Kostenstelle wählen — sonst ist die Kostenstellen-Auswertung falsch." });
      return;
    }

    // Pause plausibilisieren (0 … 12 h) — negative Werte hat die DB bisher
    // durchgelassen bzw. mit einer Postgres-Meldung quittiert.
    const pauseNum = parseDecimal(form.pause_minutes);
    if (pauseNum === null || pauseNum < 0 || pauseNum > 720) {
      toast({
        variant: "destructive",
        title: "Pause unplausibel",
        description: "Bitte eine Pause zwischen 0 und 720 Minuten eintragen.",
      });
      return;
    }

    // Stunden plausibilisieren: > 0 und höchstens 24 h. Vorher war das Feld
    // komplett von Start/Ende entkoppelt — 40 h an einem Tag waren möglich.
    const stundenNum = parseDecimal(form.stunden);
    if (stundenNum === null || stundenNum <= 0 || stundenNum > MAX_STUNDEN_PRO_TAG) {
      toast({
        variant: "destructive",
        title: "Stunden unplausibel",
        description: `Die Stunden müssen zwischen 0,01 und ${MAX_STUNDEN_PRO_TAG} liegen (aktuell: „${form.stunden || "leer"}“). Ein Tag hat nur ${MAX_STUNDEN_PRO_TAG} Stunden.`,
        duration: 7000,
      });
      return;
    }

    const wetterNum = form.wetterschicht_stunden.trim() ? parseDecimal(form.wetterschicht_stunden) : null;
    if (form.wetterschicht_stunden.trim() && (wetterNum === null || wetterNum < 0 || wetterNum > stundenNum)) {
      toast({
        variant: "destructive",
        title: "Wetterschicht unplausibel",
        description: `Die Wetterschicht-Stunden müssen zwischen 0 und den erfassten ${formatForInput(stundenNum)} Stunden liegen.`,
      });
      return;
    }

    // KM-Plausibilität VOR dem Speichern prüfen — die DB lehnt
    // km_ende < km_start seit Migration 20260721090000 hart ab
    // (CHECK tev_km_plausibel); der rohe Postgres-Fehler ist unlesbar.
    for (let i = 0; i < kfzRows.length; i++) {
      const k = kfzRows[i];
      if (!k.vehicle_id) continue;
      const zeile = `Fahrzeug-Zeile ${i + 1}`;
      if (k.modus === "start_ende") {
        const s = k.km_start.trim() ? parseDecimal(k.km_start) : null;
        const e = k.km_ende.trim() ? parseDecimal(k.km_ende) : null;
        if ((k.km_start.trim() && s === null) || (k.km_ende.trim() && e === null)) {
          toast({ variant: "destructive", title: "km-Stand ungültig", description: `${zeile}: Bitte nur Zahlen eintragen.` });
          return;
        }
        if ((s !== null && s < 0) || (e !== null && e < 0)) {
          toast({ variant: "destructive", title: "km-Stand ungültig", description: `${zeile}: Kilometerstände können nicht negativ sein.` });
          return;
        }
        if (s !== null && e !== null && e < s) {
          toast({
            variant: "destructive",
            title: "km-Stand unplausibel",
            description: `${zeile}: Der km-Stand am Ende (${formatForInput(e)}) ist kleiner als am Start (${formatForInput(s)}). Bitte korrigieren.`,
            duration: 7000,
          });
          return;
        }
      } else {
        const g = k.km_gefahren.trim() ? parseDecimal(k.km_gefahren) : null;
        if (k.km_gefahren.trim() && (g === null || g < 0)) {
          toast({ variant: "destructive", title: "km ungültig", description: `${zeile}: Gefahrene Kilometer können nicht negativ sein.` });
          return;
        }
      }
    }

    setSaving(true);
    try {
      const { data: { user: caller } } = await supabase.auth.getUser();
      const callerId = caller?.id;

      const payload: any = {
        datum: form.datum,
        project_id: form.location_type === "baustelle" ? (form.project_id || null) : null,
        // Ohne dieses Feld greift der DB-Default „baustelle" — jeder Nachtrag
        // wäre in der Kostenstellen-Auswertung als Baustelle gelandet.
        kostenstelle: form.kostenstelle,
        location_type: form.location_type,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        pause_minutes: Math.round(pauseNum),
        stunden: stundenNum,
        taetigkeit: form.taetigkeit.trim(),
        wetterschicht_stunden: form.location_type === "baustelle" && wetterNum !== null && wetterNum > 0
          ? wetterNum : null,
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
          // parseDecimal statt parseInt: „1.250" (Tausenderpunkt) wurde von
          // parseInt zu 1 verstümmelt.
          const gef = k.km_gefahren.trim() ? parseDecimal(k.km_gefahren) : null;
          const s = k.km_start.trim() ? parseDecimal(k.km_start) : null;
          const e = k.km_ende.trim() ? parseDecimal(k.km_ende) : null;
          const row: any = {
            vehicle_id: k.vehicle_id,
            modus: k.modus,
            km_gefahren: k.modus === "gefahren"
              ? (gef !== null ? Math.round(gef) : null)
              : (s !== null && e !== null ? Math.round(e - s) : null),
            km_start: k.modus === "start_ende" && s !== null ? Math.round(s) : null,
            km_ende:  k.modus === "start_ende" && e !== null ? Math.round(e) : null,
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
      // DB-CHECKs (z. B. tev_km_plausibel) in Klartext übersetzen — die rohe
      // Postgres-Meldung ist für den Anwender wertlos.
      const raw = String(err?.message || "");
      let text = raw || "Speichern fehlgeschlagen";
      if (/tev_km_plausibel/i.test(raw)) {
        text = "Der km-Stand am Ende darf nicht kleiner sein als am Start.";
      } else if (/violates check constraint|check constraint/i.test(raw)) {
        text = "Die eingegebenen Werte sind unplausibel und wurden von der Datenbank abgelehnt. Bitte Stunden, Pause und Kilometer prüfen.";
      }
      toast({ variant: "destructive", title: "Fehler", description: text });
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
                  onValueChange={(v) => setForm(f => {
                    // Kostenstelle mitziehen — wie in der Zeiterfassung der
                    // Mitarbeiter. Eine bewusst gewählte Nicht-Baustellen-
                    // Kostenstelle (z. B. Lagerplatz) bleibt erhalten.
                    let ks = f.kostenstelle;
                    if (v === "baustelle") {
                      ks = "baustelle";
                    } else if (ks === "baustelle") {
                      ks = kostenstellen.find(k => k.wert !== "baustelle")?.wert || ks;
                    }
                    return { ...f, location_type: v as any, kostenstelle: ks, project_id: v !== "baustelle" ? "" : f.project_id };
                  })}
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
              <div>
                <Label>Kostenstelle *</Label>
                <Select
                  value={form.kostenstelle}
                  onValueChange={(v) => setForm(f => ({
                    ...f,
                    kostenstelle: v,
                    // Grobe Einordnung nachziehen (Baustelle vs. Firma) —
                    // „Regie / Büro" bleibt unberührt.
                    location_type: f.location_type === "regie"
                      ? f.location_type
                      : (v === "baustelle" ? "baustelle" : "werkstatt"),
                    project_id: v === "baustelle" ? f.project_id : "",
                  }))}
                  disabled={isAbsence}
                >
                  <SelectTrigger data-testid="ate-kostenstelle"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                  <SelectContent>
                    {kostenstellen.map(k => <SelectItem key={k.wert} value={k.wert}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-0.5">Steuert die Kostenstellen-Auswertung.</p>
              </div>
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
                <Input type="text" inputMode="decimal" value={form.pause_minutes}
                  onChange={(e) => updateTimeField("pause_minutes", e.target.value)}
                  onBlur={() => {
                    const n = clamp(toNumber(form.pause_minutes, 0), 0, 720);
                    updateTimeField("pause_minutes", formatForInput(Math.round(n)));
                  }}
                  disabled={isAbsence}
                />
              </div>
              <div>
                <Label>Stunden</Label>
                <Input type="text" inputMode="decimal" data-testid="ate-stunden" value={form.stunden}
                  onChange={(e) => setForm(f => ({ ...f, stunden: e.target.value }))}
                  onBlur={() => {
                    // Rohtext erst beim Verlassen normalisieren und auf 0…24 klemmen.
                    const n = parseDecimal(form.stunden);
                    if (n === null) return;
                    setForm(f => ({ ...f, stunden: formatForInput(clamp(n, 0, MAX_STUNDEN_PRO_TAG)) }));
                  }}
                  disabled={isAbsence}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Auto aus Start/End/Pause ({formatForInput(stundenAusZeiten())} h), manuell überschreibbar — max. {MAX_STUNDEN_PRO_TAG} h.
                </p>
                {(() => {
                  const n = parseDecimal(form.stunden);
                  const ausZeiten = stundenAusZeiten();
                  if (n !== null && (n <= 0 || n > MAX_STUNDEN_PRO_TAG)) {
                    return <p className="text-[10px] font-medium text-destructive mt-0.5">Wert muss zwischen 0,01 und {MAX_STUNDEN_PRO_TAG} liegen.</p>;
                  }
                  if (n !== null && ausZeiten > 0 && Math.abs(n - ausZeiten) > 0.01) {
                    return <p className="text-[10px] font-medium text-amber-600 mt-0.5">Weicht von Start/Ende/Pause ab ({formatForInput(ausZeiten)} h).</p>;
                  }
                  return null;
                })()}
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
                  type="text"
                  inputMode="decimal"
                  value={form.wetterschicht_stunden}
                  onChange={(e) => setForm(f => ({ ...f, wetterschicht_stunden: e.target.value }))}
                  onBlur={() => {
                    if (!form.wetterschicht_stunden.trim()) return;
                    const n = parseDecimal(form.wetterschicht_stunden);
                    if (n === null) return;
                    setForm(f => ({ ...f, wetterschicht_stunden: formatForInput(clamp(n, 0, MAX_STUNDEN_PRO_TAG)) }));
                  }}
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
                        <Input type="text" inputMode="decimal" placeholder="km"
                          value={k.km_gefahren}
                          onChange={(e) => updateKfzRow(idx, { km_gefahren: e.target.value })}
                          className="h-8"
                        />
                      ) : (
                        <>
                          <Input type="text" inputMode="decimal" placeholder="Start"
                            value={k.km_start}
                            onChange={(e) => updateKfzRow(idx, { km_start: e.target.value })}
                            className="h-8"
                            aria-label={`km Start Zeile ${idx + 1}`}
                          />
                          <Input type="text" inputMode="decimal" placeholder="Ende"
                            value={k.km_ende}
                            onChange={(e) => updateKfzRow(idx, { km_ende: e.target.value })}
                            className="h-8"
                            aria-label={`km Ende Zeile ${idx + 1}`}
                          />
                        </>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeKfzRow(idx)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                    {/* Sofort-Hinweis: die DB lehnt km_ende < km_start ab. */}
                    {k.modus === "start_ende" && (() => {
                      const s = k.km_start.trim() ? parseDecimal(k.km_start) : null;
                      const e = k.km_ende.trim() ? parseDecimal(k.km_ende) : null;
                      if (s === null || e === null) return null;
                      if (e < s) {
                        return (
                          <p className="col-span-4 text-[11px] font-medium text-destructive">
                            km-Stand Ende ({formatForInput(e)}) ist kleiner als Start ({formatForInput(s)}) — bitte korrigieren.
                          </p>
                        );
                      }
                      return (
                        <p className="col-span-4 text-[11px] text-muted-foreground">Gefahren: {formatForInput(e - s)} km</p>
                      );
                    })()}
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
