import { useEffect, useMemo, useState } from "react";
import {
  addMonths, addWeeks, endOfMonth, endOfWeek, format, getISOWeek,
  parseISO, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, PiggyBank, Save, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Fixkosten, eur, fixkostenTermine } from "./types";

// Ausgangsrechnungen, die zu Einzahlungen führen (wie PAYABLE_INVOICE_TYPES in Invoices.tsx)
const RECHNUNG_TYPEN = ["rechnung", "anzahlungsrechnung", "schlussrechnung"];
// Noch nicht (voll) bezahlte Status
const OFFENE_STATUS = ["offen", "gesendet", "teilbezahlt"];

const STARTSALDO_KEY = "finanzplanung_startsaldo";

type Modus = "wochen" | "monate";

interface Periode {
  start: Date;
  end: Date;
  /** Ausführliche Bezeichnung für Tabelle/Tooltip */
  label: string;
  /** Kurzbezeichnung für die Diagramm-Achse */
  kurz: string;
}

interface OffeneRechnung {
  id: string;
  typ: string;
  status: string;
  datum: string | null;
  faellig_am: string | null;
  brutto_summe: number;
  bezahlt_betrag: number | null;
}

interface OffeneEingangsrechnung {
  id: string;
  betrag_brutto: number;
  rechnungsdatum: string | null;
  faellig_am: string | null;
}

interface PeriodenZeile {
  periode: Periode;
  einzahlungen: number;
  einzahlungenUeberfaellig: number;
  belegAuszahlungen: number;
  auszahlungenUeberfaellig: number;
  fixkosten: number;
  auszahlungen: number;
  saldo: number;
  kontostand: number;
}

// Farben: dataviz-validiert (CVD-Separation, Kontrast) für Hell- und Dunkelmodus.
const chartConfig = {
  kontostand: {
    label: "Kontostand",
    theme: { light: "#1f79ad", dark: "#2f9bd0" },
  },
  negativ: {
    label: "Unterdeckung",
    theme: { light: "#dc2828", dark: "#e35d5d" },
  },
} satisfies ChartConfig;

function baueperioden(modus: Modus, heute: Date): Periode[] {
  const perioden: Periode[] = [];
  if (modus === "wochen") {
    const basis = startOfWeek(heute, { weekStartsOn: 1 });
    for (let i = 0; i < 12; i++) {
      const start = addWeeks(basis, i);
      const end = endOfWeek(start, { weekStartsOn: 1 });
      perioden.push({
        start,
        end,
        label: `KW ${getISOWeek(start)} (${format(start, "dd.MM.", { locale: de })}–${format(end, "dd.MM.yyyy", { locale: de })})`,
        kurz: `KW ${getISOWeek(start)}`,
      });
    }
  } else {
    const basis = startOfMonth(heute);
    for (let i = 0; i < 6; i++) {
      const start = addMonths(basis, i);
      perioden.push({
        start,
        end: endOfMonth(start),
        label: format(start, "MMMM yyyy", { locale: de }),
        kurz: format(start, "MMM yy", { locale: de }),
      });
    }
  }
  return perioden;
}

