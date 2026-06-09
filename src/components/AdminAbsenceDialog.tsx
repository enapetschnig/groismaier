// AdminAbsenceDialog — Admin trägt Urlaub/Krankenstand/Zeitausgleich/
// Feiertag/Weiterbildung für einen Mitarbeiter über einen Datumsbereich
// nach. Pro Werktag im Bereich (Mo-Do, Tagessoll>0) wird ein
// time_entry mit Sonderzeit-Tätigkeit angelegt; zusätzlich ein
// leave_request mit status='genehmigt', damit die Plantafel den Block
// markiert. Bei Zeitausgleich wird zusätzlich eine
// time_account_transactions-Buchung mit Abzug des Gesamt-Tagessolls
// angelegt — analog zum bestehenden Self-Service-Pfad in
// TimeTracking.tsx.
//
// Aufgerufen von HoursReport (Admin-Header). Konflikt-Check vor dem
// Speichern: Wenn an einzelnen Tagen schon Buchungen existieren,
// wird eine Liste angezeigt und der Admin bestätigt explizit. Beide
// Einträge bleiben dann nebeneinander — der Saldo-Helper neutralisiert
// den Tag durch Sonderzeit-Regel.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getNormalWorkingHours } from "@/lib/workingHours";
import { format } from "date-fns";

type AbsenceType = "Urlaub" | "Krankenstand" | "Zeitausgleich" | "Feiertag" | "Weiterbildung";

const TYPE_OPTIONS: { value: AbsenceType; label: string; leaveTypeKey: string }[] = [
  { value: "Urlaub",        label: "Urlaub",        leaveTypeKey: "urlaub" },
  { value: "Krankenstand",  label: "Krankenstand",  leaveTypeKey: "krankenstand" },
  { value: "Zeitausgleich", label: "Zeitausgleich", leaveTypeKey: "za" },
  { value: "Feiertag",      label: "Feiertag",      leaveTypeKey: "feiertag" },
  { value: "Weiterbildung", label: "Weiterbildung", leaveTypeKey: "weiterbildung" },
];

interface AdminAbsenceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultUserId: string;
  profiles: Record<string, { vorname: string; nachname: string }>;
  onSaved?: () => void;
}

