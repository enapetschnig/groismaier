import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { Clock, Home, Pencil, Trash2, Wallet } from "lucide-react";
import { aggregateByDay, totalAutoSaldo, formatSaldo } from "@/lib/hoursAccounting";
import { KBToolbar } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type TimeEntry = {
  id: string;
  datum: string;
  taetigkeit: string;
  stunden: number;
  start_time: string | null;
  end_time: string | null;
  pause_minutes: number | null;
  location_type: string;
  notizen: string | null;
  projects: { name: string; plz: string } | null;
  project_id: string | null;
  nachgetragen_von?: string | null;
  nachgetragen_am?: string | null;
};

const MyHours = () => {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const { toast } = useToast();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHours, setTotalHours] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Stundenkonto-Saldo: live aus ALLEN time_entries des Mitarbeiters
  // berechnet (kein Stichtag), plus manuelle Korrekturen aus
  // time_accounts.balance_hours.
  const [autoSaldoAll, setAutoSaldoAll] = useState<number>(0);
  const [manualSaldo, setManualSaldo] = useState<number>(0);

  useEffect(() => {
    fetchEntries();
  }, [selectedMonth]);

  // Stundenkonto laden (nicht abhängig vom angezeigten Monat — der Saldo läuft
  // über alle Daten, der Monat ist nur Anzeige-Filter).
  //
  // MUSS nach jedem Bearbeiten/Löschen erneut laufen: vorher lief das genau
  // einmal beim Öffnen, danach zeigte der Kopf noch den alten Saldo, während die
  // Monatszeile unten schon den neuen zeigte — zwei widersprüchliche Zahlen auf
  // demselben Bildschirm.
  const fetchAccount = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: acc }, { data: allEntries }] = await Promise.all([
      (supabase.from("time_accounts" as never) as any)
        .select("balance_hours").eq("user_id", user.id).maybeSingle(),
      supabase.from("time_entries")
        .select("datum, stunden, taetigkeit").eq("user_id", user.id),
    ]);
    setManualSaldo(Number((acc as any)?.balance_hours) || 0);
    setAutoSaldoAll(totalAutoSaldo((allEntries as any[]) || []));
  };

  useEffect(() => {
    fetchAccount();
  }, []);

  // Tages-Aggregation des aktuell angezeigten Monats (für Tagessaldo-Spalte).
  const dayBalances = useMemo(() => aggregateByDay(entries as any), [entries]);
  const dayBalanceMap = useMemo(() => new Map(dayBalances.map(d => [d.datum, d])), [dayBalances]);
  const effektiv = autoSaldoAll + manualSaldo;

  const fetchEntries = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data } = await supabase
      .from("time_entries")
      .select("*, projects(name, plz)")
      .eq("user_id", user.id)
      .gte("datum", startDate)
      .lte("datum", endDate)
      .order("datum", { ascending: false });

    if (data) {
      setEntries(data as any);
      const sum = data.reduce((acc, entry) => acc + entry.stunden, 0);
      setTotalHours(sum);
    }
    setLoading(false);
  };

  const isCurrentMonth = (datum: string) => {
    const entryDate = new Date(datum);
    const [year, month] = selectedMonth.split('-').map(Number);
    return entryDate.getFullYear() === year && entryDate.getMonth() + 1 === month;
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry || savingEdit) return;

    setSavingEdit(true);

    // Einfache Berechnung: (Ende - Start - Pause) / 60
    let calculatedHours = 0;
    if (editingEntry.start_time && editingEntry.end_time) {
      const [sH, sM] = editingEntry.start_time.split(':').map(Number);
      const [eH, eM] = editingEntry.end_time.split(':').map(Number);
      const totalMin = (eH * 60 + eM) - (sH * 60 + sM) - (editingEntry.pause_minutes || 0);
      calculatedHours = Math.max(0, totalMin / 60);
    }

    const { error } = await supabase
      .from("time_entries")
      .update({
        taetigkeit: editingEntry.taetigkeit,
        start_time: editingEntry.start_time,
        end_time: editingEntry.end_time,
        pause_minutes: editingEntry.pause_minutes || 0,
        notizen: editingEntry.notizen,
        stunden: Math.max(0, calculatedHours),
      })
      .eq("id", editingEntry.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Eintrag konnte nicht aktualisiert werden",
      });
    } else {
      toast({
        title: "Erfolg",
        description: "Eintrag wurde aktualisiert",
      });
      setShowEditDialog(false);
      setEditingEntry(null);
      fetchEntries();
      fetchAccount();
    }
    setSavingEdit(false);
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("Möchtest du diesen Eintrag wirklich löschen?")) return;

    const { error } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Eintrag konnte nicht gelöscht werden",
      });
    } else {
      toast({
        title: "Erfolg",
        description: "Eintrag wurde gelöscht",
      });
      setShowEditDialog(false);
      setEditingEntry(null);
      fetchEntries();
      fetchAccount();
    }
  };

  if (loading) {
    return (
      <div className="kb-page min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Lädt...</p>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      {/* KingBill-Toolbar statt weißer shadcn-Leiste — sonst fiel die Maske
          optisch aus der App heraus. Zurück + Home = kein Sackgassen-Risiko. */}
      <KBToolbar
        title="Meine Stunden"
        onBack={zurueck}
        backLabel="Zurück zur Startmaske"
        rightActions={
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Zur Startmaske"
            title="Zur Startmaske"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-kb-blue-dark bg-gradient-to-b from-white to-[hsl(213_30%_88%)] shadow-md transition-transform hover:brightness-105 active:translate-y-px"
          >
            <Home className="h-5 w-5 text-kb-blue-dark" strokeWidth={2.5} />
          </button>
        }
      />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl space-y-4">
        <Card className="kb-panel">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-5 w-5" />
              Stundenkonto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Auto (aus Buchungen)</p>
                <p className={`text-xl font-bold ${autoSaldoAll > 0.005 ? "text-green-600" : autoSaldoAll < -0.005 ? "text-red-600" : ""}`}>
                  {formatSaldo(autoSaldoAll)} h
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Manuelle Korrektur</p>
                <p className={`text-xl font-bold ${manualSaldo > 0.005 ? "text-green-600" : manualSaldo < -0.005 ? "text-red-600" : ""}`}>
                  {formatSaldo(manualSaldo)} h
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Effektiver Saldo</p>
                <p className={`text-2xl font-extrabold ${effektiv > 0.005 ? "text-green-600" : effektiv < -0.005 ? "text-red-600" : ""}`}>
                  {formatSaldo(effektiv)} h
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Plus = Überstunden-Guthaben · Minus = Nachzuholende Stunden. Urlaub, Krankenstand, Feiertag und Zeitausgleich werden neutral gerechnet.
            </p>
          </CardContent>
        </Card>

        <Card className="kb-panel">
          <CardHeader>
            {/* „Meine Stunden" steht schon in der blauen Leiste — hier der
                konkretere Titel, sonst stünde derselbe Text zweimal. */}
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Buchungen im Monat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b">
              <div className="flex items-center gap-2">
                <Label htmlFor="month-select" className="text-sm font-medium">Monat:</Label>
                <Input
                  id="month-select"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-11 w-44"
                />
              </div>
              <div className="text-sm sm:text-base space-y-0.5">
                {(() => {
                  // Soll/Saldo des Monats aus der zentralen Tages-Aggregation —
                  // exakt dieselbe Logik wie das Stundenkonto oben: es zählen nur
                  // Tage MIT Buchung (kein Phantom-Minus für nicht gebuchte Tage),
                  // Sonderzeiten (Urlaub/Krankenstand/Feiertag/Zeitausgleich/
                  // Weiterbildung) werden neutral gerechnet (Soll 0, Saldo 0).
                  const sollTotal = dayBalances.reduce((s, d) => s + d.soll, 0);
                  const diff = dayBalances.reduce((s, d) => s + d.saldo, 0);
                  return (
                    <>
                      <div>
                        <span className="text-muted-foreground">Ist (gebucht): </span>
                        <span className="font-bold text-lg text-primary">{totalHours.toFixed(2)} Std.</span>
                        <span className="text-muted-foreground ml-2">Soll: </span>
                        <span className="font-medium">{sollTotal.toFixed(2)} Std.</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Saldo (Monat): </span>
                        <span className={`font-bold ${diff >= -0.005 ? "text-green-600" : "text-red-600"}`}>
                          {formatSaldo(diff)} Std.
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {entries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Keine Einträge für {new Date(selectedMonth + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
              </p>
            ) : (
              <>
              {/*
                ── Mobil (< md): Karten statt 9-spaltiger Tabelle ──
                Am Handy war die Tabelle nur seitwärts scrollbar; Projekt, Von/Bis
                und Stunden lagen außerhalb des Bildschirms. Jetzt steht pro Tag
                eine Karte mit allen Werten untereinander, Bearbeiten als 44px-Ziel.
              */}
              <ul className="flex flex-col gap-2 md:hidden">
                {Array.from(
                  entries.reduce((map, e) => {
                    const list = map.get(e.datum) || [];
                    list.push(e);
                    map.set(e.datum, list);
                    return map;
                  }, new Map<string, TimeEntry[]>())
                ).map(([datum, dayEntries]) => {
                  const dayBal = dayBalanceMap.get(datum);
                  const dayTotal = dayEntries.reduce((s, e) => s + (e.stunden || 0), 0);
                  return (
                    <li key={datum} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-border pb-2">
                        <span className="font-bold">
                          {new Date(datum + "T12:00:00").toLocaleDateString("de-DE", {
                            weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit",
                          })}
                        </span>
                        <span className="text-sm">
                          <span className="font-bold text-primary">{dayTotal.toFixed(2)} h</span>
                          {dayBal && Math.abs(dayBal.saldo) >= 0.005 && (
                            <span className={`ml-2 font-medium ${dayBal.saldo > 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatSaldo(dayBal.saldo)} h
                            </span>
                          )}
                        </span>
                      </div>
                      {dayEntries.map((entry) => (
                        <div key={entry.id} className="flex items-start gap-2 pt-2">
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="flex flex-wrap items-center gap-1.5">
                              <span>{entry.location_type === "werkstatt" ? "🏢 Firma" : "🏗️ Baustelle"}</span>
                              {entry.nachgetragen_von && (
                                <span className="inline-flex items-center rounded border border-amber-400 bg-amber-50 px-1 py-0 text-[9px] text-amber-700">
                                  nachgetragen
                                </span>
                              )}
                              <span className="ml-auto font-semibold">{entry.stunden.toFixed(2)} h</span>
                            </p>
                            <p className="break-words text-muted-foreground">
                              {entry.projects?.name || "Kein Projekt"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.start_time?.substring(0, 5) || "–"}–{entry.end_time?.substring(0, 5) || "–"}
                              {entry.pause_minutes ? ` · Pause ${entry.pause_minutes} Min` : ""}
                            </p>
                            {entry.taetigkeit && (
                              <p className="break-words text-xs text-muted-foreground">{entry.taetigkeit}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-label="Eintrag bearbeiten"
                            className="kb-btn h-11 w-11 shrink-0 justify-center"
                            onClick={() => { setEditingEntry(entry); setShowEditDialog(true); }}
                            disabled={!isCurrentMonth(entry.datum)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </li>
                  );
                })}
                <li className="rounded-md border border-border bg-muted/40 px-3 py-2 text-right text-sm font-bold">
                  Gesamt: {totalHours.toFixed(2)} h
                </li>
              </ul>

              <div className="hidden md:block rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Ort</TableHead>
                      <TableHead>Projekt</TableHead>
                      <TableHead className="text-center">Von</TableHead>
                      <TableHead className="text-center">Bis</TableHead>
                      <TableHead className="text-center">Pause</TableHead>
                      <TableHead className="text-right">Stunden</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      // Group entries by date
                      const grouped = new Map<string, TimeEntry[]>();
                      entries.forEach(e => {
                        const list = grouped.get(e.datum) || [];
                        list.push(e);
                        grouped.set(e.datum, list);
                      });
                      const rows: React.ReactNode[] = [];
                      grouped.forEach((dayEntries, datum) => {
                        const dateObj = new Date(datum + "T12:00:00");
                        // Tagessaldo aus dem zentralen Helper — Sonderzeiten neutral.
                        const dayBal = dayBalanceMap.get(datum);
                        dayEntries.forEach((entry, idx) => {
                          rows.push(
                            <TableRow key={entry.id} className={idx > 0 ? "border-t-0" : ""}>
                              {idx === 0 ? (
                                <TableCell className="font-medium whitespace-nowrap text-sm align-top" rowSpan={dayEntries.length}>
                                  {dateObj.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                                </TableCell>
                              ) : null}
                              <TableCell className="text-sm">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{entry.location_type === 'werkstatt' ? '🏢 Firma' : '🏗️ Baustelle'}</span>
                                  {entry.nachgetragen_von && (
                                    <span
                                      className="inline-flex items-center px-1 py-0 text-[9px] rounded border border-amber-400 text-amber-700 bg-amber-50"
                                      title={`Von Admin nachgetragen${entry.nachgetragen_am ? ` am ${new Date(entry.nachgetragen_am).toLocaleDateString("de-DE")}` : ""}`}
                                    >
                                      nachgetragen
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{entry.projects?.name || '-'}</TableCell>
                              <TableCell className="text-center text-sm">{entry.start_time?.substring(0, 5) || '-'}</TableCell>
                              <TableCell className="text-center text-sm">{entry.end_time?.substring(0, 5) || '-'}</TableCell>
                              <TableCell className="text-center text-sm">{entry.pause_minutes ? `${entry.pause_minutes} Min` : '-'}</TableCell>
                              <TableCell className="text-right font-semibold">{entry.stunden.toFixed(2)} h</TableCell>
                              <TableCell className="text-right">
                                {idx === 0 && dayBal && Math.abs(dayBal.saldo) >= 0.005 ? (
                                  <span className={`font-medium ${dayBal.saldo > 0 ? "text-green-600" : "text-red-600"}`}>
                                    {formatSaldo(dayBal.saldo)} h
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingEntry(entry); setShowEditDialog(true); }} disabled={!isCurrentMonth(entry.datum)} className="h-7 w-7 p-0">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        });
                        // Day summary row (only if multiple entries)
                        if (dayEntries.length > 1) {
                          const dayTotal = dayBal?.ist ?? dayEntries.reduce((s, e) => s + (e.stunden || 0), 0);
                          const sollH = dayBal?.soll ?? 0;
                          const dayDiff = dayBal?.saldo ?? (dayTotal - sollH);
                          rows.push(
                            <TableRow key={`sum-${datum}`} className="bg-muted/30">
                              <TableCell colSpan={6} className="text-right text-xs text-muted-foreground py-1">
                                Tagesgesamt: <span className="font-medium text-foreground">{dayTotal.toFixed(2)} h</span>
                                {sollH > 0 && (
                                  <span className={`ml-2 ${dayDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    ({dayDiff >= 0 ? "+" : ""}{dayDiff.toFixed(2)})
                                  </span>
                                )}
                              </TableCell>
                              <TableCell colSpan={3}></TableCell>
                            </TableRow>
                          );
                        }
                      });
                      return rows;
                    })()}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      {/* 9 Spalten im Header → 6 + 1 + 2 = 9 (vorher 8: die
                          Fußzeile war um eine Spalte zu kurz). */}
                      <TableCell colSpan={6} className="text-right font-semibold">Gesamt:</TableCell>
                      <TableCell className="text-right font-bold">{totalHours.toFixed(2)} h</TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) setEditingEntry(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stundeneintrag bearbeiten</DialogTitle>
            <DialogDescription>
              {editingEntry && (
                <>
                  Datum: {new Date(editingEntry.datum).toLocaleDateString('de-DE', { 
                    weekday: 'long', 
                    day: '2-digit', 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {editingEntry && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-taetigkeit">Tätigkeit</Label>
                <Input
                  id="edit-taetigkeit"
                  value={editingEntry.taetigkeit}
                  onChange={(e) => setEditingEntry({...editingEntry, taetigkeit: e.target.value})}
                  placeholder="z.B. Dachstuhl montieren"
                />
              </div>

              {/* Von / Bis */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Von</Label>
                  <Select value={(editingEntry.start_time || "07:00").slice(0, 5)} onValueChange={(v) => setEditingEntry({...editingEntry, start_time: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 29 }, (_, i) => { const h = Math.floor(i / 2) + 6; const m = (i % 2) * 30; const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; return <SelectItem key={t} value={t}>{t}</SelectItem>; })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bis</Label>
                  <Select value={(editingEntry.end_time || "16:00").slice(0, 5)} onValueChange={(v) => setEditingEntry({...editingEntry, end_time: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 29 }, (_, i) => { const h = Math.floor(i / 2) + 6; const m = (i % 2) * 30; const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; return <SelectItem key={t} value={t}>{t}</SelectItem>; })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Pause */}
              <div className="space-y-1.5">
                <Label>Pause</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[{ label: "Keine", value: 0 }, { label: "30 Min", value: 30 }, { label: "45 Min", value: 45 }, { label: "1 Std", value: 60 }].map(opt => (
                    <Button key={opt.value} type="button" variant={(editingEntry.pause_minutes || 0) === opt.value ? "default" : "outline"} size="sm" className="h-9 text-xs"
                      onClick={() => setEditingEntry({...editingEntry, pause_minutes: opt.value})}>
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleUpdateEntry} className="flex-1" disabled={savingEdit}>
                  {savingEdit ? 'Wird gespeichert...' : 'Speichern'}
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => editingEntry && handleDeleteEntry(editingEntry.id)}
                  className="flex-1"
                  disabled={savingEdit}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Löschen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyHours;