export function LiquiditaetsVorschau() {
  const [modus, setModus] = useState<Modus>("monate");
  const [loading, setLoading] = useState(true);
  const [rechnungen, setRechnungen] = useState<OffeneRechnung[]>([]);
  const [eingangsrechnungen, setEingangsrechnungen] = useState<OffeneEingangsrechnung[]>([]);
  const [fixkosten, setFixkosten] = useState<Fixkosten[]>([]);
  const [startsaldoInput, setStartsaldoInput] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [invRes, purchRes, fixRes, saldoRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, typ, status, datum, faellig_am, brutto_summe, bezahlt_betrag")
        .in("typ", RECHNUNG_TYPEN)
        .in("status", OFFENE_STATUS),
      supabase
        .from("purchase_invoices")
        .select("id, betrag_brutto, rechnungsdatum, faellig_am")
        .eq("status", "offen"),
      (supabase.from("fixkosten" as never) as any)
        .select("*")
        .eq("aktiv", true),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", STARTSALDO_KEY)
        .maybeSingle(),
    ]);

    const fehler = invRes.error || purchRes.error || fixRes.error;
    if (fehler) {
      toast.error("Fehler beim Laden der Daten", { description: fehler.message });
    }
    setRechnungen((invRes.data ?? []) as OffeneRechnung[]);
    setEingangsrechnungen((purchRes.data ?? []) as OffeneEingangsrechnung[]);
    setFixkosten((fixRes.data ?? []) as Fixkosten[]);
    if (saldoRes.data?.value != null) {
      const num = parseFloat(saldoRes.data.value);
      if (Number.isFinite(num)) setStartsaldoInput(String(num));
    }
    setLoading(false);
  };

  const startsaldo = useMemo(() => {
    const num = parseFloat(startsaldoInput.replace(",", "."));
    return Number.isFinite(num) ? num : 0;
  }, [startsaldoInput]);

  const saveStartsaldo = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: STARTSALDO_KEY, value: String(startsaldo) }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Startsaldo konnte nicht gespeichert werden", {
        description: error.message.includes("policy")
          ? "Nur Administratoren können den Startsaldo speichern."
          : error.message,
      });
    } else {
      toast.success("Startsaldo gespeichert");
    }
  };

  const heute = useMemo(() => startOfDay(new Date()), []);
  const perioden = useMemo(() => baueperioden(modus, heute), [modus, heute]);

  const auswertung = useMemo(() => {
    const zeilen: PeriodenZeile[] = perioden.map((p) => ({
      periode: p,
      einzahlungen: 0,
      einzahlungenUeberfaellig: 0,
      belegAuszahlungen: 0,
      auszahlungenUeberfaellig: 0,
      fixkosten: 0,
      auszahlungen: 0,
      saldo: 0,
      kontostand: 0,
    }));
    const horizontEnde = perioden[perioden.length - 1].end;
    let einzahlungenSpaeter = 0;
    let auszahlungenSpaeter = 0;

    // Periode für ein Fälligkeitsdatum finden: überfällig → erste Periode,
    // nach dem Horizont → nicht in der Vorschau (separat ausgewiesen).
    const einsortieren = (datum: Date): { idx: number; ueberfaellig: boolean } | null => {
      if (datum < heute) return { idx: 0, ueberfaellig: true };
      if (datum > horizontEnde) return null;
      const idx = perioden.findIndex((p) => datum >= p.start && datum <= p.end);
      return idx >= 0 ? { idx, ueberfaellig: false } : null;
    };

    // Erwartete Einzahlungen: Restbeträge offener Ausgangsrechnungen
    for (const r of rechnungen) {
      const rest = Number(r.brutto_summe) - Number(r.bezahlt_betrag ?? 0);
      if (rest <= 0.005) continue;
      const faellig = r.faellig_am ?? r.datum;
      if (!faellig) continue;
      const ziel = einsortieren(parseISO(faellig));
      if (!ziel) { einzahlungenSpaeter += rest; continue; }
      zeilen[ziel.idx].einzahlungen += rest;
      if (ziel.ueberfaellig) zeilen[ziel.idx].einzahlungenUeberfaellig += rest;
    }

    // Erwartete Auszahlungen: offene Eingangsrechnungen
    for (const e of eingangsrechnungen) {
      const betrag = Number(e.betrag_brutto);
      if (betrag <= 0) continue;
      const faellig = e.faellig_am ?? e.rechnungsdatum;
      if (!faellig) continue;
      const ziel = einsortieren(parseISO(faellig));
      if (!ziel) { auszahlungenSpaeter += betrag; continue; }
      zeilen[ziel.idx].belegAuszahlungen += betrag;
      if (ziel.ueberfaellig) zeilen[ziel.idx].auszahlungenUeberfaellig += betrag;
    }

    // Fixkosten: Termine ab heute (frühere Termine gelten als bereits bezahlt
    // und stecken im Startsaldo) bis zum Ende des Horizonts.
    for (const fk of fixkosten) {
      for (const termin of fixkostenTermine(fk, heute, horizontEnde)) {
        const ziel = einsortieren(termin);
        if (ziel) zeilen[ziel.idx].fixkosten += Number(fk.betrag);
      }
    }

    let kontostand = startsaldo;
    for (const z of zeilen) {
      z.auszahlungen = z.belegAuszahlungen + z.fixkosten;
      z.saldo = z.einzahlungen - z.auszahlungen;
      kontostand += z.saldo;
      z.kontostand = kontostand;
    }

    return { zeilen, einzahlungenSpaeter, auszahlungenSpaeter };
  }, [perioden, rechnungen, eingangsrechnungen, fixkosten, startsaldo, heute]);

  const { zeilen, einzahlungenSpaeter, auszahlungenSpaeter } = auswertung;

  const kennzahlen = useMemo(() => {
    const forderungen = rechnungen.reduce(
      (s, r) => s + Math.max(0, Number(r.brutto_summe) - Number(r.bezahlt_betrag ?? 0)), 0);
    const verbindlichkeiten = eingangsrechnungen.reduce((s, e) => s + Number(e.betrag_brutto), 0);
    const fixkostenSumme = zeilen.reduce((s, z) => s + z.fixkosten, 0);
    const endstand = zeilen.length > 0 ? zeilen[zeilen.length - 1].kontostand : startsaldo;
    return { forderungen, verbindlichkeiten, fixkostenSumme, endstand };
  }, [rechnungen, eingangsrechnungen, zeilen, startsaldo]);

  const ersteNegative = useMemo(() => zeilen.find((z) => z.kontostand < 0) ?? null, [zeilen]);
  const tiefpunkt = useMemo(
    () => zeilen.reduce((min, z) => (z.kontostand < min.kontostand ? z : min), zeilen[0]),
    [zeilen],
  );

  const chartDaten = useMemo(
    () => zeilen.map((z) => ({
      kurz: z.periode.kurz,
      label: z.periode.label,
      kontostand: Math.round(z.kontostand * 100) / 100,
    })),
    [zeilen],
  );

  // Farbverlauf am Nulldurchgang teilen: oberhalb Blau, unterhalb Rot.
  const gradientOffset = useMemo(() => {
    const werte = chartDaten.map((d) => d.kontostand);
    const max = Math.max(0, ...werte);
    const min = Math.min(0, ...werte);
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [chartDaten]);

  if (loading) {
    return <p className="text-center py-12 text-muted-foreground">Lade Liquiditätsvorschau...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Steuerung: Startsaldo + Zeitraum */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="startsaldo">Startsaldo (Kontostand heute)</Label>
            <div className="flex gap-2">
              <Input
                id="startsaldo"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="w-44"
                value={startsaldoInput}
                onChange={(e) => setStartsaldoInput(e.target.value)}
              />
              <Button variant="outline" onClick={saveStartsaldo} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">{saving ? "Speichert..." : "Speichern"}</span>
              </Button>
            </div>
          </div>
          <div className="space-y-1.5 sm:ml-auto">
            <Label>Zeitraum</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={modus}
              onValueChange={(v) => { if (v) setModus(v as Modus); }}
              className="justify-start"
            >
              <ToggleGroupItem value="wochen">12 Wochen</ToggleGroupItem>
              <ToggleGroupItem value="monate">6 Monate</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardContent>
      </Card>

      {/* Warnung bei Unterdeckung */}
      {ersteNegative && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Liquiditätswarnung</AlertTitle>
          <AlertDescription>
            Der geplante Kontostand wird in {ersteNegative.periode.label} negativ
            ({eur(ersteNegative.kontostand)}). Tiefpunkt: {eur(tiefpunkt.kontostand)} in{" "}
            {tiefpunkt.periode.label}.
          </AlertDescription>
        </Alert>
      )}

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Offene Forderungen
            </p>
            <p className="text-xl font-bold">{eur(kennzahlen.forderungen)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Offene Eingangsrechnungen
            </p>
            <p className="text-xl font-bold">{eur(kennzahlen.verbindlichkeiten)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <PiggyBank className="h-3 w-3" /> Fixkosten im Zeitraum
            </p>
            <p className="text-xl font-bold">{eur(kennzahlen.fixkostenSumme)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" /> Kontostand am Ende
            </p>
            <p className={`text-xl font-bold ${kennzahlen.endstand < 0 ? "text-destructive" : ""}`}>
              {eur(kennzahlen.endstand)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Diagramm */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Kumulierter Kontostand</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <AreaChart data={chartDaten} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="kontostandStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={gradientOffset} stopColor="var(--color-kontostand)" />
                  <stop offset={gradientOffset} stopColor="var(--color-negativ)" />
                </linearGradient>
                <linearGradient id="kontostandFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={gradientOffset} stopColor="var(--color-kontostand)" stopOpacity={0.12} />
                  <stop offset={gradientOffset} stopColor="var(--color-negativ)" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="kurz" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                fontSize={11}
                domain={[(dataMin: number) => Math.min(0, dataMin), (dataMax: number) => Math.max(0, dataMax)]}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000
                    ? `${(v / 1000).toLocaleString("de-AT", { maximumFractionDigits: 1 })}k €`
                    : `${Math.round(v)} €`
                }
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => (payload?.[0]?.payload as { label?: string })?.label ?? ""}
                    formatter={(value) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">Kontostand</span>
                        <span className={`font-mono font-medium tabular-nums ${Number(value) < 0 ? "text-destructive" : "text-foreground"}`}>
                          {eur(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="kontostand"
                baseValue={0}
                stroke="url(#kontostandStroke)"
                strokeWidth={2}
                fill="url(#kontostandFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Tabelle je Periode */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Perioden im Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeitraum</TableHead>
                  <TableHead className="text-right">Einzahlungen</TableHead>
                  <TableHead className="text-right">Auszahlungen</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Kontostand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeilen.map((z, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="whitespace-nowrap font-medium">{z.periode.label}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {eur(z.einzahlungen)}
                      {z.einzahlungenUeberfaellig > 0.005 && (
                        <p className="text-xs text-destructive">
                          davon überfällig: {eur(z.einzahlungenUeberfaellig)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {eur(z.auszahlungen)}
                      {z.auszahlungenUeberfaellig > 0.005 && (
                        <p className="text-xs text-destructive">
                          davon überfällig: {eur(z.auszahlungenUeberfaellig)}
                        </p>
                      )}
                      {z.fixkosten > 0.005 && (
                        <p className="text-xs text-muted-foreground">
                          davon Fixkosten: {eur(z.fixkosten)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={`text-right whitespace-nowrap ${z.saldo < 0 ? "text-destructive" : ""}`}>
                      {eur(z.saldo)}
                    </TableCell>
                    <TableCell className={`text-right whitespace-nowrap font-semibold ${z.kontostand < 0 ? "text-destructive" : ""}`}>
                      {eur(z.kontostand)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(einzahlungenSpaeter > 0.005 || auszahlungenSpaeter > 0.005) && (
            <p className="text-xs text-muted-foreground mt-3">
              Nach dem Zeitraum fällig (nicht in der Vorschau enthalten):{" "}
              {einzahlungenSpaeter > 0.005 && <>Einzahlungen {eur(einzahlungenSpaeter)}</>}
              {einzahlungenSpaeter > 0.005 && auszahlungenSpaeter > 0.005 && " · "}
              {auszahlungenSpaeter > 0.005 && <>Auszahlungen {eur(auszahlungenSpaeter)}</>}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
