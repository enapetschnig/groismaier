import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  PAYABLE_INVOICE_TYPES,
  fetchAllRows,
  formatEUR,
  formatEURAxis,
  monthKey,
  purchaseNetto,
} from "./shared";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

interface InvoiceRaw {
  id: string;
  typ: string;
  status: string;
  datum: string;
  netto_summe: number;
  brutto_summe: number;
  bezahlt_betrag: number | null;
  faellig_am: string | null;
}

interface PaymentRaw {
  invoice_id: string;
  betrag: number;
  datum: string;
}

interface PurchaseRaw {
  betrag_netto: number | null;
  betrag_brutto: number;
  ust_satz: number | null;
  status: string | null;
  rechnungsdatum: string | null;
  created_at: string | null;
}

// Serienfarben (dataviz-Palette, Slots 1+2 — Validator-geprüft, hell & dunkel)
const umsatzChartConfig = {
  umsatz: { label: "Umsatz (bezahlt)", theme: { light: "#2a78d6", dark: "#3987e5" } },
} satisfies ChartConfig;

const einnahmenAusgabenConfig = {
  einnahmen: { label: "Einnahmen", theme: { light: "#2a78d6", dark: "#3987e5" } },
  ausgaben: { label: "Ausgaben", theme: { light: "#008300", dark: "#008300" } },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function Firmenzahlen() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRaw[]>([]);
  const [payments, setPayments] = useState<PaymentRaw[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRaw[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invs, pays, purch] = await Promise.all([
        fetchAllRows<InvoiceRaw>((f, t) =>
          supabase
            .from("invoices")
            .select("id, typ, status, datum, netto_summe, brutto_summe, bezahlt_betrag, faellig_am")
            .in("typ", ["angebot", "rechnung", "anzahlungsrechnung", "schlussrechnung", "gutschrift"])
            .order("id")
            .range(f, t),
        ),
        fetchAllRows<PaymentRaw>((f, t) =>
          supabase.from("invoice_payments").select("invoice_id, betrag, datum").order("id").range(f, t),
        ),
        fetchAllRows<PurchaseRaw>((f, t) =>
          supabase
            .from("purchase_invoices")
            .select("betrag_netto, betrag_brutto, ust_satz, status, rechnungsdatum, created_at")
            .order("id")
            .range(f, t),
        ),
      ]);
      setInvoices(invs);
      setPayments(pays);
      setPurchases(purch);
    } catch (e) {
      toast.error("Fehler beim Laden der Firmenzahlen", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
    setLoading(false);
  };

  const data = useMemo(() => {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const todayIso = format(now, "yyyy-MM-dd");

    // Zahlungen je Rechnung; Rechnungen ohne erfasste Einzelzahlungen (ältere
    // Belege vor Einführung von invoice_payments) fallen auf bezahlt_betrag
    // zum Belegdatum zurück.
    const paymentsByInvoice = new Map<string, PaymentRaw[]>();
    for (const p of payments) {
      const list = paymentsByInvoice.get(p.invoice_id) || [];
      list.push(p);
      paymentsByInvoice.set(p.invoice_id, list);
    }

    /** Bezahlte Beträge (brutto) mit Datum je zahlbarer Rechnung. */
    const paidEntries: { datum: string; betrag: number }[] = [];
    for (const inv of invoices) {
      if (!PAYABLE_INVOICE_TYPES.has(inv.typ) || inv.status === "storniert") continue;
      const invPayments = paymentsByInvoice.get(inv.id);
      if (invPayments && invPayments.length > 0) {
        for (const p of invPayments) paidEntries.push({ datum: p.datum, betrag: Number(p.betrag) });
      } else if (Number(inv.bezahlt_betrag || 0) > 0) {
        paidEntries.push({ datum: inv.datum, betrag: Number(inv.bezahlt_betrag) });
      }
    }
    // Verrechnete Gutschriften mindern den bezahlten Umsatz (brutto).
    const gutschriftEntries = invoices
      .filter((i) => i.typ === "gutschrift" && i.status === "verrechnet")
      .map((i) => ({ datum: i.datum, betrag: Number(i.brutto_summe) }));

    // --- KPIs ---
    const umsatzBezahltJahr =
      paidEntries.filter((p) => p.datum.startsWith(currentYear)).reduce((s, p) => s + p.betrag, 0) -
      gutschriftEntries.filter((g) => g.datum.startsWith(currentYear)).reduce((s, g) => s + g.betrag, 0);

    const offene = invoices.filter(
      (i) => PAYABLE_INVOICE_TYPES.has(i.typ) && (i.status === "offen" || i.status === "teilbezahlt"),
    );
    const offenSumme = offene.reduce((s, i) => s + Number(i.brutto_summe) - Number(i.bezahlt_betrag || 0), 0);

    const ueberfaellige = offene.filter((i) => i.faellig_am && i.faellig_am < todayIso);
    const ueberfaelligSumme = ueberfaellige.reduce(
      (s, i) => s + Number(i.brutto_summe) - Number(i.bezahlt_betrag || 0),
      0,
    );

    const offeneAngebote = invoices.filter((i) => i.typ === "angebot" && i.status === "offen");
    const angebotsvolumen = offeneAngebote.reduce((s, i) => s + Number(i.netto_summe), 0);

    // --- Monats-Buckets (letzte 12 Monate inkl. laufendem Monat) ---
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = startOfMonth(subMonths(now, 11 - i));
      return { key: format(d, "yyyy-MM"), label: format(d, "MMM yy", { locale: de }) };
    });
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));

    const umsatzProMonat = months.map((m) => ({ label: m.label, umsatz: 0 }));
    for (const p of paidEntries) {
      const idx = monthIndex.get(monthKey(p.datum));
      if (idx !== undefined) umsatzProMonat[idx].umsatz += p.betrag;
    }
    for (const g of gutschriftEntries) {
      const idx = monthIndex.get(monthKey(g.datum));
      if (idx !== undefined) umsatzProMonat[idx].umsatz -= g.betrag;
    }

    const einnahmenAusgaben = months.map((m) => ({ label: m.label, einnahmen: 0, ausgaben: 0 }));
    for (const inv of invoices) {
      if (inv.status === "storniert") continue;
      const idx = monthIndex.get(monthKey(inv.datum));
      if (idx === undefined) continue;
      if (PAYABLE_INVOICE_TYPES.has(inv.typ)) einnahmenAusgaben[idx].einnahmen += Number(inv.netto_summe);
      else if (inv.typ === "gutschrift") einnahmenAusgaben[idx].einnahmen -= Number(inv.netto_summe);
    }
    for (const p of purchases) {
      if (p.status === "abgelehnt") continue;
      const d = p.rechnungsdatum ?? p.created_at;
      if (!d) continue;
      const idx = monthIndex.get(monthKey(d));
      if (idx !== undefined) einnahmenAusgaben[idx].ausgaben += purchaseNetto(p);
    }

    return {
      umsatzBezahltJahr,
      offenSumme,
      offenAnzahl: offene.length,
      ueberfaelligSumme,
      ueberfaelligAnzahl: ueberfaellige.length,
      angebotsvolumen,
      angeboteAnzahl: offeneAngebote.length,
      umsatzProMonat,
      einnahmenAusgaben,
      currentYear,
    };
  }, [invoices, payments, purchases]);

  if (loading) {
    return <p className="text-center py-8 text-muted-foreground">Lade...</p>;
  }

  const eurTooltipFormatter = (config: ChartConfig) =>
    // eslint-disable-next-line react/display-name
    (value: unknown, name: unknown, item: { color?: string; payload?: { fill?: string } }) => (
      <>
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: item.color || item.payload?.fill }}
        />
        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{formatEUR(Number(value))}</span>
        </div>
      </>
    );

  return (
    <div className="space-y-4">
      {/* KPI-Kacheln */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={`Umsatz bezahlt ${data.currentYear}`}
          value={formatEUR(data.umsatzBezahltJahr)}
          sub="brutto, abzügl. Gutschriften"
        />
        <KpiCard
          label="Offene Posten"
          value={formatEUR(data.offenSumme)}
          sub={`${data.offenAnzahl} ${data.offenAnzahl === 1 ? "Rechnung" : "Rechnungen"} (brutto, offen)`}
          valueClass="text-orange-600"
        />
        <KpiCard
          label="Überfällig"
          value={formatEUR(data.ueberfaelligSumme)}
          sub={`${data.ueberfaelligAnzahl} ${data.ueberfaelligAnzahl === 1 ? "Rechnung" : "Rechnungen"} über Fälligkeit`}
          valueClass={data.ueberfaelligAnzahl > 0 ? "text-red-600" : undefined}
        />
        <KpiCard
          label="Offenes Angebotsvolumen"
          value={formatEUR(data.angebotsvolumen)}
          sub={`${data.angeboteAnzahl} offene ${data.angeboteAnzahl === 1 ? "Angebot" : "Angebote"} (netto)`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Umsatz je Monat</CardTitle>
            <CardDescription>
              Bezahlte Beträge der letzten 12 Monate nach Zahlungsdatum (brutto, abzügl. verrechneter Gutschriften)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={umsatzChartConfig} className="h-[280px] w-full">
              <BarChart data={data.umsatzProMonat} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatEURAxis} />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  content={<ChartTooltipContent formatter={eurTooltipFormatter(umsatzChartConfig)} />}
                />
                <Bar dataKey="umsatz" fill="var(--color-umsatz)" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Einnahmen vs. Ausgaben je Monat</CardTitle>
            <CardDescription>
              Ausgangsrechnungen vs. Eingangsrechnungen nach Belegdatum (netto), letzte 12 Monate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={einnahmenAusgabenConfig} className="h-[280px] w-full">
              <BarChart data={data.einnahmenAusgaben} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatEURAxis} />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  content={<ChartTooltipContent formatter={eurTooltipFormatter(einnahmenAusgabenConfig)} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="einnahmen" fill="var(--color-einnahmen)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="ausgaben" fill="var(--color-ausgaben)" radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold mt-1", valueClass)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
