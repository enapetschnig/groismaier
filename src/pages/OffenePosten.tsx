import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { KBToolbar, KBToolbarButton, KBButton } from "@/components/kingbill";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Printer, FileDown, Search as SearchIcon, ArrowLeft, Save } from "lucide-react";
import { toNumber, clamp } from "@/lib/num";
import { heuteISO } from "@/lib/datum";
import { getDocConfig } from "@/lib/documentTypes";
import { kettenIndex, kettenSummen, offenerBetrag, type KettenBeleg } from "@/lib/belegkette";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Offene Posten — KingBill 1:1 (Screenshot-Vorlage):
 *   Toolbar:  [Zurück] | Neuen Eingang buchen | Rechnung anzeigen |
 *             Offene Posten exportieren | Eingänge anzeigen
 *   Sidebar:  Suche · „nur Offene" · „Filter nach Datum" · Summen
 *   Tabelle:  Status · Mahnstatus · Fälligkeitsdatum · Datum ·
 *             Nächste Mahnung am · Betreff · Kundennummer · Kunde · Telefon ·
 *             Summe Netto · Summe MwSt. · Summe Brutto · Offen
 *   Klick = Zeile gelb markieren, Doppelklick = Beleg öffnen.
 *   „Eingang buchen": Mahnstatus/Nächste-Mahnung + Zahlungseingang mit
 *   Spesen/Skonto/Kommentar; Buchungen landen in invoice_payments und
 *   aktualisieren bezahlt_betrag/status wie im Beleg-Editor.
 */

interface OpRow {
  id: string;
  typ: string;
  nummer: string;
  status: string;
  betreff: string | null;
  kunde_name: string;
  kundennummer: string | null;
  kunde_telefon: string | null;
  datum: string;
  faellig_am: string | null;
  naechste_mahnung_am: string | null;
  mahnstufe: number;
  netto_summe: number;
  mwst_betrag: number;
  brutto_summe: number;
  bezahlt_betrag: number;
  parent_invoice_id: string | null;
}

interface Buchung { id: string; datum: string; betrag: number; notizen: string | null; }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const eur = (n: number) => n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDat = (d?: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("de-AT") : "");

const ZAHLBARE_TYPEN = ["rechnung", "anzahlungsrechnung", "schlussrechnung"];

