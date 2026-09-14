import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Clock, Plus, History, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatSaldo, type TimeEntryLite } from "@/lib/hoursAccounting";
import {
  laufenderSaldo, zaAbgeschlossenBisLaden, monatAbschliessen, naechsterAbschluss, formatDatumDE,
  type ZeitraumSaldo, type AbschlussMonat,
} from "@/lib/zeitkonto";
import { ladeSollProfile, sollProTag, sollText, speichereSoll, wochenstundenVon, arbeitstageVon, type SollProfil } from "@/lib/sollStunden";

type Profile = {
  id: string;
  vorname: string;
  nachname: string;
};

type TimeAccount = {
  id: string;
  user_id: string;
  balance_hours: number;
};

type Transaction = {
  id: string;
  user_id: string;
  changed_by: string;
  change_type: string;
  hours: number;
  balance_before: number;
  balance_after: number;
  reason: string | null;
  created_at: string;
};

interface TimeAccountManagementProps {
  profiles: Profile[];
}

export default function TimeAccountManagement({ profiles }: TimeAccountManagementProps) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<TimeAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adjustHours, setAdjustHours] = useState("");
  const [adjustType, setAdjustType] = useState<"gutschrift" | "abzug">("gutschrift");
  const [adjustReason, setAdjustReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Umstellung 14.09.2026: Konto = abgeschlossener Stand bis zum Stichtag;
  // daneben je Mitarbeiter der laufende Zeitraum (noch nicht gebucht).
  const [laufendByUser, setLaufendByUser] = useState<Record<string, ZeitraumSaldo>>({});
  const [abgeschlossenBis, setAbgeschlossenBis] = useState<string | null>(null);
  const [naechster, setNaechster] = useState<AbschlussMonat | null>(null);
  const [abschlussLaeuft, setAbschlussLaeuft] = useState(false);
  // Persönliches Soll je Person (Teilzeit, 14.09.2026) + Editor.
  const [sollByUser, setSollByUser] = useState<Record<string, SollProfil>>({});
  const [sollUser, setSollUser] = useState<string | null>(null);
  const [sollWochen, setSollWochen] = useState("39");
  const [sollTage, setSollTage] = useState("5");
  const [sollSpeichert, setSollSpeichert] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: accData }, { data: txData }, { data: entriesData }] = await Promise.all([
      supabase.from("time_accounts").select("*"),
      supabase
        .from("time_account_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      // Alle time_entries aller Mitarbeiter — pro User gruppieren und
      // den Auto-Saldo via aggregateByDay rechnen. Bei einem normalen
      // Mitarbeiterbestand (~10-30 User × 250 Tage/Jahr) bleibt die
      // Datenmenge harmlos; falls das später zu groß wird, kann hier
      // ein Stichtag rein.
      supabase.from("time_entries").select("user_id, datum, stunden, taetigkeit"),
    ]);

    if (accData) setAccounts(accData as TimeAccount[]);
    if (txData) setTransactions(txData as Transaction[]);

    const [bis, soll] = await Promise.all([zaAbgeschlossenBisLaden(), ladeSollProfile()]);
    setAbgeschlossenBis(bis);
    setNaechster(naechsterAbschluss(bis));
    setSollByUser(soll);
    if (entriesData) {
      const byUser: Record<string, TimeEntryLite[]> = {};
      for (const e of entriesData as Array<TimeEntryLite & { user_id: string }>) {
        if (!byUser[e.user_id]) byUser[e.user_id] = [];
        byUser[e.user_id].push(e);
      }
      const map: Record<string, ZeitraumSaldo> = {};
      for (const [uid, list] of Object.entries(byUser)) map[uid] = laufenderSaldo(list, bis, sollProTag(soll[uid]));
      setLaufendByUser(map);
    }
    setLoading(false);
  };

  const sollOeffnen = (userId: string) => {
    const p = sollByUser[userId] || {};
    setSollWochen(String(wochenstundenVon(p)).replace(".", ","));
    setSollTage(String(arbeitstageVon(p)));
    setSollUser(userId);
  };
  const sollSpeichern = async () => {
    if (!sollUser) return;
    const w = Number(sollWochen.replace(",", ".")); const t = Number(sollTage.replace(",", "."));
    if (!(w > 0 && w <= 60) || !(t >= 1 && t <= 7)) {
      toast({ variant: "destructive", title: "Unplausibel", description: "Wochenstunden 1–60, Arbeitstage 1–7." });
      return;
    }
    setSollSpeichert(true);
    const fehler = await speichereSoll(sollUser, w, t);
    setSollSpeichert(false);
    if (fehler) { toast({ variant: "destructive", title: "Nicht gespeichert", description: fehler }); return; }
    toast({ title: "Soll gespeichert", description: `${getProfileName(sollUser)}: ${sollText({ wochenstunden: w, arbeitstage_woche: t })}` });
    setSollUser(null);
    await fetchData();
  };

  /** Monatsabschluss für alle angezeigten Mitarbeiter — bucht den nächsten Monat ins Konto. */
  const handleAbschluss = async () => {
    if (!naechster) return;
    const ids = profiles.filter((p) => p.vorname && p.nachname).map((p) => p.id);
    if (!window.confirm(`${naechster.label} für ${ids.length} Mitarbeiter abschließen? Überstunden und Zeitausgleich des Monats werden ins ZA-Konto gebucht; Einträge in diesem Monat sind danach gesperrt.`)) return;
    setAbschlussLaeuft(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const erg = await monatAbschliessen(ids, user.id);
      if (erg.fehler.length > 0) {
        toast({ variant: "destructive", title: "Abschluss unvollständig", description: `${erg.fehler.length} Fehler — der Stichtag wurde nicht vorgerückt, ein erneuter Lauf holt es nach. ${erg.fehler[0]}` });
      } else {
        toast({ title: `${erg.monat.label} abgeschlossen`, description: `${erg.gebucht.length} Konten gebucht, ${erg.ohneAenderung} ohne Änderung.` });
      }
      await fetchData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Abschluss nicht möglich", description: e?.message || String(e) });
    } finally {
      setAbschlussLaeuft(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getProfileName = (userId: string) => {
    const p = profiles.find((p) => p.id === userId);
    return p ? `${p.vorname} ${p.nachname}` : "Unbekannt";
  };

  const ensureAccount = async (userId: string) => {
    const { error } = await supabase.from("time_accounts").insert({
      user_id: userId,
      balance_hours: 0,
    });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    }
    fetchData();
  };

  const handleAdjust = async () => {
    if (!selectedUserId || !adjustHours || !adjustReason.trim()) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte alle Felder ausfüllen",
      });
      return;
    }

    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    const account = accounts.find((a) => a.user_id === selectedUserId);
    if (!account) {
      toast({ variant: "destructive", title: "Fehler", description: "Kein Zeitkonto gefunden" });
      setSubmitting(false);
      return;
    }

    const hours = parseFloat(adjustHours);
    const effectiveHours = adjustType === "abzug" ? -hours : hours;
    const balanceBefore = account.balance_hours;
    const balanceAfter = balanceBefore + effectiveHours;

    // Update balance
    const { error: updateErr } = await supabase
      .from("time_accounts")
      .update({ balance_hours: balanceAfter })
      .eq("id", account.id);

    if (updateErr) {
      toast({ variant: "destructive", title: "Fehler", description: updateErr.message });
      setSubmitting(false);
      return;
    }

    // Insert transaction (audit log)
    const { error: txErr } = await supabase.from("time_account_transactions").insert({
      user_id: selectedUserId,
      changed_by: user.id,
      change_type: adjustType === "gutschrift" ? "Gutschrift" : adjustType === "abzug" ? "Abzug" : "ZA",
      hours: effectiveHours,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reason: adjustReason.trim(),
    });

    if (txErr) {
      console.error("Transaction log error:", txErr);
    }

    toast({
      title: "Zeitkonto aktualisiert",
      description: `${getProfileName(selectedUserId)}: ${effectiveHours > 0 ? "+" : ""}${effectiveHours.toFixed(2)} h`,
    });

    setShowAdjustDialog(false);
    setAdjustHours("");
    setAdjustReason("");
    setSubmitting(false);
    fetchData();
  };

  const userTransactions = selectedUserId
    ? transactions.filter((t) => t.user_id === selectedUserId)
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Monatsabschluss (Umstellung 14.09.2026): Das ZA-Konto ändert sich nur
          hier. Der Knopf ist erst frei, wenn der Monat vorbei ist. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Monatsabschluss
          </CardTitle>
          <CardDescription>
            Abgeschlossen bis <b>{formatDatumDE(abgeschlossenBis)}</b>. Beim Abschluss werden Überstunden und
            Zeitausgleich-Tage des Monats aus den Einträgen ins ZA-Konto gebucht; Einträge in abgeschlossenen
            Monaten sind danach gesperrt (Korrekturen über Gutschrift/Abzug).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {naechster && (
            <>
              <span className="text-sm">
                Nächster Abschluss: <b>{naechster.label}</b>
                {!naechster.abschliessbar && <span className="text-muted-foreground"> — möglich ab dem 1. des Folgemonats</span>}
              </span>
              <Button onClick={() => void handleAbschluss()} disabled={!naechster.abschliessbar || abschlussLaeuft} className="h-10">
                {abschlussLaeuft ? "Wird gebucht …" : `${naechster.label} abschließen`}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Time Accounts Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Zeitkonten
          </CardTitle>
          <CardDescription>
            ZA-Konto = abgeschlossener Stand bis {formatDatumDE(abgeschlossenBis)} · daneben der laufende, noch nicht gebuchte Zeitraum
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {profiles
              .filter((p) => p.vorname && p.nachname)
              .map((profile) => {
                const account = accounts.find((a) => a.user_id === profile.id);
                const manual = Number(account?.balance_hours) || 0;
                const lauf = laufendByUser[profile.id] || { ueberstunden: 0, zeitausgleich: 0, gesamt: 0, tage: 0 };
                const auto = lauf.gesamt;
                const effektiv = manual + auto;
                const colorClass = (n: number) =>
                  n > 0.005 ? "text-green-600 font-semibold"
                  : n < -0.005 ? "text-destructive font-semibold"
                  : "text-muted-foreground font-semibold";

                return (
                  <div
                    key={profile.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">
                        {profile.vorname} {profile.nachname}
                      </p>
                      <p className="text-sm flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="font-medium">
                          ZA-Konto: <span className={colorClass(manual) + " text-base"}>{formatSaldo(manual)} h</span>
                        </span>
                        <span>
                          Laufend: <span className={colorClass(auto)}>{formatSaldo(auto)} h</span>
                          {Math.abs(lauf.zeitausgleich) >= 0.005 && <span className="text-muted-foreground"> (ZA {formatSaldo(lauf.zeitausgleich)} h)</span>}
                        </span>
                        <span className="text-muted-foreground">
                          nach Abschluss: <span className={colorClass(effektiv)}>{formatSaldo(effektiv)} h</span>
                        </span>
                        <span className="text-muted-foreground">
                          Soll: {sollText(sollByUser[profile.id])}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => sollOeffnen(profile.id)} title="Wochenstunden und Arbeitstage dieser Person">
                        Soll
                      </Button>
                      {account ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(profile.id);
                              setShowAdjustDialog(true);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Buchen
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(profile.id);
                              setShowHistoryDialog(true);
                            }}
                          >
                            <History className="h-3 w-3 mr-1" /> Verlauf
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => ensureAccount(profile.id)}
                        >
                          Zeitkonto anlegen
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Adjust Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Zeitkonto buchen</DialogTitle>
            <DialogDescription>
              {selectedUserId && getProfileName(selectedUserId)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Art</Label>
              <Select
                value={adjustType}
                onValueChange={(v) => setAdjustType(v as "gutschrift" | "abzug")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gutschrift">Gutschrift (Überstunden)</SelectItem>
                  <SelectItem value="abzug">Abzug (Zeitausgleich / ZA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stunden</Label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                value={adjustHours}
                onChange={(e) => setAdjustHours(e.target.value)}
                placeholder="z.B. 8"
              />
            </div>
            <div className="space-y-2">
              <Label>Grund (Pflichtfeld)</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="z.B. Überstunden KW12, ZA-Tag 15.03...."
                rows={2}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleAdjust} disabled={submitting}>
                {submitting ? "Wird gebucht..." : "Buchen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Verlauf – {selectedUserId && getProfileName(selectedUserId)}
            </DialogTitle>
            <DialogDescription>
              Alle Buchungen und Änderungen am Zeitkonto
            </DialogDescription>
          </DialogHeader>
          {userTransactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Noch keine Buchungen
            </p>
          ) : (
            <div className="space-y-2">
              {userTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 rounded-lg border text-sm space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={tx.hours >= 0 ? "default" : "destructive"}
                    >
                      {tx.hours >= 0 ? "+" : ""}
                      {Number(tx.hours).toFixed(2)} h · {tx.change_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "dd.MM.yyyy HH:mm", {
                        locale: de,
                      })}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {tx.reason || "Kein Grund angegeben"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Saldo: {Number(tx.balance_before).toFixed(2)} → {Number(tx.balance_after).toFixed(2)} h · geändert von{" "}
                    {getProfileName(tx.changed_by)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Soll je Person (Teilzeit, 14.09.2026) */}
      <Dialog open={!!sollUser} onOpenChange={(o) => { if (!o) setSollUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Soll-Stunden{sollUser ? ` — ${getProfileName(sollUser)}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Tagessoll = Wochenstunden ÷ Arbeitstage. Es gilt an jedem gebuchten Werktag und für Urlaub,
              Zeitausgleich und Krankenstand. Vollzeit: 39 h / 5 Tage = 7,8 h.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Wochenstunden</Label>
                <Input inputMode="decimal" value={sollWochen} onChange={(e) => setSollWochen(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label>Arbeitstage je Woche</Label>
                <Input inputMode="numeric" value={sollTage} onChange={(e) => setSollTage(e.target.value)} className="h-10" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Ergibt {sollText({ wochenstunden: sollWochen.replace(",", "."), arbeitstage_woche: sollTage })}.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSollUser(null)}>Abbrechen</Button>
              <Button onClick={() => void sollSpeichern()} disabled={sollSpeichert}>{sollSpeichert ? "Speichert …" : "Speichern"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
