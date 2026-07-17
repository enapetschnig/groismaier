import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfYear, endOfYear, subYears, subMonths } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjectStatuses } from "@/hooks/useProjectStatuses";
import { getDocConfig } from "@/lib/documentTypes";
import { getStatusLabel } from "@/lib/statusColors";
import { formatDateShort } from "@/lib/dateFormat";
import { DEFAULT_STUNDENSATZ } from "@/lib/kalkulation";
import { cn } from "@/lib/utils";
import {
  PAYABLE_INVOICE_TYPES,
  ampelClass,
  ampelLabel,
  chunk,
  fetchAllRows,
  formatEUR,
  formatProzent,
  formatStunden,
  purchaseNetto,
} from "./shared";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

interface ProjectRaw {
  id: string;
  name: string;
  projektnummer: string | null;
  status: string | null;
}

interface InvoiceRaw {
  id: string;
  project_id: string | null;
  typ: string;
  status: string;
  nummer: string;
  datum: string;
  netto_summe: number;
}

interface ItemRaw {
  invoice_id: string;
  menge: number;
  arbeitszeit_minuten: number;
}

interface TimeEntryRaw {
  project_id: string | null;
  stunden: number;
  datum: string;
}

interface PurchaseRaw {
  id: string;
  project_id: string | null;
  lieferant: string;
  rechnungsnummer: string | null;
  rechnungsdatum: string | null;
  created_at: string | null;
  betrag_netto: number | null;
  betrag_brutto: number;
  ust_satz: number | null;
  status: string | null;
}

interface DocRef {
  id: string;
  typ: string;
  nummer: string;
  datum: string;
  netto: number;
  status: string;
}

interface PurchaseRef {
  id: string;
  lieferant: string;
  nummer: string | null;
  datum: string | null;
  netto: number;
}

interface ProjectRow {
  id: string;
  name: string;
  projektnummer: string | null;
  status: string | null;
  sollNetto: number;
  sollStunden: number;
  sollDocs: DocRef[];
  verrechnetNetto: number;
  rechnungDocs: DocRef[]; // Rechnungen + Gutschriften (Gutschrift-Netto negativ)
  istStunden: number;
  lohnkosten: number;
  fremdkosten: number;
  purchaseDocs: PurchaseRef[];
  basis: number;
  basisIsSoll: boolean;
  db: number;
  marge: number | null;
}

type SortKey =
  | "name"
  | "sollNetto"
  | "verrechnetNetto"
  | "sollStunden"
  | "istStunden"
  | "lohnkosten"
  | "fremdkosten"
  | "db"
  | "marge";

type Zeitraum = "gesamt" | "jahr" | "vorjahr" | "12m" | "6m";

const ZEITRAUM_LABELS: Record<Zeitraum, string> = {
  gesamt: "Gesamter Zeitraum",
  jahr: "Laufendes Jahr",
  vorjahr: "Letztes Jahr",
  "12m": "Letzte 12 Monate",
  "6m": "Letzte 6 Monate",
};

