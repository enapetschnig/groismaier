/**
 * Ausschreibungen (ÖNORM A 2063, .onlv) — eigener Menüpunkt zum Einlesen und
 * Bepreisen von Leistungsverzeichnissen (Umsetzungsplan Modul B).
 *
 * Drei Ansichten in einer Maske:
 *   1. Liste der eingelesenen LVs (KingBill-Listenmaske wie Fahrzeuge/Kunden)
 *   2. Vorschau nach Dateiwahl — Bauvorhaben, Auftraggeber, Positionszahl —
 *      erst nach Bestätigung wird gespeichert
 *   3. Bepreisen: Positionen nach LG/ULG gegliedert, je Position die
 *      Preisanteile Lohn und Sonstiges (ÖNORM-Pflicht), Summen laufend oben.
 *
 * Fachliche Leitplanken (siehe src/lib/onlv.ts):
 *   - NUR Normalpositionen zählen in die Angebotssumme; Wahl- und
 *     Eventualpositionen werden bepreist, aber getrennt ausgewiesen.
 *   - Textpositionen (ohne Menge/Einheit) sind Vertragstext, nicht bepreisbar.
 *   - Der Rückexport als Angebots-LV ist bewusst noch gesperrt: Die Preisfelder
 *     werden erst gebaut, wenn ein bepreistes Muster-LV vorliegt (Plan B4 —
 *     Feldnamen raten hieße, dass das AVA-Programm des Ausschreibers die
 *     Datei ablehnt). Das Original-XML liegt dafür unverändert in der DB.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { parseDecimal, formatForInput } from "@/lib/num";
import {
  parseOnlv, lvSummen, positionspreis, epGesamt, istBepreisbar,
  OnlvFehler, type OnlvLV, type Positionsart,
} from "@/lib/onlv";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Plus, Trash2, FileUp, ChevronDown, ChevronRight, FileText, Printer, AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface LvKopf {
  id: string;
  name: string;
  vorhaben: string | null;
  lvbezeichnung: string | null;
  auftraggeber_name: string | null;
  auftraggeber_adresse: string | null;
  waehrung: string;
  schema_version: string | null;
  datei_name: string | null;
  status: string;
  import_fertig?: boolean;
  created_at: string;
}

interface LvPosition {
  id: string;
  lv_id: string;
  positionsnummer: string;
  lg: string;
  lg_ueberschrift: string | null;
  ulg: string;
  ulg_ueberschrift: string | null;
  stichwort: string | null;
  langtext_html: string | null;
  einheit: string | null;
  menge: number | null;
  positionsart: Positionsart;
  sort: number;
  ep_lohn: number | null;
  ep_sonstiges: number | null;
}

const eur = (n: number) =>
  `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ART_BADGE: Record<string, { label: string; klasse: string } | undefined> = {
  wahl: { label: "Wahlposition", klasse: "bg-blue-100 text-blue-800 border-blue-300" },
  eventual: { label: "Eventualposition", klasse: "bg-purple-100 text-purple-800 border-purple-300" },
};

export default function Ausschreibungen() {
  const { toast } = useToast();
  const zurueck = useZurueck("/");
  const dateiInput = useRef<HTMLInputElement>(null);

  // ── Liste ──
  const [lvs, setLvs] = useState<LvKopf[]>([]);
  const [alleSummen, setAlleSummen] = useState<Record<string, ReturnType<typeof lvSummen>>>({});
  const [loading, setLoading] = useState(true);
  const [loeschenId, setLoeschenId] = useState<string | null>(null);

  // ── Import-Vorschau ──
  const [vorschau, setVorschau] = useState<{ lv: OnlvLV; xml: string; dateiName: string } | null>(null);
  const [importiere, setImportiere] = useState(false);

  // ── Bepreisen ──
  const [offenId, setOffenId] = useState<string | null>(null);
  const [positionen, setPositionen] = useState<LvPosition[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  /** Eingabepuffer je Position (österreichisches Format, erst beim Verlassen gespeichert). */
  const [eingaben, setEingaben] = useState<Record<string, { lohn: string; sonstiges: string }>>({});
  const [langtextOffen, setLangtextOffen] = useState<Set<string>>(new Set());
  const [nurUnbepreiste, setNurUnbepreiste] = useState(false);
  /** Schnappschuss der unbepreisten IDs beim Einschalten des Filters — die
   *  Zeile darf nicht mitten in der Eingabe (nach dem ersten Preisanteil)
   *  unter dem Cursor verschwinden (Review-Befund). */
  const [filterIds, setFilterIds] = useState<Set<string>>(new Set());

  const offenesLv = lvs.find((l) => l.id === offenId) || null;
  const [vorbemerkungenOffen, setVorbemerkungenOffen] = useState(false);
  const vorbemerkungen: { lg: string; ulg: string | null; html: string }[] =
    ((offenesLv as any)?.vorbemerkungen as any[]) || [];

  // ── Laden ──
  /**
   * Blockweise laden — PostgREST kappt sonst still bei 1000 Zeilen. Ein
   * LB-Hochbau-LV hat schnell mehr; die Angebotssumme wäre kommentarlos
   * falsch (Review-Befund). Sortierung braucht den id-Tiebreaker, sonst
   * können sich Blöcke bei gleichem Sortierwert überlappen.
   */
  const ladeAlleZeilen = useCallback(async (bau: (von: number) => any): Promise<{ rows: any[]; error: any }> => {
    const rows: any[] = [];
    for (let von = 0; ; von += 1000) {
      const { data, error } = await bau(von).range(von, von + 999);
      if (error) return { rows, error };
      rows.push(...((data as any[]) || []));
      if (!data || data.length < 1000) return { rows, error: null };
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [koepfeRes, posRes] = await Promise.all([
      ladeAlleZeilen((von) => (supabase.from("lv_ausschreibungen" as never) as any)
        .select("id, name, vorhaben, lvbezeichnung, auftraggeber_name, auftraggeber_adresse, waehrung, schema_version, datei_name, status, import_fertig, vorbemerkungen, created_at")
        .order("created_at", { ascending: false }).order("id")),
      ladeAlleZeilen((von) => (supabase.from("lv_positionen" as never) as any)
        .select("lv_id, positionsart, menge, einheit, ep_lohn, ep_sonstiges")
        .order("lv_id").order("id")),
    ]);
    if (koepfeRes.error || posRes.error) {
      toast({ variant: "destructive", title: "Fehler", description: "Ausschreibungen konnten nicht geladen werden." });
      setLoading(false);
      return;
    }
    setLvs((koepfeRes.rows as LvKopf[]));
    const gruppen: Record<string, any[]> = {};
    posRes.rows.forEach((p) => (gruppen[p.lv_id] ||= []).push(p));
    const summen: Record<string, ReturnType<typeof lvSummen>> = {};
    for (const [id, ps] of Object.entries(gruppen)) summen[id] = lvSummen(ps);
    setAlleSummen(summen);
    setLoading(false);
  }, [toast, ladeAlleZeilen]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchPositionen = useCallback(async (lvId: string) => {
    setPosLoading(true);
    const { rows: geladen, error } = await ladeAlleZeilen((von) =>
      (supabase.from("lv_positionen" as never) as any)
        .select("id, lv_id, positionsnummer, lg, lg_ueberschrift, ulg, ulg_ueberschrift, stichwort, langtext_html, einheit, menge, positionsart, sort, ep_lohn, ep_sonstiges")
        .eq("lv_id", lvId)
        .order("sort").order("id"));
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Positionen konnten nicht geladen werden." });
      setPosLoading(false);
      return;
    }
    const rows = geladen as LvPosition[];
    setPositionen(rows);
    const puffer: Record<string, { lohn: string; sonstiges: string }> = {};
    rows.forEach((p) => {
      puffer[p.id] = {
        lohn: p.ep_lohn !== null ? formatForInput(Number(p.ep_lohn)) : "",
        sonstiges: p.ep_sonstiges !== null ? formatForInput(Number(p.ep_sonstiges)) : "",
      };
    });
    setEingaben(puffer);
    setPosLoading(false);
  }, [toast]);

  const oeffneLv = (id: string) => {
    setOffenId(id);
    setLangtextOffen(new Set());
    setNurUnbepreiste(false);
    fetchPositionen(id);
  };

  // ── Datei einlesen → Vorschau ──
  const dateiGewaehlt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    e.target.value = ""; // gleiche Datei erneut wählbar
    if (!datei) return;
    try {
      const xml = await datei.text();
      const lv = parseOnlv(xml);
      setVorschau({ lv, xml, dateiName: datei.name });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Datei nicht lesbar",
        description: err instanceof OnlvFehler
          ? err.message
          : "Die Datei konnte nicht verarbeitet werden. Erwartet wird eine .onlv-Datei nach ÖNORM A 2063.",
      });
    }
  };

  const importBestaetigt = async () => {
    if (!vorschau) return;
    setImportiere(true);
    const { lv, xml, dateiName } = vorschau;
    const { data: kopf, error } = await (supabase.from("lv_ausschreibungen" as never) as any)
      .insert({
        name: lv.lvbezeichnung || lv.vorhaben || dateiName,
        lvcode: lv.lvcode || null,
        vorhaben: lv.vorhaben || null,
        lvbezeichnung: lv.lvbezeichnung || null,
        auftraggeber_name: lv.auftraggeberName || null,
        auftraggeber_adresse: lv.auftraggeberAdresse || null,
        waehrung: lv.waehrung,
        preisbasis: lv.preisbasis || null,
        schema_version: lv.schemaVersion || null,
        programmsystem: lv.programmsystem || null,
        datei_name: dateiName,
        xml_original: xml,
        // Vertragstext der LG/ULG-Ebene — muss beim Bepreisen sichtbar sein.
        vorbemerkungen: lv.vorbemerkungen,
        created_by: (await supabase.auth.getUser()).data.user?.id || null,
      })
      .select("id")
      .single();
    if (error || !kopf) {
      toast({ variant: "destructive", title: "Import fehlgeschlagen", description: error?.message });
      setImportiere(false);
      return;
    }
    // Positionen blockweise einfügen — große LVs haben hunderte Zeilen.
    const zeilen = lv.positionen.map((p) => ({
      lv_id: kopf.id,
      positionsnummer: p.nummer,
      lg: p.lg,
      lg_ueberschrift: p.lgUeberschrift || null,
      ulg: p.ulg,
      ulg_ueberschrift: p.ulgUeberschrift || null,
      grundtext_nr: p.grundtextNr || null,
      ftnr: p.ftnr,
      stichwort: p.stichwort || null,
      langtext_html: p.langtextHtml || null,
      einheit: p.einheit,
      menge: p.menge,
      positionsart: p.positionsart,
      leistungsteil: p.leistungsteil,
      sort: p.sort,
    }));
    for (let i = 0; i < zeilen.length; i += 200) {
      const { error: posFehler } = await (supabase.from("lv_positionen" as never) as any)
        .insert(zeilen.slice(i, i + 200));
      if (posFehler) {
        // Halb importierte LVs wieder entfernen — CASCADE räumt die Positionen mit ab.
        const { error: delFehler } = await (supabase.from("lv_ausschreibungen" as never) as any)
          .delete().eq("id", kopf.id);
        toast({
          variant: "destructive",
          title: "Import fehlgeschlagen",
          description: delFehler
            ? `${posFehler.message} — der halb importierte Eintrag konnte nicht entfernt werden, bitte in der Liste löschen.`
            : posFehler.message,
        });
        setImportiere(false);
        return;
      }
    }
    // Erst NACH dem letzten Block gilt der Import als vollständig — bricht der
    // Browser mittendrin ab, bleibt der Torso als „unvollständig" erkennbar.
    await (supabase.from("lv_ausschreibungen" as never) as any)
      .update({ import_fertig: true }).eq("id", kopf.id);
    toast({
      title: "Ausschreibung eingelesen",
      description: `${lv.positionen.filter(istBepreisbar).length} bepreisbare Positionen aus „${dateiName}“.`,
    });
    setVorschau(null);
    setImportiere(false);
    await fetchAll();
    oeffneLv(kopf.id);
  };

  // ── Löschen ──
  const loescheLv = async (id: string) => {
    const { error } = await (supabase.from("lv_ausschreibungen" as never) as any).delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Gelöscht", description: "Die Ausschreibung wurde samt Positionen gelöscht." });
    if (offenId === id) setOffenId(null);
    fetchAll();
  };

  // ── Preis speichern (beim Verlassen des Felds) ──
  const speicherePreis = async (pos: LvPosition) => {
    const eingabe = eingaben[pos.id];
    if (!eingabe) return;
    const lohn = eingabe.lohn.trim() === "" ? null : parseDecimal(eingabe.lohn);
    const sonstiges = eingabe.sonstiges.trim() === "" ? null : parseDecimal(eingabe.sonstiges);
    if ((eingabe.lohn.trim() !== "" && lohn === null) || (eingabe.sonstiges.trim() !== "" && sonstiges === null)) {
      toast({ variant: "destructive", title: "Preis unleserlich", description: "Bitte im Format 123,45 eingeben." });
      return;
    }
    if ((lohn ?? 0) < 0 || (sonstiges ?? 0) < 0) {
      toast({ variant: "destructive", title: "Negativer Preis", description: "Einheitspreise können nicht negativ sein." });
      return;
    }
    const l2 = lohn === null ? null : Math.round(lohn * 100) / 100;
    const s2 = sonstiges === null ? null : Math.round(sonstiges * 100) / 100;
    if (l2 === pos.ep_lohn && s2 === pos.ep_sonstiges) return; // nichts geändert
    const { error } = await (supabase.from("lv_positionen" as never) as any)
      .update({
        ep_lohn: l2,
        ep_sonstiges: s2,
        bepreist_am: l2 === null && s2 === null ? null : new Date().toISOString(),
      })
      .eq("id", pos.id);
    if (error) {
      toast({ variant: "destructive", title: "Speichern fehlgeschlagen", description: error.message });
      return;
    }
    setPositionen((prev) => prev.map((p) => (p.id === pos.id ? { ...p, ep_lohn: l2, ep_sonstiges: s2 } : p)));
    // Nur Felder zurückformatieren, in denen seit dem Blur NICHT weitergetippt
    // wurde — sonst löscht der zurückkehrende Save die laufende Eingabe im
    // Nachbarfeld (Review-Befund: Lohn eintippen, Tab, Sonstiges tippen …).
    setEingaben((prev) => {
      const aktuell = prev[pos.id] || { lohn: "", sonstiges: "" };
      return {
        ...prev,
        [pos.id]: {
          lohn: aktuell.lohn === eingabe.lohn ? (l2 !== null ? formatForInput(l2) : "") : aktuell.lohn,
          sonstiges: aktuell.sonstiges === eingabe.sonstiges ? (s2 !== null ? formatForInput(s2) : "") : aktuell.sonstiges,
        },
      };
    });
  };

  /** Saves je Zeile hintereinander ausführen — zwei schnelle Blur-Saves dürfen
   *  sich in der DB nicht überholen (der ältere würde den neueren überschreiben). */
  const saveKette = useRef<Promise<void>>(Promise.resolve());
  const speicherePreisSeriell = (pos: LvPosition) => {
    saveKette.current = saveKette.current.then(() => speicherePreis(pos)).catch(() => {});
  };

  // ── Gliederung + Summen der offenen Ausschreibung ──
  const summen = useMemo(() => lvSummen(positionen), [positionen]);

  const gliederung = useMemo(() => {
    type Gruppe = { schluessel: string; titel: string; positionen: LvPosition[] };
    const gruppen: Gruppe[] = [];
    let aktuelle: Gruppe | null = null;
    for (const p of positionen) {
      if (nurUnbepreiste && !filterIds.has(p.id)) continue;
      const schluessel = `${p.lg}.${p.ulg}`;
      if (!aktuelle || aktuelle.schluessel !== schluessel) {
        aktuelle = {
          schluessel,
          titel: `LG ${p.lg} ${p.lg_ueberschrift || ""} — ULG ${p.ulg} ${p.ulg_ueberschrift || ""}`.trim(),
          positionen: [],
        };
        gruppen.push(aktuelle);
      }
      aktuelle.positionen.push(p);
    }
    return gruppen;
  }, [positionen, nurUnbepreiste, filterIds]);

  const toggleLangtext = (id: string) =>
    setLangtextOffen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // ═════════════════════════ Bepreisen-Ansicht ═════════════════════════
  if (offenesLv) {
    const fertig = summen.bepreisbar > 0 && summen.bepreist === summen.bepreisbar;
    return (
      <div className="kb-page min-h-screen">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #lv-druck, #lv-druck * { visibility: visible; }
            #lv-druck { position: absolute; left: 0; top: 0; width: 100%; }
            #lv-druck input { border: none !important; }
          }
        `}</style>
        <KBToolbar
          onBack={() => { setOffenId(null); fetchAll(); }}
          backLabel="Zur Liste"
          title={offenesLv.name}
        >
          <KBToolbarButton icon={Printer} label="Drucken" onClick={() => window.print()} />
          <KBToolbarButton
            icon={FileUp}
            label="Angebots-LV exportieren"
            disabled
            title="Kommt, sobald ein bepreistes Muster-LV vorliegt — ohne die offiziellen Preisfeld-Namen würde das AVA-Programm des Ausschreibers die Datei ablehnen. Das Original-XML ist dafür gespeichert."
          />
        </KBToolbar>

        <div id="lv-druck" className="container mx-auto px-3 sm:px-4 py-4 max-w-[1200px] space-y-4">
          {/* ── Kopf: Vorhaben + laufende Summen ── */}
          <div className="kb-panel p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-bold text-base truncate">{offenesLv.vorhaben || offenesLv.name}</h2>
                <p className="text-sm text-muted-foreground truncate">
                  {[offenesLv.auftraggeber_name, offenesLv.auftraggeber_adresse].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                fertig ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-800"
              }`}>
                {summen.bepreist} von {summen.bepreisbar} Positionen bepreist
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-border p-2">
                <p className="text-[11px] text-muted-foreground">Angebotssumme (netto)</p>
                <p className="text-base font-bold tabular-nums">{eur(summen.netto)}</p>
                <p className="text-[11px] text-muted-foreground">nur Normalpositionen</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-[11px] text-muted-foreground">davon Lohn</p>
                <p className="text-base font-bold tabular-nums">{eur(summen.lohnanteil)}</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-[11px] text-muted-foreground">Wahlpositionen</p>
                <p className="text-base font-bold tabular-nums">{eur(summen.wahl)}</p>
                <p className="text-[11px] text-muted-foreground">zählen nicht zur Summe</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-[11px] text-muted-foreground">Eventualpositionen</p>
                <p className="text-base font-bold tabular-nums">{eur(summen.eventual)}</p>
                <p className="text-[11px] text-muted-foreground">zählen nicht zur Summe</p>
              </div>
            </div>
            {summen.bepreisbar > summen.bepreist && (
              <label className="mt-3 flex items-center gap-2 text-sm print:hidden">
                <input
                  type="checkbox"
                  checked={nurUnbepreiste}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilterIds(new Set(
                        positionen.filter((p) => istBepreisbar(p) && positionspreis(p) === null).map((p) => p.id)
                      ));
                    }
                    setNurUnbepreiste(e.target.checked);
                  }}
                />
                Nur unbepreiste Positionen zeigen ({summen.bepreisbar - summen.bepreist})
              </label>
            )}
          </div>

          {/* ── Vorbemerkungen: Vertragstext der Ausschreibung — preisrelevant,
              deshalb hier lesbar und nicht nur im XML (Review-Befund). ── */}
          {vorbemerkungen.length > 0 && (
            <div className="kb-panel overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-2 bg-amber-50 px-3 py-2 text-left text-sm font-bold text-amber-900"
                onClick={() => setVorbemerkungenOffen((v) => !v)}
              >
                {vorbemerkungenOffen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Vorbemerkungen der Ausschreibung ({vorbemerkungen.length}) — Vertragstext, bitte vor dem Bepreisen lesen
              </button>
              {vorbemerkungenOffen && (
                <div className="divide-y divide-border">
                  {vorbemerkungen.map((v, i) => (
                    <div key={i} className="p-3 text-sm">
                      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                        LG {v.lg}{v.ulg ? ` · ULG ${v.ulg}` : ""}
                      </p>
                      <div
                        className="[&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5"
                        /* HTML kommt aus dem Whitelist-Sanitizer des Parsers. */
                        dangerouslySetInnerHTML={{ __html: v.html }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Positionen nach LG/ULG ── */}
          {posLoading ? (
            <p className="text-center py-10 text-muted-foreground">Lädt…</p>
          ) : (
            gliederung.map((gruppe) => (
              <div key={gruppe.schluessel} className="kb-panel overflow-hidden">
                <div className="bg-muted/60 px-3 py-2 text-sm font-bold border-b border-border">
                  {gruppe.titel}
                </div>
                <div className="divide-y divide-border">
                  {gruppe.positionen.map((p) => {
                    const bepreisbar = istBepreisbar(p);
                    const preis = positionspreis(p);
                    const ep = epGesamt(p);
                    const badge = ART_BADGE[p.positionsart];
                    const offen = langtextOffen.has(p.id);
                    return (
                      <div key={p.id} className={`p-3 ${bepreisbar && preis === null ? "bg-amber-50/60" : ""}`}>
                        <div className="flex flex-wrap items-start gap-2">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                            onClick={() => toggleLangtext(p.id)}
                            title={offen ? "Langtext einklappen" : "Langtext zeigen"}
                          >
                            {offen
                              ? <ChevronDown className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />}
                            <span className="min-w-0">
                              <span className="font-mono text-xs text-muted-foreground mr-2">{p.positionsnummer}</span>
                              <span className="font-medium">{p.stichwort || "(ohne Stichwort)"}</span>
                              {badge && (
                                <span className={`ml-2 inline-block rounded border px-1.5 py-0 text-[10px] font-semibold align-middle ${badge.klasse}`}>
                                  {badge.label}
                                </span>
                              )}
                              {!bepreisbar && (
                                <span className="ml-2 inline-block rounded border border-border bg-muted px-1.5 py-0 text-[10px] align-middle text-muted-foreground">
                                  Vertragstext
                                </span>
                              )}
                            </span>
                          </button>
                          {bepreisbar && (
                            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                              {Number(p.menge).toLocaleString("de-AT")} {p.einheit}
                            </span>
                          )}
                        </div>

                        {offen && p.langtext_html && (
                          <div
                            className="mt-2 ml-6 rounded-md border border-border bg-muted/40 p-3 text-sm [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                            /* Der Parser lässt nur p/br/b/i/u/ul/ol/li/sup/sub ohne
                               Attribute durch — deshalb ist das hier gefahrlos. */
                            dangerouslySetInnerHTML={{ __html: p.langtext_html }}
                          />
                        )}

                        {bepreisbar && (
                          <div className="mt-2 ml-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end print:grid-cols-4">
                            <div>
                              <label className="block text-[11px] font-semibold mb-0.5" htmlFor={`lohn-${p.id}`}>EP Lohn (€)</label>
                              <input
                                id={`lohn-${p.id}`}
                                type="text"
                                inputMode="decimal"
                                className="kb-input w-full"
                                placeholder="0,00"
                                value={eingaben[p.id]?.lohn ?? ""}
                                onChange={(e) => setEingaben((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], lohn: e.target.value.replace(/[^0-9.,]/g, "") },
                                }))}
                                onBlur={() => speicherePreisSeriell(p)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold mb-0.5" htmlFor={`sonst-${p.id}`}>EP Sonstiges (€)</label>
                              <input
                                id={`sonst-${p.id}`}
                                type="text"
                                inputMode="decimal"
                                className="kb-input w-full"
                                placeholder="0,00"
                                value={eingaben[p.id]?.sonstiges ?? ""}
                                onChange={(e) => setEingaben((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], sonstiges: e.target.value.replace(/[^0-9.,]/g, "") },
                                }))}
                                onBlur={() => speicherePreisSeriell(p)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              />
                            </div>
                            <div className="text-sm">
                              <p className="text-[11px] text-muted-foreground">EP gesamt</p>
                              <p className="font-medium tabular-nums">{ep !== null ? eur(ep) : "–"}</p>
                            </div>
                            <div className="text-sm">
                              <p className="text-[11px] text-muted-foreground">Positionspreis</p>
                              <p className="font-bold tabular-nums">{preis !== null ? eur(preis) : "–"}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {!posLoading && nurUnbepreiste && gliederung.length === 0 && (
            <div className="kb-panel p-8 text-center text-muted-foreground">
              Alles bepreist — keine offenen Positionen mehr.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═════════════════════════ Listen-Ansicht ═════════════════════════
  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title="Ausschreibungen">
        <KBToolbarButton
          icon={Plus}
          iconClassName="text-kb-green"
          label="LV einlesen"
          title="ÖNORM-A-2063-Datei (.onlv) einlesen"
          onClick={() => dateiInput.current?.click()}
        />
      </KBToolbar>
      <input
        ref={dateiInput}
        type="file"
        accept=".onlv,.xml"
        className="hidden"
        onChange={dateiGewaehlt}
      />

      <div className="container mx-auto px-3 sm:px-4 py-4 max-w-[1100px]">
        {loading ? (
          <p className="text-center py-10 text-muted-foreground">Lädt…</p>
        ) : lvs.length === 0 ? (
          <div className="kb-panel p-8 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 text-lg font-semibold">Noch keine Ausschreibung eingelesen</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Lies ein Leistungsverzeichnis nach ÖNORM A 2063 (.onlv) ein — danach kannst du
              jede Position mit Lohn- und Sonstiges-Anteil bepreisen und siehst die
              Angebotssumme laufend mit.
            </p>
            <Button className="h-11" onClick={() => dateiInput.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" /> LV-Datei einlesen
            </Button>
          </div>
        ) : (
          <div className="kb-panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung / Vorhaben</TableHead>
                  <TableHead>Auftraggeber</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Bepreist</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Angebotssumme</TableHead>
                  <TableHead className="whitespace-nowrap">Eingelesen</TableHead>
                  <TableHead className="w-10"><span className="sr-only">Löschen</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lvs.map((lv) => {
                  const s = alleSummen[lv.id];
                  const fertig = s && s.bepreisbar > 0 && s.bepreist === s.bepreisbar;
                  return (
                    <TableRow key={lv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => oeffneLv(lv.id)}>
                      <TableCell>
                        <p className="font-medium">{lv.name}</p>
                        {lv.vorhaben && lv.vorhaben !== lv.name && (
                          <p className="text-xs text-muted-foreground">{lv.vorhaben}</p>
                        )}
                        {lv.import_fertig === false && (
                          <p className="text-xs font-medium text-destructive">
                            Import unvollständig abgebrochen — bitte löschen und neu einlesen.
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">{lv.auftraggeber_name || "–"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {s ? (
                          <span className={fertig ? "text-green-700 font-medium" : s.bepreist > 0 ? "text-amber-700" : "text-muted-foreground"}>
                            {s.bepreist} / {s.bepreisbar}
                            {!fertig && s.bepreisbar > 0 && (
                              <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" />
                            )}
                          </span>
                        ) : "–"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {s ? eur(s.netto) : "–"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(parseISO(lv.created_at), "dd.MM.yyyy", { locale: de })}
                      </TableCell>
                      <TableCell className="w-10">
                        <button
                          type="button"
                          className="text-destructive hover:opacity-70"
                          onClick={(e) => { e.stopPropagation(); setLoeschenId(lv.id); }}
                          title="Ausschreibung löschen"
                          aria-label="Ausschreibung löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="text-xs font-normal text-muted-foreground">
                    Klick öffnet die Bepreisung. Angebotssumme = nur Normalpositionen; Wahl-
                    und Eventualpositionen stehen getrennt in der Bepreisungs-Ansicht.
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>

      {/* ── Import-Vorschau ── */}
      <Dialog open={!!vorschau} onOpenChange={(o) => { if (!o) setVorschau(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ausschreibung einlesen?</DialogTitle>
            <DialogDescription>
              Prüfe kurz, ob das die richtige Datei ist — gespeichert wird erst nach Bestätigung.
            </DialogDescription>
          </DialogHeader>
          {vorschau && (
            <div className="space-y-2 text-sm">
              {[
                ["Datei", vorschau.dateiName],
                ["Bauvorhaben", vorschau.lv.vorhaben || "–"],
                ["LV-Bezeichnung", vorschau.lv.lvbezeichnung || "–"],
                ["Auftraggeber", [vorschau.lv.auftraggeberName, vorschau.lv.auftraggeberAdresse].filter(Boolean).join(", ") || "–"],
                ["Erstellt mit", vorschau.lv.programmsystem || "–"],
                ["Schema", `ÖNORM A 2063 / ${vorschau.lv.schemaVersion || "unbekannt"}`],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[130px_1fr] gap-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium break-words">{v}</span>
                </div>
              ))}
              <div className="grid grid-cols-[130px_1fr] gap-2">
                <span className="text-muted-foreground">Positionen</span>
                <span className="font-medium">
                  {vorschau.lv.positionen.filter(istBepreisbar).length} bepreisbar
                  {" · "}{vorschau.lv.positionen.filter((p) => !istBepreisbar(p)).length} Vertragstexte
                </span>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setVorschau(null)} disabled={importiere}>
              Abbrechen
            </Button>
            <Button className="flex-1" onClick={importBestaetigt} disabled={importiere}>
              {importiere ? "Wird eingelesen…" : "Einlesen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Löschen-Bestätigung ── */}
      <AlertDialog open={!!loeschenId} onOpenChange={(o) => { if (!o) setLoeschenId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ausschreibung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Ausschreibung wird samt allen Positionen und erfassten Preisen dauerhaft
              gelöscht. Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (loeschenId) loescheLv(loeschenId); setLoeschenId(null); }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