export default function OffenePosten() {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const { toast } = useToast();

  const [rows, setRows] = useState<OpRow[]>([]);
  /** Alle Belege (auch AN/AB/LS/Gutschrift) — Grundlage der Kettenansicht. */
  const [alleBelege, setAlleBelege] = useState<OpRow[]>([]);
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [suche, setSuche] = useState("");
  const [nurOffene, setNurOffene] = useState(true);
  const [datumFilterAn, setDatumFilterAn] = useState(false);
  const [datumVon, setDatumVon] = useState("");
  const [datumBis, setDatumBis] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Eingang-buchen-Dialog
  const [buchenOpen, setBuchenOpen] = useState(false);
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [mahnstufeNeu, setMahnstufeNeu] = useState("0");
  const [naechsteMahnung, setNaechsteMahnung] = useState("");
  const [bDatum, setBDatum] = useState(heuteISO());
  const [bEingang, setBEingang] = useState("");
  const [bSpesen, setBSpesen] = useState("");
  const [bSkonto, setBSkonto] = useState("");
  const [bKommentar, setBKommentar] = useState("");
  const [speichert, setSpeichert] = useState(false);

  // Eingänge-anzeigen-Dialog (letzte Zahlungseingänge über alle Rechnungen)
  const [eingaengeOpen, setEingaengeOpen] = useState(false);
  const [alleEingaenge, setAlleEingaenge] = useState<Array<Buchung & { nummer: string; kunde: string }>>([]);

  const lade = async () => {
    setLoading(true);
    // ALLE Belegarten laden, nicht nur Rechnungen: Die Kettenansicht je Zeile
    // zeigt auch Angebot/AB/Lieferschein desselben Auftrags. Blockweise, weil
    // PostgREST sonst still bei 1000 Zeilen kappt.
    const alle: any[] = [];
    for (let von = 0; ; von += 1000) {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, typ, nummer, status, betreff, kunde_name, kundennummer, kunde_telefon, datum, faellig_am, naechste_mahnung_am, mahnstufe, netto_summe, mwst_betrag, brutto_summe, bezahlt_betrag, parent_invoice_id")
        .or("archiviert.is.null,archiviert.eq.false")
        // id als Tiebreaker: Bei gleichem faellig_am (oder NULL) können sich
        // 1000er-Blöcke sonst überlappen bzw. Zeilen auslassen.
        .order("faellig_am", { ascending: true })
        .order("id", { ascending: true })
        .range(von, von + 999);
      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: error.message });
        setLoading(false);
        return;
      }
      alle.push(...((data as any[]) || []));
      if (!data || data.length < 1000) break;
    }
    const belege = alle.map((d) => ({
      ...d,
      mahnstufe: Number(d.mahnstufe) || 0,
      netto_summe: Number(d.netto_summe) || 0,
      mwst_betrag: Number(d.mwst_betrag) || 0,
      brutto_summe: Number(d.brutto_summe) || 0,
      bezahlt_betrag: Number(d.bezahlt_betrag) || 0,
    }));
    setAlleBelege(belege);
    setRows(belege.filter((d) => ZAHLBARE_TYPEN.includes(d.typ) && d.status !== "storniert"));
    setLoading(false);
  };
  useEffect(() => { void lade(); }, []);

  const gefiltert = useMemo(() => {
    let base = rows;
    if (nurOffene) base = base.filter((r) => r.status === "offen" || r.status === "teilbezahlt");
    if (datumFilterAn) {
      if (datumVon) base = base.filter((r) => r.datum >= datumVon);
      if (datumBis) base = base.filter((r) => r.datum <= datumBis);
    }
    const q = suche.trim().toLowerCase();
    if (q) {
      base = base.filter((r) =>
        r.nummer.toLowerCase().includes(q) ||
        (r.betreff || "").toLowerCase().includes(q) ||
        r.kunde_name.toLowerCase().includes(q) ||
        (r.kundennummer || "").toLowerCase().includes(q));
    }
    return base;
  }, [rows, nurOffene, datumFilterAn, datumVon, datumBis, suche]);

  // Kettenzugehörigkeit über ALLE Belege (auch AN/AB), gruppiert je Wurzel.
  const ketten = useMemo(() => kettenIndex(alleBelege as unknown as KettenBeleg[]), [alleBelege]);
  const wurzelJeBeleg = useMemo(() => {
    const m = new Map<string, string>();
    for (const [wurzel, glieder] of ketten) for (const g of glieder) m.set((g as any).id, wurzel);
    return m;
  }, [ketten]);
  const ketteVon = (r: OpRow): OpRow[] =>
    ((ketten.get(wurzelJeBeleg.get(r.id) || r.id) as unknown as OpRow[]) || [r]);

  const sel = rows.find((r) => r.id === selectedId) || null;
  const brauchtAuswahl = () =>
    toast({ title: "Keine Rechnung markiert", description: "Bitte zuerst eine Zeile in der Liste anklicken." });

  // Status „bezahlt" = ausgeglichen, auch wenn ein Skonto den Eingang unter
  // das Brutto drückt — sonst steht der Skontobetrag ewig als „offen".
  const offenVon = (r: OpRow) => offenerBetrag(r as KettenBeleg);

  const oeffneBuchen = async (row: OpRow) => {
    setSelectedId(row.id);
    setMahnstufeNeu(String(row.mahnstufe));
    setNaechsteMahnung(row.naechste_mahnung_am || "");
    setBDatum(heuteISO());
    setBEingang(""); setBSpesen(""); setBSkonto(""); setBKommentar("");
    const { data } = await supabase
      .from("invoice_payments")
      .select("id, datum, betrag, notizen")
      .eq("invoice_id", row.id)
      .order("datum", { ascending: true });
    setBuchungen(((data as any[]) || []).map((b) => ({ ...b, betrag: Number(b.betrag) || 0 })));
    setBuchenOpen(true);
  };

  /** Mahnstatus + Nächste-Mahnung speichern; optional Zahlungseingang buchen. */
  const speichereBuchung = async () => {
    if (!sel || speichert) return;
    setSpeichert(true);
    try {
      // 1) Mahn-Felder
      const { error: mErr } = await supabase
        .from("invoices")
        .update({
          mahnstufe: Number(mahnstufeNeu) || 0,
          naechste_mahnung_am: naechsteMahnung || null,
        } as any)
        .eq("id", sel.id);
      if (mErr) throw mErr;

      // 2) Optionaler Zahlungseingang
      const eingang = r2(clamp(toNumber(bEingang, 0), 0));
      const spesen = r2(clamp(toNumber(bSpesen, 0), 0));
      const skonto = r2(clamp(toNumber(bSkonto, 0), 0));
      if (eingang > 0 || skonto > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const notizTeile = [
          spesen > 0 ? `Spesen € ${eur(spesen)}` : "",
          skonto > 0 ? `Skonto € ${eur(skonto)}` : "",
          bKommentar.trim(),
        ].filter(Boolean);
        if (eingang > 0) {
          // invoice_payments hat KEINE user_id-Spalte — mit ihr lehnte
          // PostgREST jeden Eingang ab (PGRST204) und "Eingang buchen"
          // scheiterte ausnahmslos.
          const { error: pErr } = await supabase.from("invoice_payments").insert({
            invoice_id: sel.id,
            betrag: eingang,
            datum: bDatum,
            notizen: notizTeile.join(" · ") || null,
          } as any);
          if (pErr) throw pErr;
        }
        // Status wie im Beleg-Editor: Skonto zählt zur Tilgung des Rests.
        const neuBezahlt = r2(sel.bezahlt_betrag + eingang);
        const restNachSkonto = r2(sel.brutto_summe - neuBezahlt - skonto);
        const neuStatus = restNachSkonto <= 0.005 ? "bezahlt" : neuBezahlt > 0 ? "teilbezahlt" : sel.status;
        // Vollzahlung beendet das Mahnverfahren — sonst trägt die bezahlte
        // Rechnung dauerhaft „2. Mahnung" (Audit-Befund).
        const { error: sErr } = await supabase
          .from("invoices")
          .update({
            bezahlt_betrag: neuBezahlt,
            status: neuStatus,
            ...(neuStatus === "bezahlt" ? { mahnstufe: 0, naechste_mahnung_am: null } : {}),
          } as any)
          .eq("id", sel.id);
        if (sErr) throw sErr;
      }
      toast({ title: "Gespeichert", description: eingang > 0 ? `Eingang € ${eur(eingang)} gebucht.` : "Mahnstatus aktualisiert." });
      setBuchenOpen(false);
      await lade();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err?.message || "Buchung fehlgeschlagen" });
    } finally {
      setSpeichert(false);
    }
  };

  const exportiereCsv = () => {
    const kopf = ["Status", "Mahnstatus", "Faelligkeitsdatum", "Datum", "Naechste Mahnung am", "Betreff", "Kundennummer", "Kunde", "Telefon", "Summe Netto", "Summe MwSt", "Summe Brutto", "Offen"];
    const zeilen = gefiltert.map((r) => [
      r.status, r.mahnstufe, r.faellig_am || "", r.datum, r.naechste_mahnung_am || "",
      (r.betreff || `${getDocConfig(r.typ).label} ${r.nummer}`).replace(/;/g, ","),
      r.kundennummer || "", r.kunde_name.replace(/;/g, ","), r.kunde_telefon || "",
      r.netto_summe.toFixed(2), r.mwst_betrag.toFixed(2), r.brutto_summe.toFixed(2), offenVon(r).toFixed(2),
    ]);
    const csv = [kopf, ...zeilen].map((z) => z.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Offene_Posten.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const zeigeEingaenge = async () => {
    const { data } = await supabase
      .from("invoice_payments")
      .select("id, datum, betrag, notizen, invoice:invoices(nummer, kunde_name)")
      .order("datum", { ascending: false })
      .limit(100);
    setAlleEingaenge(((data as any[]) || []).map((p) => ({
      id: p.id, datum: p.datum, betrag: Number(p.betrag) || 0, notizen: p.notizen,
      nummer: p.invoice?.nummer || "—", kunde: p.invoice?.kunde_name || "—",
    })));
    setEingaengeOpen(true);
  };

  // Netto/MwSt über die Kettenlogik: Anzahlungen, deren Schlussrechnung
  // mitgezählt wird, dürfen nicht doppelt in die Summe (Audit-Befund).
  const summen = useMemo(() => {
    const ks = kettenSummen(gefiltert as unknown as KettenBeleg[]);
    return { anzahl: gefiltert.length, ...ks };
  }, [gefiltert]);

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        onBack={zurueck}
        title="Offene Posten"
      >
        <KBToolbarButton
          icon={Plus}
          iconClassName="text-kb-green"
          label="Neuen Eingang buchen"
          onClick={() => (sel ? void oeffneBuchen(sel) : brauchtAuswahl())}
        />
        <KBToolbarButton
          icon={Printer}
          label="Rechnung anzeigen"
          onClick={() => (sel ? navigate(`/invoices/${sel.id}`) : brauchtAuswahl())}
          title="Markierte Rechnung öffnen (Vorschau/Druck im Beleg)"
        />
        <KBToolbarButton icon={FileDown} label="Offene Posten exportieren" onClick={exportiereCsv} />
        <KBToolbarButton icon={SearchIcon} iconClassName="text-kb-yellow" label="Eingänge anzeigen" onClick={() => void zeigeEingaenge()} />
      </KBToolbar>

      <div className="container mx-auto max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          {/* ── Sidebar wie im Original ── */}
          <aside className="kb-panel w-full shrink-0 p-3 lg:sticky lg:top-20 lg:w-64">
            <div className="flex flex-col gap-3">
              <input
                type="search"
                className="kb-input"
                placeholder="Suche …"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
              />
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-kb-blue-dark" checked={nurOffene} onChange={(e) => setNurOffene(e.target.checked)} />
                nur Offene
              </label>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-kb-blue-dark" checked={datumFilterAn} onChange={(e) => setDatumFilterAn(e.target.checked)} />
                Filter nach Datum
              </label>
              {datumFilterAn && (
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" className="h-8" value={datumVon} onChange={(e) => setDatumVon(e.target.value)} title="von" />
                  <Input type="date" className="h-8" value={datumBis} onChange={(e) => setDatumBis(e.target.value)} title="bis" />
                </div>
              )}
              <div className="space-y-0.5 border-t border-border pt-2 text-sm">
                <div className="flex justify-between"><span>Anzahl Rechnungen</span><span className="font-bold tabular-nums">{loading ? "…" : summen.anzahl}</span></div>
                <div className="flex justify-between"><span>Summe Netto</span><span className="font-bold tabular-nums">€ {eur(summen.netto)}</span></div>
                <div className="flex justify-between"><span>Summe MwSt.</span><span className="font-bold tabular-nums">€ {eur(summen.mwst)}</span></div>
                <div className="flex justify-between"><span>Summe Brutto</span><span className="font-bold tabular-nums">€ {eur(summen.brutto)}</span></div>
                <div className="flex justify-between"><span>Summe Offen</span><span className="font-bold tabular-nums text-orange-700">€ {eur(summen.offen)}</span></div>
              </div>
            </div>
          </aside>

          {/* ── Tabelle wie im Original ── */}
          <section className="kb-panel min-w-0 flex-1 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"><span className="sr-only">Belegkette</span></TableHead>
                    <TableHead className="w-12">Status</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Mahnstatus</TableHead>
                    <TableHead>Fälligkeitsdatum</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Nächste Mahnung am</TableHead>
                    <TableHead className="min-w-[12rem]">Betreff</TableHead>
                    <TableHead>Kundennummer</TableHead>
                    <TableHead>Kunde</TableHead>
                    <TableHead className="hidden xl:table-cell">Telefon</TableHead>
                    <TableHead className="text-right">Summe Netto</TableHead>
                    <TableHead className="hidden text-right xl:table-cell">Summe MwSt.</TableHead>
                    <TableHead className="text-right">Summe Brutto</TableHead>
                    <TableHead className="text-right">Offen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={15} className="p-6 text-center text-muted-foreground">Lädt …</TableCell></TableRow>
                  ) : gefiltert.length === 0 ? (
                    <TableRow><TableCell colSpan={15} className="p-6 text-center text-muted-foreground">Keine offenen Posten.</TableCell></TableRow>
                  ) : (
                    gefiltert.map((r) => {
                      const selektiert = selectedId === r.id;
                      const ueberfaellig = r.faellig_am && r.faellig_am < heuteISO() && offenVon(r) > 0.005;
                      const kette = ketteVon(r);
                      const hatKette = kette.length > 1;
                      const offen = aufgeklappt.has(r.id);
                      return (
                        <Fragment key={r.id}>
                        <TableRow
                          className={`cursor-pointer ${selektiert ? "bg-[#FFF3B8] hover:bg-[#FFEE9E]" : "hover:bg-muted/50"}`}
                          onClick={() => setSelectedId(r.id)}
                          onDoubleClick={() => void oeffneBuchen(r)}
                        >
                          <TableCell className="w-8">
                            {hatKette && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAufgeklappt((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
                                    return n;
                                  });
                                }}
                                onDoubleClick={(e) => e.stopPropagation()}
                                title={offen ? "Belegkette einklappen" : `Belegkette zeigen (${kette.length} Belege)`}
                                aria-label="Belegkette zeigen"
                              >
                                {offen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            )}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`block h-3 w-3 rounded-full border border-black/10 ${
                                r.status === "bezahlt" ? "bg-green-500" : ueberfaellig ? "bg-red-500" : r.status === "teilbezahlt" ? "bg-yellow-400" : "bg-yellow-400"
                              }`}
                              title={r.status}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold" title={getDocConfig(r.typ).label}>
                              {getDocConfig(r.typ).shortLabel}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums">{r.mahnstufe}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDat(r.faellig_am)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDat(r.datum)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDat(r.naechste_mahnung_am)}</TableCell>
                          <TableCell className="max-w-[16rem] truncate font-medium">{r.betreff?.trim() || `${getDocConfig(r.typ).label} ${r.nummer}`}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{r.kundennummer || ""}</TableCell>
                          <TableCell className="max-w-[12rem] truncate">{r.kunde_name}</TableCell>
                          <TableCell className="hidden text-muted-foreground xl:table-cell">{r.kunde_telefon || ""}</TableCell>
                          <TableCell className="text-right tabular-nums">{eur(r.netto_summe)}</TableCell>
                          <TableCell className="hidden text-right tabular-nums xl:table-cell">{eur(r.mwst_betrag)}</TableCell>
                          <TableCell className="text-right tabular-nums">{eur(r.brutto_summe)}</TableCell>
                          <TableCell className={`text-right font-medium tabular-nums ${offenVon(r) > 0.005 ? "text-orange-700" : "text-green-700"}`}>
                            {eur(offenVon(r))}
                          </TableCell>
                        </TableRow>
                        {offen && hatKette && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={15} className="p-0">
                              {/* Alles, was zu diesem Auftrag gehört — auch Angebot,
                                  AB und Lieferschein, jeweils anklickbar. */}
                              <div className="px-10 py-2">
                                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                                  Belegkette — gehört zu diesem Auftrag:
                                </p>
                                <div className="divide-y divide-border/60 rounded border border-border bg-card">
                                  {[...kette].sort((a, b) => (a.datum || "").localeCompare(b.datum || "")).map((g) => {
                                    const cfg = getDocConfig(g.typ);
                                    const gOffen = offenerBetrag(g as KettenBeleg);
                                    return (
                                      <button
                                        key={g.id}
                                        type="button"
                                        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1.5 text-left text-sm hover:bg-muted/50 ${g.id === r.id ? "bg-[#FFF9DC]" : ""}`}
                                        onClick={() => navigate(`/invoices/${g.id}`)}
                                        title={`${cfg.label} ${g.nummer} öffnen`}
                                      >
                                        <span className="w-9 rounded border border-border bg-muted px-1 text-center text-[11px] font-semibold">{cfg.shortLabel}</span>
                                        <span className="font-mono text-xs">{g.nummer}</span>
                                        <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDat(g.datum)}</span>
                                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{g.status}</span>
                                        <span className="tabular-nums">€ {eur(g.brutto_summe)}</span>
                                        <span className={`w-28 text-right tabular-nums ${gOffen > 0.005 ? "font-medium text-orange-700" : "text-green-700"}`}>
                                          {ZAHLBARE_TYPEN.includes(g.typ) ? `offen € ${eur(gOffen)}` : "—"}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>

      {/* ══ „Eingang buchen" — Fenster wie im Original ══ */}
      <Dialog open={buchenOpen} onOpenChange={(o) => !o && setBuchenOpen(false)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0" hideClose>
          <DialogHeader className="sr-only"><DialogTitle>Eingang buchen</DialogTitle></DialogHeader>
          <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
            <span className="text-sm font-semibold">Eingang buchen</span>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded bg-red-600 text-xs font-bold text-white hover:bg-red-700"
              onClick={() => setBuchenOpen(false)}
              aria-label="Schließen"
            >×</button>
          </div>
          <div className="max-h-[80vh] overflow-y-auto bg-gradient-to-b from-[#cfe3f6] via-[#a8c9e8] to-[#7fb0dd] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <KBButton icon={ArrowLeft} label="Zurück" onClick={() => setBuchenOpen(false)} />
              <h2 className="flex-1 text-center text-3xl font-light text-white [text-shadow:0_1px_3px_rgba(0,40,90,0.45)]">
                Eingang buchen
              </h2>
            </div>

            {sel && (
              <div className="space-y-4">
                {/* Kopf-Box: Rechnung + Beträge + Mahnfelder */}
                <div className="rounded border border-black/20 bg-[#f6f4ee] p-4 shadow">
                  <div className="mb-3 text-base font-bold">
                    Rechnung {sel.nummer} &nbsp;vom&nbsp; {fmtDat(sel.datum)}
                  </div>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span>Brutto</span><span className="tabular-nums">{eur(sel.brutto_summe)}</span></div>
                      <div className="flex justify-between"><span>Eingänge</span><span className="tabular-nums">{eur(sel.bezahlt_betrag)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Offen</span><span className="tabular-nums">{eur(offenVon(sel))}</span></div>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[10rem_1fr] items-center gap-2">
                        <Label className="text-sm">Nächste Mahnung am</Label>
                        <Input type="date" className="h-9 bg-white" value={naechsteMahnung} onChange={(e) => setNaechsteMahnung(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-[10rem_1fr] items-center gap-2">
                        <Label className="text-sm">Aktueller Mahnstatus</Label>
                        <Select value={mahnstufeNeu} onValueChange={setMahnstufeNeu}>
                          <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["0", "1", "2", "3"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Neue Buchung */}
                <div className="rounded border border-black/20 bg-[#f6f4ee] p-4 shadow">
                  <div className="mb-2 text-base font-bold">Neue Buchung</div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div>
                      <Label className="text-xs">Datum</Label>
                      <Input type="date" className="h-9 bg-white" value={bDatum} onChange={(e) => setBDatum(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Eingang €</Label>
                      <Input type="text" inputMode="decimal" className="h-9 bg-white text-right" value={bEingang} onChange={(e) => setBEingang(e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-xs">Spesen €</Label>
                      <Input type="text" inputMode="decimal" className="h-9 bg-white text-right" value={bSpesen} onChange={(e) => setBSpesen(e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-xs">Skonto €</Label>
                      <Input type="text" inputMode="decimal" className="h-9 bg-white text-right" value={bSkonto} onChange={(e) => setBSkonto(e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-xs">Kommentar</Label>
                      <Input className="h-9 bg-white" value={bKommentar} onChange={(e) => setBKommentar(e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <KBButton icon={Save} variant="green" label={speichert ? "Speichert …" : "Speichern"} onClick={() => void speichereBuchung()} disabled={speichert} />
                  </div>
                </div>

                {/* Bisherige Buchungen */}
                <div className="rounded border border-black/20 bg-[#f6f4ee] p-4 shadow">
                  <div className="mb-2 text-base font-bold">Bisherige Buchungen</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Datum</th>
                        <th className="py-1 pr-2 text-right font-medium">Eingang</th>
                        <th className="py-1 pr-2 font-medium">Spesen</th>
                        <th className="py-1 pr-2 font-medium">Skonto</th>
                        <th className="py-1 font-medium">Kommentar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {buchungen.length === 0 ? (
                        <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">Noch keine Buchungen.</td></tr>
                      ) : (
                        buchungen.map((b) => {
                          const spesenM = (b.notizen || "").match(/Spesen € ([\d.,]+)/);
                          const skontoM = (b.notizen || "").match(/Skonto € ([\d.,]+)/);
                          const rest = (b.notizen || "").replace(/Spesen € [\d.,]+ ?·? ?/, "").replace(/Skonto € [\d.,]+ ?·? ?/, "").trim();
                          return (
                            <tr key={b.id}>
                              <td className="py-1 pr-2 whitespace-nowrap">{fmtDat(b.datum)}</td>
                              <td className="py-1 pr-2 text-right tabular-nums">{eur(b.betrag)}</td>
                              <td className="py-1 pr-2 tabular-nums">{spesenM?.[1] || ""}</td>
                              <td className="py-1 pr-2 tabular-nums">{skontoM?.[1] || ""}</td>
                              <td className="py-1 text-muted-foreground">{rest}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ „Eingänge anzeigen" — letzte Zahlungseingänge ══ */}
      <Dialog open={eingaengeOpen} onOpenChange={(o) => !o && setEingaengeOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Letzte Zahlungseingänge</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Datum</th>
                  <th className="px-2 py-1.5 font-medium">Rechnung</th>
                  <th className="px-2 py-1.5 font-medium">Kunde</th>
                  <th className="px-2 py-1.5 text-right font-medium">Eingang</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {alleEingaenge.length === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Keine Eingänge vorhanden.</td></tr>
                ) : (
                  alleEingaenge.map((p) => (
                    <tr key={p.id}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmtDat(p.datum)}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{p.nummer}</td>
                      <td className="max-w-[12rem] truncate px-2 py-1.5">{p.kunde}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">€ {eur(p.betrag)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