function zeitraumRange(z: Zeitraum): { from: string; to: string } | null {
  const now = new Date();
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  switch (z) {
    case "gesamt":
      return null;
    case "jahr":
      return { from: iso(startOfYear(now)), to: iso(now) };
    case "vorjahr": {
      const prev = subYears(now, 1);
      return { from: iso(startOfYear(prev)), to: iso(endOfYear(prev)) };
    }
    case "12m":
      return { from: iso(subMonths(now, 12)), to: iso(now) };
    case "6m":
      return { from: iso(subMonths(now, 6)), to: iso(now) };
  }
}

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function ProjektNachkalkulation() {
  const { statuses: projectStatuses } = useProjectStatuses();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectRaw[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRaw[]>([]);
  const [sollStundenByInvoice, setSollStundenByInvoice] = useState<Record<string, number>>({});
  const [timeEntries, setTimeEntries] = useState<TimeEntryRaw[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRaw[]>([]);

  // Filter & Parameter
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [zeitraum, setZeitraum] = useState<Zeitraum>("gesamt");
  const [stundensatzInput, setStundensatzInput] = useState(String(DEFAULT_STUNDENSATZ));
  const stundensatz = useMemo(() => {
    const n = parseFloat(stundensatzInput.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_STUNDENSATZ;
  }, [stundensatzInput]);

  const [sortKey, setSortKey] = useState<SortKey>("db");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projs, invs, entries, purch] = await Promise.all([
        fetchAllRows<ProjectRaw>((f, t) =>
          supabase.from("projects").select("id, name, projektnummer, status").order("name").order("id").range(f, t),
        ),
        fetchAllRows<InvoiceRaw>((f, t) =>
          supabase
            .from("invoices")
            .select("id, project_id, typ, status, nummer, datum, netto_summe")
            .not("project_id", "is", null)
            .in("typ", ["angebot", "auftragsbestaetigung", "rechnung", "anzahlungsrechnung", "schlussrechnung", "gutschrift"])
            .order("id")
            .range(f, t),
        ),
        fetchAllRows<TimeEntryRaw>((f, t) =>
          supabase
            .from("time_entries")
            .select("project_id, stunden, datum")
            .not("project_id", "is", null)
            .order("id")
            .range(f, t),
        ),
        fetchAllRows<PurchaseRaw>((f, t) =>
          supabase
            .from("purchase_invoices")
            .select("id, project_id, lieferant, rechnungsnummer, rechnungsdatum, created_at, betrag_netto, betrag_brutto, ust_satz, status")
            .not("project_id", "is", null)
            .order("id")
            .range(f, t),
        ),
      ]);

      // Soll-Stunden: invoice_items der Soll-Belege (AB + angenommene Angebote).
      // arbeitszeit_minuten ist "pro Einheit" (vgl. src/lib/kalkulation.ts),
      // daher Menge × Minuten / 60.
      const sollDocIds = invs
        .filter(
          (i) =>
            (i.typ === "auftragsbestaetigung" && i.status !== "storniert") ||
            (i.typ === "angebot" && i.status === "angenommen"),
        )
        .map((i) => i.id);

      const itemChunks = await Promise.all(
        chunk(sollDocIds, 150).map((ids) =>
          fetchAllRows<ItemRaw>((f, t) =>
            supabase
              .from("invoice_items")
              .select("invoice_id, menge, arbeitszeit_minuten")
              .in("invoice_id", ids)
              .order("id")
              .range(f, t),
          ),
        ),
      );
      const hours: Record<string, number> = {};
      for (const item of itemChunks.flat()) {
        const h = (Number(item.menge) * Number(item.arbeitszeit_minuten)) / 60;
        hours[item.invoice_id] = (hours[item.invoice_id] || 0) + h;
      }

      setProjects(projs);
      setInvoices(invs);
      setTimeEntries(entries);
      setPurchases(purch);
      setSollStundenByInvoice(hours);
    } catch (e) {
      toast.error("Fehler beim Laden der Nachkalkulation", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
    setLoading(false);
  };

  // ------------------------------------------------------------------
  // Aggregation je Projekt (clientseitig)
  // ------------------------------------------------------------------
  const rows = useMemo<ProjectRow[]>(() => {
    const range = zeitraumRange(zeitraum);
    const inRange = (d: string | null | undefined): boolean => {
      if (!range) return true;
      if (!d) return false;
      const key = d.slice(0, 10);
      return key >= range.from && key <= range.to;
    };

    const invByProject = new Map<string, InvoiceRaw[]>();
    for (const inv of invoices) {
      if (!inv.project_id) continue;
      const list = invByProject.get(inv.project_id) || [];
      list.push(inv);
      invByProject.set(inv.project_id, list);
    }
    const hoursByProject = new Map<string, number>();
    for (const te of timeEntries) {
      if (!te.project_id || !inRange(te.datum)) continue;
      hoursByProject.set(te.project_id, (hoursByProject.get(te.project_id) || 0) + Number(te.stunden));
    }
    const purchasesByProject = new Map<string, PurchaseRaw[]>();
    for (const p of purchases) {
      if (!p.project_id || p.status === "abgelehnt") continue;
      if (!inRange(p.rechnungsdatum ?? p.created_at)) continue;
      const list = purchasesByProject.get(p.project_id) || [];
      list.push(p);
      purchasesByProject.set(p.project_id, list);
    }

    const result: ProjectRow[] = [];
    for (const proj of projects) {
      if (statusFilter !== "alle" && (proj.status || "").toLowerCase() !== statusFilter.toLowerCase()) continue;

      const projInvoices = invByProject.get(proj.id) || [];

      // Soll: Auftragsbestätigungen, sonst angenommene Angebote
      const abs = projInvoices.filter((i) => i.typ === "auftragsbestaetigung" && i.status !== "storniert");
      const sollSource = abs.length > 0 ? abs : projInvoices.filter((i) => i.typ === "angebot" && i.status === "angenommen");
      const sollDocs: DocRef[] = sollSource.map((i) => ({
        id: i.id,
        typ: i.typ,
        nummer: i.nummer,
        datum: i.datum,
        netto: Number(i.netto_summe),
        status: i.status,
      }));
      const sollNetto = sollDocs.reduce((s, d) => s + d.netto, 0);
      const sollStunden = sollSource.reduce((s, i) => s + (sollStundenByInvoice[i.id] || 0), 0);

      // Ist: verrechnete Beträge (Beleg-Summen wie gespeichert; die
      // Schlussrechnung enthält Anzahlungs-Abzüge bereits als negative
      // Positionen). Gutschriften werden abgezogen.
      const rechnungDocs: DocRef[] = [];
      let verrechnetNetto = 0;
      for (const i of projInvoices) {
        if (i.status === "storniert" || !inRange(i.datum)) continue;
        if (PAYABLE_INVOICE_TYPES.has(i.typ)) {
          rechnungDocs.push({ id: i.id, typ: i.typ, nummer: i.nummer, datum: i.datum, netto: Number(i.netto_summe), status: i.status });
          verrechnetNetto += Number(i.netto_summe);
        } else if (i.typ === "gutschrift") {
          rechnungDocs.push({ id: i.id, typ: i.typ, nummer: i.nummer, datum: i.datum, netto: -Number(i.netto_summe), status: i.status });
          verrechnetNetto -= Number(i.netto_summe);
        }
      }

      const istStunden = hoursByProject.get(proj.id) || 0;
      const lohnkosten = istStunden * stundensatz;

      const projPurchases = purchasesByProject.get(proj.id) || [];
      const purchaseDocs: PurchaseRef[] = projPurchases.map((p) => ({
        id: p.id,
        lieferant: p.lieferant,
        nummer: p.rechnungsnummer,
        datum: p.rechnungsdatum ?? p.created_at,
        netto: purchaseNetto(p),
      }));
      const fremdkosten = purchaseDocs.reduce((s, p) => s + p.netto, 0);

      // Deckungsbeitrag: Basis = Verrechnet; solange nichts verrechnet
      // wurde, die Auftragssumme (gekennzeichnet als "Soll-Basis").
      const basisIsSoll = rechnungDocs.length === 0 && sollNetto > 0;
      const basis = basisIsSoll ? sollNetto : verrechnetNetto;
      const db = basis - lohnkosten - fremdkosten;
      const marge = basis > 0 ? (db / basis) * 100 : null;

      const hasIst = rechnungDocs.length > 0 || istStunden > 0 || purchaseDocs.length > 0;
      const hasAny = hasIst || sollNetto !== 0;
      // Bei eingeschränktem Zeitraum nur Projekte mit Ist-Aktivität im
      // Zeitraum, sonst alle Projekte mit irgendwelchen Zahlen.
      if (range ? !hasIst : !hasAny) continue;

      result.push({
        id: proj.id,
        name: proj.name,
        projektnummer: proj.projektnummer,
        status: proj.status,
        sollNetto,
        sollStunden,
        sollDocs,
        verrechnetNetto,
        rechnungDocs,
        istStunden,
        lohnkosten,
        fremdkosten,
        purchaseDocs,
        basis,
        basisIsSoll,
        db,
        marge,
      });
    }
    return result;
  }, [projects, invoices, sollStundenByInvoice, timeEntries, purchases, statusFilter, zeitraum, stundensatz]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "de") * dir;
      if (sortKey === "marge") {
        // null (keine Basis) immer ans Ende
        if (a.marge === null && b.marge === null) return 0;
        if (a.marge === null) return 1;
        if (b.marge === null) return -1;
        return (a.marge - b.marge) * dir;
      }
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = {
      sollNetto: 0,
      verrechnetNetto: 0,
      sollStunden: 0,
      istStunden: 0,
      lohnkosten: 0,
      fremdkosten: 0,
      basis: 0,
      db: 0,
    };
    for (const r of rows) {
      t.sollNetto += r.sollNetto;
      t.verrechnetNetto += r.verrechnetNetto;
      t.sollStunden += r.sollStunden;
      t.istStunden += r.istStunden;
      t.lohnkosten += r.lohnkosten;
      t.fremdkosten += r.fremdkosten;
      t.basis += r.basis;
      t.db += r.db;
    }
    const marge = t.basis > 0 ? (t.db / t.basis) * 100 : null;
    return { ...t, marge };
  }, [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const SortHead = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 px-2 -ml-2 gap-1 font-medium", className?.includes("text-right") && "-mr-2 ml-0")}
        onClick={() => toggleSort(k)}
      >
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </Button>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Filterzeile — gilt für Tabelle und Summenzeile */}
      <Card>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Zeitraum (Ist-Daten)</Label>
            <Select value={zeitraum} onValueChange={(v) => setZeitraum(v as Zeitraum)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ZEITRAUM_LABELS) as Zeitraum[]).map((z) => (
                  <SelectItem key={z} value={z}>{ZEITRAUM_LABELS[z]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Projektstatus</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Status</SelectItem>
                {projectStatuses.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nk-stundensatz" className="text-xs text-muted-foreground">
              Kalkulatorischer Stundensatz (€/h)
            </Label>
            <Input
              id="nk-stundensatz"
              type="number"
              min="0"
              step="0.5"
              value={stundensatzInput}
              onChange={(e) => setStundensatzInput(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 lg:pb-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Lohnkosten Ist = erfasste Stunden × Stundensatz. Alle Beträge netto.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground">Lade...</p>
      ) : sortedRows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Keine Projekte mit Zahlen im gewählten Zeitraum/Status.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <SortHead label="Projekt" k="name" />
                  <TableHead>Status</TableHead>
                  <SortHead label="Auftrag (Soll)" k="sollNetto" className="text-right" />
                  <SortHead label="Verrechnet (Ist)" k="verrechnetNetto" className="text-right" />
                  <SortHead label="Std. Soll" k="sollStunden" className="text-right" />
                  <SortHead label="Std. Ist" k="istStunden" className="text-right" />
                  <SortHead label="Lohn Ist" k="lohnkosten" className="text-right" />
                  <SortHead label="Fremd Ist" k="fremdkosten" className="text-right" />
                  <SortHead label="DB" k="db" className="text-right" />
                  <SortHead label="Marge" k="marge" className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((r) => (
                  <ProjectTableRow
                    key={r.id}
                    row={r}
                    expanded={expanded.has(r.id)}
                    onToggle={() => toggleExpand(r.id)}
                    stundensatz={stundensatz}
                  />
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell />
                  <TableCell className="font-semibold">Summe ({sortedRows.length} Projekte)</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold tabular-nums">{formatEUR(totals.sollNetto)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatEUR(totals.verrechnetNetto)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatStunden(totals.sollStunden)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatStunden(totals.istStunden)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatEUR(totals.lohnkosten)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatEUR(totals.fremdkosten)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", totals.db < 0 && "text-red-600")}>
                    {formatEUR(totals.db)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    <span className="inline-flex items-center gap-1.5 justify-end">
                      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", ampelClass(totals.marge))} />
                      {formatProzent(totals.marge)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Ampel: <span className="inline-block h-2 w-2 rounded-full bg-[#0ca30c]" /> Marge ≥ 20 % ·{" "}
        <span className="inline-block h-2 w-2 rounded-full bg-[#fab219]" /> 5–20 % ·{" "}
        <span className="inline-block h-2 w-2 rounded-full bg-[#d03b3b]" /> &lt; 5 %. „Soll-Basis":
        Es wurde noch nichts verrechnet, Deckungsbeitrag und Marge beziehen sich auf die Auftragssumme.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabellenzeile + aufklappbares Detail
// ---------------------------------------------------------------------------

function ProjectTableRow({
  row,
  expanded,
  onToggle,
  stundensatz,
}: {
  row: ProjectRow;
  expanded: boolean;
  onToggle: () => void;
  stundensatz: number;
}) {
  const stundenDiff = row.istStunden - row.sollStunden;
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="py-2 pr-0">
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        </TableCell>
        <TableCell className="py-2">
          <div className="flex items-center gap-2 min-w-[180px]">
            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", ampelClass(row.marge))} title={ampelLabel(row.marge)} />
            <div className="min-w-0">
              <Link
                to={`/projects/${row.id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium hover:underline truncate block"
              >
                {row.name}
              </Link>
              {row.projektnummer && <span className="text-xs text-muted-foreground">{row.projektnummer}</span>}
            </div>
          </div>
        </TableCell>
        <TableCell className="py-2">
          {row.status ? <Badge variant="outline" className="whitespace-nowrap">{getStatusLabel(row.status)}</Badge> : "—"}
        </TableCell>
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
          {row.sollNetto !== 0 ? formatEUR(row.sollNetto) : "—"}
        </TableCell>
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
          {row.rechnungDocs.length > 0 ? formatEUR(row.verrechnetNetto) : "—"}
        </TableCell>
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
          {row.sollStunden > 0 ? formatStunden(row.sollStunden) : "—"}
        </TableCell>
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
          {row.istStunden > 0 ? formatStunden(row.istStunden) : "—"}
        </TableCell>
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(row.lohnkosten)}</TableCell>
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(row.fremdkosten)}</TableCell>
        <TableCell className={cn("py-2 text-right tabular-nums whitespace-nowrap font-medium", row.db < 0 && "text-red-600")}>
          <span className="inline-flex items-center gap-1.5">
            {row.basisIsSoll && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 font-normal" title="Noch nichts verrechnet — Basis ist die Auftragssumme">
                Soll-Basis
              </Badge>
            )}
            {formatEUR(row.db)}
          </span>
        </TableCell>
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">{formatProzent(row.marge)}</TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={11} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {/* Stunden-Vergleich */}
              <div>
                <p className="font-semibold mb-2">Stunden & Lohn (Soll/Ist)</p>
                <div className="space-y-1">
                  <DetailLine label="Soll-Stunden (Kalkulation)" value={row.sollStunden > 0 ? formatStunden(row.sollStunden) : "—"} />
                  <DetailLine label="Ist-Stunden (Zeiterfassung)" value={formatStunden(row.istStunden)} />
                  <DetailLine
                    label="Differenz"
                    value={`${stundenDiff > 0 ? "+" : ""}${formatStunden(stundenDiff)}`}
                    valueClass={row.sollStunden > 0 ? (stundenDiff > 0 ? "text-red-600" : "text-green-600") : undefined}
                  />
                  <DetailLine label="Lohnkosten Soll" value={formatEUR(row.sollStunden * stundensatz)} />
                  <DetailLine label="Lohnkosten Ist" value={formatEUR(row.lohnkosten)} />
                </div>
              </div>

              {/* Ausgangsbelege */}
              <div>
                <p className="font-semibold mb-2">Belege (Ausgang)</p>
                {row.sollDocs.length === 0 && row.rechnungDocs.length === 0 ? (
                  <p className="text-muted-foreground">Keine Belege</p>
                ) : (
                  <div className="space-y-1">
                    {row.sollDocs.map((d) => (
                      <BelegLine key={d.id} doc={d} />
                    ))}
                    {row.rechnungDocs.map((d) => (
                      <BelegLine key={d.id} doc={d} />
                    ))}
                  </div>
                )}
              </div>

              {/* Eingangsrechnungen */}
              <div>
                <p className="font-semibold mb-2">Eingangsrechnungen (Fremdkosten)</p>
                {row.purchaseDocs.length === 0 ? (
                  <p className="text-muted-foreground">Keine Eingangsrechnungen</p>
                ) : (
                  <div className="space-y-1">
                    {row.purchaseDocs.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {p.lieferant}
                          {p.nummer && <span className="text-muted-foreground"> #{p.nummer}</span>}
                          <span className="text-muted-foreground"> · {formatDateShort(p.datum)}</span>
                        </span>
                        <span className="tabular-nums whitespace-nowrap">{formatEUR(p.netto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function DetailLine({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums font-medium", valueClass)}>{value}</span>
    </div>
  );
}

function BelegLine({ doc }: { doc: DocRef }) {
  const cfg = getDocConfig(doc.typ);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 min-w-0">
        <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0">{cfg.shortLabel}</Badge>
        <Link to={`/invoices/${doc.id}`} className="truncate hover:underline">{doc.nummer}</Link>
        <span className="text-muted-foreground whitespace-nowrap">· {formatDateShort(doc.datum)}</span>
        <span className="text-muted-foreground text-xs whitespace-nowrap hidden sm:inline">({getStatusLabel(doc.status)})</span>
      </span>
      <span className={cn("tabular-nums whitespace-nowrap", doc.netto < 0 && "text-red-600")}>{formatEUR(doc.netto)}</span>
    </div>
  );
}