export function AdminAbsenceDialog({
  open,
  onOpenChange,
  defaultUserId,
  profiles,
  onSaved,
}: AdminAbsenceDialogProps) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const [userId, setUserId] = useState<string>(defaultUserId);
  const [type, setType] = useState<AbsenceType>("Urlaub");
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);
  const [notiz, setNotiz] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [conflictDays, setConflictDays] = useState<string[] | null>(null);

  // Reset wenn Dialog frisch geöffnet wird oder defaultUserId wechselt
  useEffect(() => {
    if (open) {
      setUserId(defaultUserId);
      setType("Urlaub");
      setFromDate(today);
      setToDate(today);
      setNotiz("");
      setConflictDays(null);
    }
  }, [open, defaultUserId]);

  // Werktage im Bereich [fromDate, toDate], die ein Tagessoll > 0 haben
  // (Mo-Do bei der aktuellen 10/0-Regel). Wochenende übersprungen.
  const eligibleDates = useMemo(() => {
    if (!fromDate || !toDate || fromDate > toDate) return [] as string[];
    const out: string[] = [];
    const start = new Date(fromDate + "T12:00:00");
    const end = new Date(toDate + "T12:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (getNormalWorkingHours(d) > 0) out.push(format(d, "yyyy-MM-dd"));
    }
    return out;
  }, [fromDate, toDate]);

  const sortedProfiles = useMemo(() => {
    return Object.entries(profiles)
      .filter(([, p]) => p.vorname || p.nachname)
      .sort((a, b) =>
        (a[1].nachname + a[1].vorname).localeCompare(b[1].nachname + b[1].vorname, "de"),
      );
  }, [profiles]);

  const performSave = async (forceDespiteConflicts: boolean) => {
    if (!userId || eligibleDates.length === 0) return;
    setSaving(true);
    try {
      const { data: { user: caller } } = await supabase.auth.getUser();
      if (!caller) throw new Error("Nicht angemeldet");

      // Konflikt-Check: Sind für diese Tage schon time_entries angelegt?
      if (!forceDespiteConflicts) {
        const { data: existing } = await supabase
          .from("time_entries")
          .select("datum")
          .eq("user_id", userId)
          .in("datum", eligibleDates);
        const conflictSet = new Set((existing || []).map((e: any) => e.datum));
        const conflicts = eligibleDates.filter(d => conflictSet.has(d));
        if (conflicts.length > 0) {
          setConflictDays(conflicts);
          setSaving(false);
          return;
        }
      }
      setConflictDays(null);

      // Pro Werktag einen time_entry schreiben — Schema 1:1 wie der
      // Self-Service-Pfad in TimeTracking.tsx (Z. 558-570).
      const rows = eligibleDates.map((d) => {
        const dateObj = new Date(d + "T12:00:00");
        const stunden = getNormalWorkingHours(dateObj);
        return {
          user_id: userId,
          datum: d,
          project_id: null,
          taetigkeit: type,
          stunden,
          start_time: "07:00",
          end_time: "16:00",
          pause_minutes: 30,
          location_type: "baustelle",
          notizen: notiz || null,
          week_type: null,
          nachgetragen_von: caller.id !== userId ? caller.id : null,
          nachgetragen_am: caller.id !== userId ? new Date().toISOString() : null,
        };
      });
      const { error: teErr } = await supabase.from("time_entries").insert(rows as any);
      if (teErr) throw teErr;

      // leave_request mit status='genehmigt' anlegen — Plantafel zeigt
      // den Block dann automatisch via isOnLeave-Helper.
      const leaveTypeKey = TYPE_OPTIONS.find(o => o.value === type)?.leaveTypeKey || "urlaub";
      const totalDays = eligibleDates.length;
      await (supabase.from("leave_requests" as any) as any).insert({
        user_id: userId,
        type: leaveTypeKey,
        start_date: fromDate,
        end_date: toDate,
        days: totalDays,
        status: "genehmigt",
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
        notizen: notiz || null,
      });

      // Bei Zeitausgleich: Stundenkonto-Abzug — analog TimeTracking.tsx
      // (sonst würde der ZA "doppelt zählen" — kein Soll und kein Abzug).
      if (type === "Zeitausgleich") {
        const totalHours = rows.reduce((s, r) => s + r.stunden, 0);
        const { data: acc } = await (supabase.from("time_accounts" as never) as any)
          .select("balance_hours")
          .eq("user_id", userId)
          .maybeSingle();
        const before = Number((acc as any)?.balance_hours) || 0;
        const after = before - totalHours;
        if (acc) {
          await (supabase.from("time_accounts" as never) as any)
            .update({ balance_hours: after, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        } else {
          await (supabase.from("time_accounts" as never) as any)
            .insert({ user_id: userId, balance_hours: after });
        }
        await (supabase.from("time_account_transactions" as never) as any).insert({
          user_id: userId,
          changed_by: caller.id,
          change_type: "za_abzug",
          hours: -totalHours,
          balance_before: before,
          balance_after: after,
          reason: `Zeitausgleich ${fromDate}${totalDays > 1 ? ` – ${toDate}` : ""} (Admin-Nachtrag)`,
        });
      }

      toast({
        title: "Abwesenheit eingetragen",
        description: `${type}: ${eligibleDates.length} Werktag${eligibleDates.length > 1 ? "e" : ""} verbucht.`,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handlePrimary = () => performSave(false);
  const handleConfirmDespiteConflicts = () => performSave(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abwesenheit nachtragen</DialogTitle>
          <DialogDescription>
            Trägt für den gewählten Mitarbeiter pro Werktag einen Abwesenheits-Eintrag
            (Mo–Do, je 10 h) in die Stundenerfassung und gleichzeitig einen genehmigten
            Antrag in die Plantafel ein.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="abs-user">Mitarbeiter</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="abs-user"><SelectValue placeholder="Mitarbeiter wählen…" /></SelectTrigger>
              <SelectContent>
                {sortedProfiles.map(([id, p]) => (
                  <SelectItem key={id} value={id}>
                    {p.nachname}, {p.vorname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="abs-type">Art der Abwesenheit</Label>
            <Select value={type} onValueChange={(v) => setType(v as AbsenceType)}>
              <SelectTrigger id="abs-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="abs-from">Von</Label>
              <Input
                id="abs-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setFromDate(v);
                  if (toDate && v > toDate) setToDate(v);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="abs-to">Bis</Label>
              <Input
                id="abs-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate || undefined}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="abs-notiz">Notiz (optional)</Label>
            <Textarea
              id="abs-notiz"
              rows={2}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="z. B. Krankmeldung liegt vor"
            />
          </div>

          <div className="text-xs text-muted-foreground rounded bg-muted/40 p-2">
            {eligibleDates.length === 0
              ? "Kein Werktag im gewählten Bereich (Mo–Do erforderlich)."
              : `Wird ${eligibleDates.length} Werktag${eligibleDates.length > 1 ? "e" : ""} eintragen.`}
            {type === "Zeitausgleich" && eligibleDates.length > 0 && (
              <span className="block mt-1">
                Hinweis: Stundenkonto wird um {eligibleDates.length * 10} h reduziert.
              </span>
            )}
          </div>

          {conflictDays && conflictDays.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded p-2 text-xs space-y-1">
              <div className="flex items-center gap-1 font-medium text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5" />
                Bereits Buchungen vorhanden
              </div>
              <div className="text-amber-800">
                An folgenden Tagen sind schon time_entries angelegt:
                <span className="block font-mono mt-0.5">
                  {conflictDays.map(d => new Date(d + "T12:00:00").toLocaleDateString("de-AT")).join(", ")}
                </span>
              </div>
              <div className="text-amber-800">
                Bei „Trotzdem speichern" entstehen zusätzliche Abwesenheits-Einträge —
                Tage werden über die Sonderzeit-Regel neutralisiert.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          {conflictDays && conflictDays.length > 0 ? (
            <Button onClick={handleConfirmDespiteConflicts} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Trotzdem speichern
            </Button>
          ) : (
            <Button
              onClick={handlePrimary}
              disabled={saving || !userId || eligibleDates.length === 0}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Abwesenheit eintragen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
