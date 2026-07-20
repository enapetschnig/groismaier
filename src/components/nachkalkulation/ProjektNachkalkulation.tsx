import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfYear, endOfYear, subYears, subMonths } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjectStatuses } from "@/hooks/useProjectStatuses";
import { getDocConfig } from "@/lib/documentTypes";
import { getStatusLabel } from "@/lib/statusColors";
import { formatDateShort } from "@/lib/dateFormat";
import { istArbeitszeitZeile } from "@/lib/stunden";
import { cn } from "@/lib/utils";
import {
  AMPEL,
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
  position: number;
  beschreibung: string;
  kurztext: string | null;
  menge: number;
  einheit: string | null;
  arbeitszeit_minuten: number;
}

interface TimeEntryRaw {
  project_id: string | null;
  user_id: string;
  stunden: number;
  taetigkeit: string | null;
  datum: string;
}

interface EmployeeRaw {
  user_id: string | null;
  stundenlohn: number | null;
  vorname: string | null;
  nachname: string | null;
}

/** Eine Zeile der Mitarbeiter-Aufschlüsselung eines Projekts. */
interface MitarbeiterStunden {
  userId: string;
  name: string;
  stunden: number;
  lohnkosten: number;
}

/** profiles ist (noch) nicht in den generierten Supabase-Typen → Cast beim Query. */
interface ProfileRaw {
  id: string;
  vorname: string | null;
  nachname: string | null;
}

interface MaterialRaw {
  project_id: string | null;
  typ: string | null;
  menge: string | null;
  einzelpreis: number | null;
  datum: string | null;
  created_at: string;
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

// purchase_invoice_allocations ist (noch) nicht in den generierten Supabase-
// Typen — lokales Interface + Cast (Repo-Muster, types.ts nicht regenerieren).
interface AllocationRaw {
  project_id: string;
  purchase_invoice_id: string;
  betrag_netto: number;
  beschreibung: string | null;
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
  /** true = Teilbetrag (Positions-Aufteilung) einer geteilten Eingangsrechnung */
  anteil?: boolean;
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
  /** Ist-Stunden je Mitarbeiter, absteigend nach Stunden. */
  mitarbeiter: MitarbeiterStunden[];
  materialkosten: number;
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
  | "materialkosten"
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

/** Abwesenheiten zählen nicht als produktive Projektstunden/Lohnkosten. */
const ABWESENHEIT = new Set(["Urlaub", "Krankenstand", "Feiertag", "Zeitausgleich", "Weiterbildung"]);

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

/** Soll-Stunden einer Angebots-/Rechnungszeile (Lutz-Heuristik):
 *  explizite Stunden-Position → Menge zählt 1:1, sonst kalkulierte
 *  Arbeitszeit (arbeitszeit_minuten ist "pro Einheit" → × Menge / 60). */
function positionStunden(item: ItemRaw): number {
  const name = item.kurztext || item.beschreibung || "";
  if (istArbeitszeitZeile(name, item.einheit)) return Number(item.menge) || 0;
  return ((Number(item.arbeitszeit_minuten) || 0) * (Number(item.menge) || 0)) / 60;
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
  const [materialEntries, setMaterialEntries] = useState<MaterialRaw[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRaw[]>([]);
  const [allocations, setAllocations] = useState<AllocationRaw[]>([]);
  const [lohnByUser, setLohnByUser] = useState<Record<string, number>>({});
  // Anzeigenamen je user_id (employees) für die Mitarbeiter-Aufschlüsselung
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  // Lohnnebenkosten-Faktor (app_settings, Admin → Einstellungen), Default 1,8
  const [faktor, setFaktor] = useState(1.8);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [zeitraum, setZeitraum] = useState<Zeitraum>("gesamt");

  const [sortKey, setSortKey] = useState<SortKey>("db");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projs, invs, entries, mats, purch, allocs, emps, profs, factRes] = await Promise.all([
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
            .select("project_id, user_id, stunden, taetigkeit, datum")
            .not("project_id", "is", null)
            .order("id")
            .range(f, t),
        ),
        fetchAllRows<MaterialRaw>((f, t) =>
          supabase
            .from("material_entries")
            .select("project_id, typ, menge, einzelpreis, datum, created_at")
            .not("project_id", "is", null)
            .order("id")
            .range(f, t),
        ),
        // OHNE project_id-Filter: auch Rechnungen ohne Kopf-Projekt können per
        // Positions-Aufteilung (allocations) Projekten zugeordnet sein.
        fetchAllRows<PurchaseRaw>((f, t) =>
          supabase
            .from("purchase_invoices")
            .select("id, project_id, lieferant, rechnungsnummer, rechnungsdatum, created_at, betrag_netto, betrag_brutto, ust_satz, status")
            .order("id")
            .range(f, t),
        ),
        // Teilbeträge geteilter Eingangsrechnungen; Tabelle kann in frischen
        // Umgebungen fehlen (Migration noch nicht eingespielt) → leer weiter.
        fetchAllRows<AllocationRaw>((f, t) =>
          (supabase.from("purchase_invoice_allocations" as never) as any)
            .select("project_id, purchase_invoice_id, betrag_netto, beschreibung")
            .order("id")
            .range(f, t),
        ).catch(() => [] as AllocationRaw[]),
        fetchAllRows<EmployeeRaw>((f, t) =>
          supabase.from("employees").select("user_id, stundenlohn, vorname, nachname").order("id").range(f, t),
        ),
        // Namens-Fallback für Zeitbucher ohne employees-Datensatz.
        fetchAllRows<ProfileRaw>((f, t) =>
          (supabase.from("profiles" as never) as any)
            .select("id, vorname, nachname")
            .order("id")
            .range(f, t),
        ).catch(() => [] as ProfileRaw[]),
        supabase.from("app_settings").select("value").eq("key", "lohnnebenkosten_faktor").maybeSingle(),
      ]);

