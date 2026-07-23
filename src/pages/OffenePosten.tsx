import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
}

interface Buchung { id: string; datum: string; betrag: number; notizen: string | null; }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const eur = (n: number) => n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDat = (d?: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("de-AT") : "");

const ZAHLBARE_TYPEN = ["rechnung", "anzahlungsrechnung", "schlussrechnung"];

export default function OffenePosten() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rows, setRows] = useState<OpRow[]>([]);
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
  const [bDatum, setBDatum] = useState(new Date().toISOString().slice(0, 10));
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
    const { data, error } = await supabase
      .from("invoices")
      .select("id, typ, nummer, status, betreff, kunde_name, kundennummer, kunde_telefon, datum, faellig_am, naechste_mahnung_am, mahnstufe, netto_summe, mwst_betrag, brutto_summe, bezahlt_betrag")
      .in("typ", ZAHLBARE_TYPEN)
      .neq("status", "storniert")
      .order("faellig_am", { ascending: true });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      setRows(((data as any[]) || []).map((d) => ({
        ...d,
        mahnstufe: Number(d.mahnstufe) || 0,
        netto_summe: Number(d.netto_summe) || 0,
        mwst_betrag: Number(d.mwst_betrag) || 0,
        brutto_summe: Number(d.brutto_summe) || 0,
        bezahlt_betrag: Number(d.bezahlt_betrag) || 0,
      })));
    }
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

  const sel = rows.find((r) => r.id === selectedId) || null;
  const brauchtAuswahl = () =>
    toast({ title: "Keine Rechnung markiert", description: "Bitte zuerst eine Zeile in der Liste anklicken." });

  const offenVon = (r: OpRow) => r2(r.brutto_summe - r.bezahlt_betrag);

  const oeffneBuchen = async (row: OpRow) => {
    setSelectedId(row.id);
    setMahnstufeNeu(String(row.mahnstufe));
    setNaechsteMahnung(row.naechste_mahnung_am || "");
    setBDatum(new Date().toISOString().slice(0, 10));
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
          const { error: pErr } = await supabase.from("invoice_payments").insert({
            invoice_id: sel.id,
            user_id: user?.id,
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
        const { error: sErr } = await supabase
          .from("invoices")
          .update({ bezahlt_betrag: neuBezahlt, status: neuStatus })
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
      (r.betreff || `${r.typ === "rechnung" ? "Rechnung" : r.typ} ${r.nummer}`).replace(/;/g, ","),
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

  const summen = useMemo(() => ({
    anzahl: gefiltert.length,
    netto: gefiltert.reduce((s, r) => s + r.netto_summe, 0),
    mwst: gefiltert.reduce((s, r) => s + r.mwst_betrag, 0),
    brutto: gefiltert.reduce((s, r) => s + r.brutto_summe, 0),
    offen: gefiltert.reduce((s, r) => s + offenVon(r), 0),
  }), [gefiltert]);

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        onBack={() => navigate("/")}
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
                    <TableHead className="w-12">Status</TableHead>
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
                    <TableRow><TableCell colSpan={13} className="p-6 text-center text-muted-foreground">Lädt …</TableCell></TableRow>
                  ) : gefiltert.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="p-6 text-center text-muted-foreground">Keine offenen Posten.</TableCell></TableRow>
                  ) : (
                    gefiltert.map((r) => {
                      const selektiert = selectedId === r.id;
                      const ueberfaellig = r.faellig_am && r.faellig_am < new Date().toISOString().slice(0, 10) && offenVon(r) > 0.005;
                      return (
                        <TableRow
                          key={r.id}
                          className={`cursor-pointer ${selektiert ? "bg-[#FFF3B8] hover:bg-[#FFEE9E]" : "hover:bg-muted/50"}`}
                          onClick={() => setSelectedId(r.id)}
                          onDoubleClick={() => void oeffneBuchen(r)}
                        >
                          <TableCell>
                            <span
                              className={`block h-3 w-3 rounded-full border border-black/10 ${
                                r.status === "bezahlt" ? "bg-green-500" : ueberfaellig ? "bg-red-500" : r.status === "teilbezahlt" ? "bg-yellow-400" : "bg-yellow-400"
                              }`}
                              title={r.status}
                            />
                          </TableCell>
                          <TableCell className="tabular-nums">{r.mahnstufe}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDat(r.faellig_am)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDat(r.datum)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDat(r.naechste_mahnung_am)}</TableCell>
                          <TableCell className="max-w-[16rem] truncate font-medium">{r.betreff?.trim() || `Rechnung ${r.nummer}`}</TableCell>
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