      // Soll-Stunden: invoice_items der Soll-Belege (AB + angenommene Angebote)
      // per Lutz-Heuristik: explizite Stunden-Positionen zählen 1:1, sonst
      // kalkulierte Arbeitszeit (Menge × arbeitszeit_minuten / 60).
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
              .select("invoice_id, position, beschreibung, kurztext, menge, einheit, arbeitszeit_minuten")
              .in("invoice_id", ids)
              .order("id")
              .range(f, t),
          ),
        ),
      );
      const hours: Record<string, number> = {};
      for (const item of itemChunks.flat()) {
        hours[item.invoice_id] = (hours[item.invoice_id] || 0) + positionStunden(item);
      }

      const wages: Record<string, number> = {};
      const names: Record<string, string> = {};
      // profiles zuerst, employees gewinnt (Personalstamm ist die Leitquelle).
      for (const p of profs) {
        const name = `${p.vorname || ""} ${p.nachname || ""}`.trim();
        if (p.id && name) names[p.id] = name;
      }
      for (const e of emps) {
        if (!e.user_id) continue;
        wages[e.user_id] = Number(e.stundenlohn) || 0;
        const name = `${e.vorname || ""} ${e.nachname || ""}`.trim();
        if (name) names[e.user_id] = name;
      }

      setProjects(projs);
      setInvoices(invs);
      setTimeEntries(entries);
      setMaterialEntries(mats);
      setPurchases(purch);
      setAllocations(allocs);
      setLohnByUser(wages);
      setNameByUser(names);
      setFaktor(Number(factRes.data?.value) || 1.8);
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

    // Stunden + Lohnkosten (Mitarbeiter-Stundenlohn × Lohnnebenkosten-Faktor),
    // Abwesenheits-Tätigkeiten ausgefiltert.
    const hoursByProject = new Map<string, number>();
    const lohnByProject = new Map<string, number>();
    // Zusätzlich je Projekt die Stunden je Mitarbeiter (user_id → Stunden) —
    // im selben Durchlauf, damit kein zweiter Pass über alle Buchungen nötig ist.
    const perUserByProject = new Map<string, Map<string, number>>();
    for (const te of timeEntries) {
      // Buchungen ohne Projekt (z.B. Kostenstelle Werkstatt/Büro ohne
      // Projektbezug) tauchen nirgends auf; die Kostenstelle selbst spielt
      // keine Rolle — projektbezogene Werkstattstunden gehören zum Projekt.
      if (!te.project_id || !inRange(te.datum)) continue;
      if (te.taetigkeit && ABWESENHEIT.has(te.taetigkeit)) continue;
      const std = Number(te.stunden) || 0;
      hoursByProject.set(te.project_id, (hoursByProject.get(te.project_id) || 0) + std);
      lohnByProject.set(te.project_id, (lohnByProject.get(te.project_id) || 0) + std * (lohnByUser[te.user_id] || 0) * faktor);
      const perUser = perUserByProject.get(te.project_id) || new Map<string, number>();
      perUser.set(te.user_id, (perUser.get(te.user_id) || 0) + std);
      perUserByProject.set(te.project_id, perUser);
    }

    // Materialkosten: Entnahme + Verbrauch − Rückgabe, jeweils Menge × EK.
    const materialByProject = new Map<string, number>();
    for (const m of materialEntries) {
      if (!m.project_id || !inRange(m.datum ?? m.created_at)) continue;
      const menge = parseFloat(String(m.menge || "0")) || 0;
      const ek = Number(m.einzelpreis) || 0;
      const delta = m.typ === "entnahme" || m.typ === "verbrauch" ? menge * ek : m.typ === "rueckgabe" ? -menge * ek : 0;
      if (delta !== 0) materialByProject.set(m.project_id, (materialByProject.get(m.project_id) || 0) + delta);
    }

    // Fremdkosten: Teilbeträge (allocations) zählen immer zu ihrem Projekt;
    // der Kopf-Betrag einer Rechnung zählt nur, wenn die Rechnung KEINE
    // Teilbeträge hat (Anti-Doppelzählung).
    const purchaseById = new Map<string, PurchaseRaw>();
    for (const p of purchases) purchaseById.set(p.id, p);
    const idsMitAufteilung = new Set(allocations.map((a) => a.purchase_invoice_id));

    const purchasesByProject = new Map<string, PurchaseRef[]>();
    for (const p of purchases) {
      if (!p.project_id || p.status === "abgelehnt" || idsMitAufteilung.has(p.id)) continue;
      if (!inRange(p.rechnungsdatum ?? p.created_at)) continue;
      const list = purchasesByProject.get(p.project_id) || [];
      list.push({ id: p.id, lieferant: p.lieferant, nummer: p.rechnungsnummer, datum: p.rechnungsdatum ?? p.created_at, netto: purchaseNetto(p) });
      purchasesByProject.set(p.project_id, list);
    }
    for (const a of allocations) {
      const parent = purchaseById.get(a.purchase_invoice_id);
      if (!parent || parent.status === "abgelehnt") continue;
      if (!inRange(parent.rechnungsdatum ?? parent.created_at)) continue;
      const list = purchasesByProject.get(a.project_id) || [];
      list.push({
        id: `${a.purchase_invoice_id}-${list.length}`,
        lieferant: a.beschreibung ? `${parent.lieferant} — ${a.beschreibung}` : parent.lieferant,
        nummer: parent.rechnungsnummer,
        datum: parent.rechnungsdatum ?? parent.created_at,
        netto: Number(a.betrag_netto) || 0,
        anteil: true,
      });
      purchasesByProject.set(a.project_id, list);
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
      const lohnkosten = lohnByProject.get(proj.id) || 0;
      const materialkosten = materialByProject.get(proj.id) || 0;

      const mitarbeiter: MitarbeiterStunden[] = [...(perUserByProject.get(proj.id) || new Map())]
        .map(([userId, stunden]) => ({
          userId,
          name: nameByUser[userId] || "Unbekannt",
          stunden,
          lohnkosten: stunden * (lohnByUser[userId] || 0) * faktor,
        }))
        .sort((a, b) => b.stunden - a.stunden);

      const purchaseDocs = purchasesByProject.get(proj.id) || [];
      const fremdkosten = purchaseDocs.reduce((s, p) => s + p.netto, 0);

      // Deckungsbeitrag: Basis = Verrechnet; solange nichts verrechnet
      // wurde, die Auftragssumme (gekennzeichnet als "Soll-Basis").
      const basisIsSoll = rechnungDocs.length === 0 && sollNetto > 0;
      const basis = basisIsSoll ? sollNetto : verrechnetNetto;
      const db = basis - lohnkosten - materialkosten - fremdkosten;
      const marge = basis > 0 ? (db / basis) * 100 : null;

      const hasIst = rechnungDocs.length > 0 || istStunden > 0 || purchaseDocs.length > 0 || materialkosten !== 0;
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
        mitarbeiter,
        materialkosten,
        fremdkosten,
        purchaseDocs,
        basis,
        basisIsSoll,
        db,
        marge,
      });
    }
    return result;
  }, [projects, invoices, sollStundenByInvoice, timeEntries, materialEntries, purchases, allocations, lohnByUser, nameByUser, faktor, statusFilter, zeitraum]);

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
      materialkosten: 0,
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
      t.materialkosten += r.materialkosten;
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
            <Label className="text-xs text-muted-foreground">Lohnnebenkosten-Faktor</Label>
            <p className="text-sm font-medium tabular-nums h-10 flex items-center">
              × {faktor.toLocaleString("de-AT")}
              <span className="ml-2 text-xs font-normal text-muted-foreground">(Admin → Einstellungen)</span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 lg:pb-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Lohnkosten Ist = erfasste Stunden × Mitarbeiter-Stundenlohn × Faktor. Alle Beträge netto.
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
                  <SortHead label="Material Ist" k="materialkosten" className="text-right" />
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
                  <TableCell className="text-right font-semibold tabular-nums">{formatEUR(totals.materialkosten)}</TableCell>
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
}: {
  row: ProjectRow;
  expanded: boolean;
  onToggle: () => void;
}) {
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
        <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
          {row.materialkosten !== 0 ? formatEUR(row.materialkosten) : "—"}
        </TableCell>
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
          {/* Die Detailzelle erbt die Breite der 12-spaltigen Tabelle, die am
              Handy breiter als der Viewport ist. Der Inhalt wird daher auf
              Viewport-Breite begrenzt und mitgescrollt fixiert (sticky), damit
              am Handy nichts rechts abgeschnitten liegt. Ab md normale Breite. */}
          <TableCell colSpan={12} className="p-0">
            <div className="sticky left-0 w-[calc(100vw-2rem)] p-4 md:static md:w-auto">
            {/* Soll/Ist-Stunden + Aufschlüsselung je Mitarbeiter — zuoberst,
                weil das die meistgestellte Frage der Nachkalkulation ist. */}
            <StundenAufschluesselung row={row} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {/* Kosten-Ist (Stunden-Soll/Ist steht oben im Stunden-Block) */}
              <div>
                <p className="font-semibold mb-2">Kosten (Ist)</p>
                <div className="space-y-1">
                  <DetailLine label="Lohnkosten (Lohn × Faktor)" value={formatEUR(row.lohnkosten)} />
                  <DetailLine label="Materialkosten" value={formatEUR(row.materialkosten)} />
                  <DetailLine label="Fremdkosten" value={formatEUR(row.fremdkosten)} />
                  <DetailLine
                    label="Deckungsbeitrag"
                    value={formatEUR(row.db)}
                    valueClass={row.db < 0 ? "text-red-600" : undefined}
                  />
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
                          {p.anteil && (
                            <Badge variant="outline" className="ml-1 text-[10px] py-0 h-4 font-normal" title="Teilbetrag einer auf mehrere Projekte aufgeteilten Rechnung">
                              Anteil
                            </Badge>
                          )}
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

            {/* Alle Positionen der Angebots-/Rechnungsbelege mit Soll-Stunden */}
            <PositionenDetail row={row} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * Stunden-Block des Projekt-Details:
 *   1. Soll/Ist-Zeile „Angeboten · Gebucht · Abweichung" mit Auslastungs-Ampel
 *      (grün ≤ 100 %, gelb ≤ 110 %, rot > 110 %).
 *   2. Tabelle „Stunden je Mitarbeiter" — wer wie viele Stunden auf das Projekt
 *      gebucht hat, samt Lohnkosten (Std × Stundenlohn × Faktor) und Anteil.
 * Rendert nur im aufgeklappten Zustand; die Zahlen stammen aus den bereits
 * geladenen Zeitbuchungen, es ist also kein Nachladen nötig.
 */
function StundenAufschluesselung({ row }: { row: ProjectRow }) {
  const { sollStunden, istStunden, mitarbeiter } = row;
  const diff = istStunden - sollStunden;
  const auslastung = sollStunden > 0 ? (istStunden / sollStunden) * 100 : null;
  const diffProzent = sollStunden > 0 ? (diff / sollStunden) * 100 : null;

  // Ampel der Stunden-Auslastung (eigene Skala, NICHT die Marge-Ampel).
  const ampel =
    auslastung === null
      ? { dot: AMPEL.neutral, text: "", box: "border-border bg-background/60" }
      : auslastung <= 100
        ? { dot: AMPEL.gruen, text: "text-[#0ca30c]", box: "border-[#0ca30c]/40 bg-[#0ca30c]/5" }
        : auslastung <= 110
          ? { dot: AMPEL.gelb, text: "text-[#a97a0a]", box: "border-[#fab219]/50 bg-[#fab219]/10" }
          : { dot: AMPEL.rot, text: "text-[#d03b3b]", box: "border-[#d03b3b]/40 bg-[#d03b3b]/5" };

  const summeStunden = mitarbeiter.reduce((s, m) => s + m.stunden, 0);
  const summeLohn = mitarbeiter.reduce((s, m) => s + m.lohnkosten, 0);
  const vz = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

  return (
    <div className="mb-4 text-sm">
      {/* Soll/Ist prominent */}
      <div className={cn("rounded-md border px-3 py-2.5", ampel.box)}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className={cn("h-3 w-3 rounded-full shrink-0", ampel.dot)} />
          <span className="whitespace-nowrap">
            <span className="text-muted-foreground">Angeboten: </span>
            <span className="font-semibold tabular-nums">{sollStunden > 0 ? formatStunden(sollStunden) : "—"}</span>
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="whitespace-nowrap">
            <span className="text-muted-foreground">Gebucht: </span>
            <span className="font-semibold tabular-nums">{formatStunden(istStunden)}</span>
          </span>
          {sollStunden > 0 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className={cn("whitespace-nowrap font-semibold", ampel.text)}>
                <span className="font-normal text-muted-foreground">Abweichung: </span>
                <span className="tabular-nums">
                  {vz(diff)}{formatStunden(Math.abs(diff))}
                </span>
                {diffProzent !== null && (
                  <span className="tabular-nums"> ({vz(diffProzent)}{formatProzent(Math.abs(diffProzent))})</span>
                )}
              </span>
            </>
          )}
        </div>
        {auslastung !== null && (
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full", ampel.dot)} style={{ width: `${Math.min(100, auslastung)}%` }} />
          </div>
        )}
        {sollStunden <= 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Kein Angebot/keine Auftragsbestätigung mit kalkulierten Stunden — nur Ist-Stunden verfügbar.
          </p>
        )}
      </div>

      {/* Stunden je Mitarbeiter */}
      <p className="font-semibold mt-3 mb-1.5">Stunden je Mitarbeiter</p>
      {mitarbeiter.length === 0 ? (
        <p className="text-muted-foreground text-xs">Keine Stunden auf dieses Projekt gebucht.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background/60">
          {/* table-fixed: die Namensspalte nimmt den Rest und kürzt bei Bedarf,
              damit Stunden/Lohn/Anteil am Handy immer sichtbar bleiben. */}
          <table className="w-full min-w-[300px] table-fixed text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left font-medium px-2 py-1.5">Mitarbeiter</th>
                <th className="text-right font-medium px-2 py-1.5 whitespace-nowrap w-[64px]">Stunden</th>
                <th className="text-right font-medium px-2 py-1.5 whitespace-nowrap w-[86px]">Lohn&shy;kosten</th>
                <th className="text-right sm:text-left font-medium px-2 py-1.5 w-[56px] sm:w-[150px]">Anteil</th>
              </tr>
            </thead>
            <tbody>
              {mitarbeiter.map((m) => {
                const anteil = summeStunden > 0 ? (m.stunden / summeStunden) * 100 : 0;
                return (
                  <tr key={m.userId} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-1.5 truncate" title={m.name}>{m.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-medium">{formatStunden(m.stunden)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{formatEUR(m.lohnkosten)}</td>
                    <td className="px-2 py-1.5">
                      {/* Balken erst ab sm — am Handy zählt die reine Prozentzahl. */}
                      <div className="flex items-center justify-end sm:justify-start gap-1.5">
                        <div className="hidden sm:block h-1.5 flex-1 min-w-[40px] rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${anteil}%` }} />
                        </div>
                        <span className="tabular-nums text-muted-foreground text-right shrink-0 whitespace-nowrap">
                          {formatProzent(anteil)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="px-2 py-1.5">Summe ({mitarbeiter.length} Mitarbeiter)</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{formatStunden(summeStunden)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{formatEUR(summeLohn)}</td>
                <td className="px-2 py-1.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Positionen-Detail: alle Angebots-/Rechnungspositionen des Projekts —
 * je Position Menge, Einheit und die enthaltene Arbeitszeit (explizite
 * Stunden-Position bzw. kalkulierte Std/Einheit × Menge). Wird erst beim
 * Aufklappen geladen (spart Datenvolumen in der Gesamttabelle).
 */
function PositionenDetail({ row }: { row: ProjectRow }) {
  const [items, setItems] = useState<ItemRaw[] | null>(null);

  const docs = useMemo(() => {
    // Soll-Belege zuerst, dann Rechnungen/Gutschriften; keine Duplikate.
    const seen = new Set<string>();
    const out: DocRef[] = [];
    for (const d of [...row.sollDocs, ...row.rechnungDocs]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
    return out;
  }, [row]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = docs.map((d) => d.id);
      if (ids.length === 0) {
        if (!cancelled) setItems([]);
        return;
      }
      try {
        const chunks = await Promise.all(
          chunk(ids, 150).map((part) =>
            fetchAllRows<ItemRaw>((f, t) =>
              supabase
                .from("invoice_items")
                .select("invoice_id, position, beschreibung, kurztext, menge, einheit, arbeitszeit_minuten")
                .in("invoice_id", part)
                .order("id")
                .range(f, t),
            ),
          ),
        );
        if (!cancelled) setItems(chunks.flat());
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [docs]);

  if (docs.length === 0) return null;

  const byInvoice = new Map<string, ItemRaw[]>();
  for (const it of items || []) {
    const list = byInvoice.get(it.invoice_id) || [];
    list.push(it);
    byInvoice.set(it.invoice_id, list);
  }

  return (
    <div className="mt-4 border-t pt-3 text-sm">
      <p className="font-semibold mb-2">Positionen (mit enthaltener Arbeitszeit)</p>
      {items === null ? (
        <p className="text-muted-foreground text-xs">Lade Positionen…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-xs">Keine Positionen vorhanden.</p>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => {
            const list = (byInvoice.get(doc.id) || []).slice().sort((a, b) => a.position - b.position);
            if (list.length === 0) return null;
            const cfg = getDocConfig(doc.typ);
            const summe = list.reduce((s, it) => s + positionStunden(it), 0);
            return (
              <div key={doc.id}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0">{cfg.shortLabel}</Badge>
                  <Link to={`/invoices/${doc.id}`} className="text-xs font-medium hover:underline">{doc.nummer}</Link>
                  <span className="text-xs text-muted-foreground">· {formatDateShort(doc.datum)} · {list.length} Position{list.length === 1 ? "" : "en"}</span>
                </div>
                <ul className="rounded-md border bg-background/60 p-2 space-y-0.5 text-xs">
                  {list.map((it) => {
                    const name = it.kurztext || it.beschreibung || "";
                    const istStdZeile = istArbeitszeitZeile(name, it.einheit);
                    const stunden = positionStunden(it);
                    return (
                      <li key={`${doc.id}-${it.position}`} className="flex justify-between gap-2">
                        <span className="truncate text-muted-foreground">
                          <span className="font-mono">{String(it.position).padStart(2, "0")}</span>{" "}
                          {name.length > 70 ? name.slice(0, 70) + "…" : name}
                          <span className="opacity-70"> · {Number(it.menge)} {it.einheit || "Stk."}</span>
                          {stunden > 0 && !istStdZeile && (
                            <span className="ml-1.5 text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground/80"
                              title="Arbeitszeit aus der Kalkulation dieser Position (Std/Einheit × Menge)">
                              aus Kalkulation
                            </span>
                          )}
                        </span>
                        <span className="font-mono tabular-nums shrink-0">{stunden > 0 ? `${stunden.toFixed(1)} h` : "—"}</span>
                      </li>
                    );
                  })}
                  {summe > 0 && (
                    <li className="flex justify-between gap-2 pt-1 mt-1 border-t border-border/50 font-medium">
                      <span className="text-muted-foreground">Arbeitszeit gesamt</span>
                      <span className="font-mono tabular-nums shrink-0">{summe.toFixed(1)} h</span>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
