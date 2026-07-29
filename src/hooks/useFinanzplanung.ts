/**
 * useFinanzplanung — lädt alles, was die Finanzplanung braucht, und rechnet
 * daraus die Monatsreihen für Plan-GuV und Liquiditätsplan.
 *
 * Grundregel (siehe Migration 20260729100000): IST-Werte werden nicht
 * gespeichert, sondern aus den Belegen gerechnet, die ohnehin entstehen —
 * Rechnungen, Zahlungseingänge, Eingangsrechnungen. Nur für Zeiträume VOR der
 * App-Einführung (Einstellung `finanz_belege_ab`) kommen sie aus der
 * importierten Excel-Historie.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Reihe, StaffelBand, STAFFEL_STANDARD, Zahlungsrate,
  addiere, afaFuerJahr, berechneGuV, berechneLiquiditaet, jahresSumme,
  kreditReihe, leereReihe, monatsIndex, verteileAuftrag,
} from "@/lib/finanzplanung";

export interface FinanzKategorie {
  id: string; bereich: string; kategorie: string; detail: string | null;
  sort: number; aktiv: boolean; ist_zinsaufwand: boolean;
}
export interface FinanzWert {
  id: string; kategorie_id: string; jahr: number; monat: number;
  soll: number | null; ist_manuell: number | null;
}
export interface FinanzKredit {
  id: string; name: string; bank: string | null; rate_monatlich: number;
  start_jahr: number | null; start_monat: number | null;
  laufzeit_monate: number | null; ist_neue_linie: boolean; aktiv: boolean;
  kreditbetrag: number | null;
}
export interface FinanzAnschaffung {
  id: string; bezeichnung: string; kategorie: string | null; afa_text: string | null;
  nutzungsdauer: number | null; ist_gwg: boolean; jahr: number; monat: number;
  betrag_soll: number | null; betrag_ist: number | null;
}
export interface FinanzPersonal {
  id: string; name: string; rolle: string | null; jahr: number; monat: number;
  soll: number | null; ist: number | null;
}
/** Eine Zeile der Bauvorhaben-Pipeline (aus Beleg abgeleitet oder manuell). */
export interface BvZeile {
  id: string;                       // finanz_bv.id oder "inv:<invoice_id>"
  invoice_id: string | null;
  kunde: string;
  bezeichnung: string;
  phase: "entwurf" | "angebot" | "beauftragt";
  summe: number;
  startJahr: number | null; startMonat: number | null;
  endeJahr: number | null; endeMonat: number | null;
  teilzahlungen: number | null;
  anzProzent: number | null;
  schlussProzent: number | null;
  /** true = automatisch aus einem Beleg, nicht händisch angelegt */
  ausBeleg: boolean;
  raten: Zahlungsrate[];
}

const ERLOES_TYPEN = ["rechnung", "anzahlungsrechnung", "schlussrechnung", "gutschrift"];

export function useFinanzplanung() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [kategorien, setKategorien] = useState<FinanzKategorie[]>([]);
  const [werte, setWerte] = useState<FinanzWert[]>([]);
  const [kredite, setKredite] = useState<FinanzKredit[]>([]);
  const [anschaffungen, setAnschaffungen] = useState<FinanzAnschaffung[]>([]);
  const [personal, setPersonal] = useState<FinanzPersonal[]>([]);
  const [bvOverrides, setBvOverrides] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [zahlungen, setZahlungen] = useState<any[]>([]);
  const [eingangsrechnungen, setEingangsrechnungen] = useState<any[]>([]);

  const reload = useCallback(async () => {
    const t = (name: string) => (supabase.from(name as never) as any);
    const [set, kat, wer, kre, ans, per, bv, inv, zah, er] = await Promise.all([
      supabase.from("app_settings").select("key, value").like("key", "finanz\\_%"),
      t("finanz_kategorien").select("*").order("bereich").order("sort"),
      t("finanz_werte").select("*"),
      t("finanz_kredite").select("*").order("name"),
      t("finanz_anschaffungen").select("*").order("jahr").order("monat"),
      t("finanz_personal").select("*").order("name"),
      t("finanz_bv").select("*"),
      supabase.from("invoices")
        .select("id, typ, status, datum, netto_summe, kunde_name, betreff, leistungsdatum, leistungsdatum_bis, project_id, customer_id, parent_invoice_id")
        .order("datum"),
      supabase.from("invoice_payments").select("invoice_id, betrag, datum"),
      supabase.from("purchase_invoices")
        .select("id, lieferant, rechnungsdatum, faellig_am, bezahlt_am, betrag_netto, kategorie, status"),
    ]);
    const s: Record<string, string> = {};
    for (const row of set.data || []) s[row.key] = row.value;
    setSettings(s);
    setKategorien(((kat.data as any[]) || []).filter((k) => k.aktiv !== false));
    setWerte((wer.data as any[]) || []);
    setKredite((kre.data as any[]) || []);
    setAnschaffungen((ans.data as any[]) || []);
    setPersonal((per.data as any[]) || []);
    setBvOverrides((bv.data as any[]) || []);
    setInvoices(((inv.data as any[]) || []).filter((i) => i.status !== "storniert"));
    setZahlungen((zah.data as any[]) || []);
    setEingangsrechnungen((er.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // --------------------------------------------------------------------------
  // Rahmen
  // --------------------------------------------------------------------------
  const basisJahr = Number(settings.finanz_basisjahr) || new Date().getFullYear();
  const planJahre = Number(settings.finanz_planjahre) || 3;
  const anzahlMonate = planJahre * 12;
  const jahre = useMemo(
    () => Array.from({ length: planJahre }, (_, i) => basisJahr + i),
    [basisJahr, planJahre],
  );
  const staffel: StaffelBand[] = useMemo(() => {
    try {
      const p = JSON.parse(settings.finanz_zahlungsstaffel || "");
      return Array.isArray(p) && p.length ? p : STAFFEL_STANDARD;
    } catch { return STAFFEL_STANDARD; }
  }, [settings.finanz_zahlungsstaffel]);

  /**
   * Ab diesem Monatsindex gelten die Belege der App; davor die importierte
   * Excel-Historie. Ohne Einstellung: alles aus den Belegen.
   */
  const belegeAbIdx = useMemo(() => {
    const v = settings.finanz_belege_ab;
    if (!v) return 1;
    const [j, m] = v.split("-").map(Number);
    return j && m ? monatsIndex(j, m, basisJahr) : 1;
  }, [settings.finanz_belege_ab, basisJahr]);

  const idxAusDatum = useCallback((d: string | null): number | null => {
    if (!d) return null;
    const [j, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
    if (!j || !m) return null;
    const i = monatsIndex(j, m, basisJahr);
    return i >= 1 && i <= anzahlMonate ? i : null;
  }, [basisJahr, anzahlMonate]);

  // --------------------------------------------------------------------------
  // Bauvorhaben-Pipeline — aus Angeboten/Aufträgen, ergänzt um Overrides
  // --------------------------------------------------------------------------
  const pipeline: BvZeile[] = useMemo(() => {
    const ovByInvoice = new Map(bvOverrides.filter((o) => o.invoice_id).map((o) => [o.invoice_id, o]));
    const zeilen: BvZeile[] = [];
    // Ein Angebot, aus dem bereits eine Auftragsbestaetigung entstanden ist,
    // darf NICHT zusaetzlich in der Pipeline stehen — sonst zaehlt dasselbe
    // Bauvorhaben mit voller Summe doppelt (einmal als Angebot, einmal als
    // Auftrag) und die Umsatzprognose ist um diesen Betrag zu hoch.
    const abgeloest = new Set(
      invoices.filter((i) => i.typ === "auftragsbestaetigung" && i.parent_invoice_id)
              .map((i) => i.parent_invoice_id as string),
    );

    for (const inv of invoices) {
      // Nur Vorhaben, nicht die Fakturierung selbst: Angebote und Aufträge.
      if (inv.typ !== "angebot" && inv.typ !== "auftragsbestaetigung") continue;
      if (inv.status === "abgelehnt") continue;
      if (inv.typ === "angebot" && abgeloest.has(inv.id)) continue;
      const ov = ovByInvoice.get(inv.id);
      if (ov && ov.aktiv === false) continue;

      const phase: BvZeile["phase"] =
        ov?.phase ? ov.phase
        : inv.typ === "auftragsbestaetigung" || inv.status === "angenommen" ? "beauftragt"
        : inv.status === "entwurf" ? "entwurf"
        : "angebot";

      const start = ov?.start_jahr && ov?.start_monat
        ? { j: ov.start_jahr, m: ov.start_monat }
        : datumTeile(inv.leistungsdatum || inv.datum);
      const ende = ov?.ende_jahr && ov?.ende_monat
        ? { j: ov.ende_jahr, m: ov.ende_monat }
        : datumTeile(inv.leistungsdatum_bis || inv.leistungsdatum || inv.datum);

      const summe = Number(ov?.summe ?? inv.netto_summe) || 0;
      const startIdx = start ? monatsIndex(start.j, start.m, basisJahr) : 0;
      const endeIdx = ende ? monatsIndex(ende.j, ende.m, basisJahr) : startIdx;

      zeilen.push({
        id: ov?.id || `inv:${inv.id}`,
        invoice_id: inv.id,
        kunde: inv.kunde_name || "",
        bezeichnung: ov?.bezeichnung || inv.betreff || "",
        phase, summe,
        startJahr: start?.j ?? null, startMonat: start?.m ?? null,
        endeJahr: ende?.j ?? null, endeMonat: ende?.m ?? null,
        teilzahlungen: ov?.teilzahlungen ?? null,
        anzProzent: ov?.anz_prozent ?? null,
        schlussProzent: ov?.schluss_prozent ?? null,
        ausBeleg: true,
        raten: verteileAuftrag({
          summe, startIdx, endeIdx,
          anzProzent: ov?.anz_prozent, schlussProzent: ov?.schluss_prozent,
          teilzahlungen: ov?.teilzahlungen,
        }, staffel),
      });
    }

    // Rein manuelle Vorhaben (ohne Beleg in der App)
    for (const o of bvOverrides) {
      if (o.invoice_id || o.aktiv === false) continue;
      const startIdx = o.start_jahr && o.start_monat ? monatsIndex(o.start_jahr, o.start_monat, basisJahr) : 0;
      const endeIdx = o.ende_jahr && o.ende_monat ? monatsIndex(o.ende_jahr, o.ende_monat, basisJahr) : startIdx;
      zeilen.push({
        id: o.id, invoice_id: null, kunde: o.kunde || "", bezeichnung: o.bezeichnung || "",
        phase: o.phase || "angebot", summe: Number(o.summe) || 0,
        startJahr: o.start_jahr, startMonat: o.start_monat,
        endeJahr: o.ende_jahr, endeMonat: o.ende_monat,
        teilzahlungen: o.teilzahlungen, anzProzent: o.anz_prozent, schlussProzent: o.schluss_prozent,
        ausBeleg: false,
        raten: verteileAuftrag({
          summe: Number(o.summe) || 0, startIdx, endeIdx,
          anzProzent: o.anz_prozent, schlussProzent: o.schluss_prozent, teilzahlungen: o.teilzahlungen,
        }, staffel),
      });
    }
    return zeilen;
  }, [invoices, bvOverrides, basisJahr, staffel]);

  // --------------------------------------------------------------------------
  // Monatsreihen
  // --------------------------------------------------------------------------
  const reihen = useMemo(() => {
    const katById = new Map(kategorien.map((k) => [k.id, k]));
    const wertReihe = (filter: (k: FinanzKategorie) => boolean, feld: "soll" | "ist_manuell"): Reihe => {
      const r = leereReihe();
      for (const w of werte) {
        const k = katById.get(w.kategorie_id);
        if (!k || !filter(k)) continue;
        const betrag = Number(w[feld]) || 0;
        if (!betrag) continue;
        const i = monatsIndex(w.jahr, w.monat, basisJahr);
        if (i >= 1 && i <= anzahlMonate) addiere(r, i, betrag);
      }
      return r;
    };

    // ---- SOLL ----
    // Umsatz-Soll: Prognose aus der Pipeline (beauftragt zählt voll; Angebote
    // gehen mit ihrer Phase gewichtet ein — Entwürfe bleiben außen vor).
    const gewicht = (p: BvZeile["phase"]) => (p === "beauftragt" ? 1 : p === "angebot" ? 1 : 0);
    const umsatzSoll = leereReihe();
    for (const bv of pipeline) {
      const g = gewicht(bv.phase);
      if (!g) continue;
      for (const rate of bv.raten) {
        if (rate.idx >= 1 && rate.idx <= anzahlMonate) addiere(umsatzSoll, rate.idx, rate.betrag * g);
      }
    }
    const wareneinkaufSoll = wertReihe((k) => k.bereich === "wareneinkauf", "soll");
    const sbawSoll = wertReihe((k) => k.bereich === "sbaw" && !k.ist_zinsaufwand, "soll");
    const zinsaufwandSoll = wertReihe((k) => k.bereich === "sbaw" && k.ist_zinsaufwand, "soll");
    const foerderungSoll = wertReihe((k) => k.bereich === "foerderung" || k.bereich === "sonstiger_ertrag", "soll");
    const zinsertragSoll = wertReihe((k) => k.bereich === "zinsertrag", "soll");

    const personalSoll = leereReihe();
    const personalIst = leereReihe();
    for (const p of personal) {
      const i = monatsIndex(p.jahr, p.monat, basisJahr);
      if (i < 1 || i > anzahlMonate) continue;
      addiere(personalSoll, i, Number(p.soll) || 0);
      addiere(personalIst, i, Number(p.ist) || 0);
    }

    const investitionSoll = leereReihe();
    const investitionIst = leereReihe();
    for (const a of anschaffungen) {
      const i = monatsIndex(a.jahr, a.monat, basisJahr);
      if (i < 1 || i > anzahlMonate) continue;
      addiere(investitionSoll, i, Number(a.betrag_soll) || 0);
      addiere(investitionIst, i, Number(a.betrag_ist) || 0);
    }

    const kreditRaten = kreditReihe(
      kredite.map((k) => ({ ...k, rate_monatlich: Number(k.rate_monatlich) || 0 })),
      basisJahr, anzahlMonate,
    );
    const kreditlinienNeu = leereReihe();
    for (const k of kredite) {
      if (!k.ist_neue_linie || !k.aktiv || !k.kreditbetrag) continue;
      const i = k.start_jahr && k.start_monat ? monatsIndex(k.start_jahr, k.start_monat, basisJahr) : 1;
      if (i >= 1 && i <= anzahlMonate) addiere(kreditlinienNeu, i, Number(k.kreditbetrag));
    }

    // ---- IST ----
    // Vor `belegeAbIdx` aus der importierten Historie, danach aus den Belegen.
    const histUmsatz = wertReihe((k) => k.bereich === "sonstiger_ertrag" && k.kategorie === "__umsatz__", "ist_manuell");
    const umsatzIst = leereReihe();
    // Anzahlungs- und Schlussrechnung gehoeren zum SELBEN Auftrag: Die
    // Schlussrechnung enthaelt bereits die Abzugszeilen der Anzahlungen
    // (negative Positionen), ihre netto_summe ist also der Restbetrag.
    // Beide voll zu zaehlen haette den Umsatz doppelt ausgewiesen.
    for (const inv of invoices) {
      if (!ERLOES_TYPEN.includes(inv.typ)) continue;
      const i = idxAusDatum(inv.datum);
      if (!i || i < belegeAbIdx) continue;
      const vz = inv.typ === "gutschrift" ? -1 : 1;
      addiere(umsatzIst, i, (Number(inv.netto_summe) || 0) * vz);
    }
    for (const [k, v] of Object.entries(histUmsatz)) if (Number(k) < belegeAbIdx) addiere(umsatzIst, Number(k), v);

    // Liquidität: echte Zahlungseingänge (nicht die Rechnungsstellung).
    const zahlungenIst = leereReihe();
    for (const z of zahlungen) {
      const i = idxAusDatum(z.datum);
      if (i && i >= belegeAbIdx) addiere(zahlungenIst, i, Number(z.betrag) || 0);
    }

    const wareneinkaufIst = leereReihe();     // GuV: nach Rechnungsdatum
    const wareneinkaufAbfluss = leereReihe(); // Liquidität: nach Zahlung bzw. Fälligkeit
    for (const e of eingangsrechnungen) {
      // Abgelehnte oder stornierte Lieferantenrechnungen sind kein Aufwand
      // und kein Liquiditaetsabfluss.
      if (["abgelehnt", "storniert"].includes(String(e.status || "").toLowerCase())) continue;
      const betrag = Number(e.betrag_netto) || 0;
      if (!betrag) continue;
      const iG = idxAusDatum(e.rechnungsdatum);
      if (iG && iG >= belegeAbIdx) addiere(wareneinkaufIst, iG, betrag);
      const iL = idxAusDatum(e.bezahlt_am || e.faellig_am || e.rechnungsdatum);
      if (iL && iL >= belegeAbIdx) addiere(wareneinkaufAbfluss, iL, betrag);
    }
    const histWareneinkauf = wertReihe((k) => k.bereich === "wareneinkauf", "ist_manuell");
    for (const [k, v] of Object.entries(histWareneinkauf)) {
      if (Number(k) < belegeAbIdx) { addiere(wareneinkaufIst, Number(k), v); addiere(wareneinkaufAbfluss, Number(k), v); }
    }

    const sbawIst = wertReihe((k) => k.bereich === "sbaw" && !k.ist_zinsaufwand, "ist_manuell");
    const zinsaufwandIst = wertReihe((k) => k.bereich === "sbaw" && k.ist_zinsaufwand, "ist_manuell");
    const foerderungIst = wertReihe((k) => k.bereich === "foerderung" || k.bereich === "sonstiger_ertrag", "ist_manuell");
    const zinsertragIst = wertReihe((k) => k.bereich === "zinsertrag", "ist_manuell");

    return {
      umsatzSoll, umsatzIst, zahlungenIst,
      wareneinkaufSoll, wareneinkaufIst, wareneinkaufAbfluss,
      sbawSoll, sbawIst, zinsaufwandSoll, zinsaufwandIst,
      foerderungSoll, foerderungIst, zinsertragSoll, zinsertragIst,
      personalSoll, personalIst, investitionSoll, investitionIst,
      kreditRaten, kreditlinienNeu,
    };
  }, [kategorien, werte, personal, anschaffungen, kredite, invoices, zahlungen,
      eingangsrechnungen, pipeline, basisJahr, anzahlMonate, belegeAbIdx, idxAusDatum]);

  // --------------------------------------------------------------------------
  // Plan-GuV je Jahr
  // --------------------------------------------------------------------------
  const guvJeJahr = useMemo(() => {
    const koestSatz = Number(settings.finanz_koest_satz) || 23;
    const koestMindest = Number(settings.finanz_koest_mindest) || 500;
    return jahre.map((jahr) => {
      const js = (r: Reihe) => jahresSumme(r, jahr, basisJahr);
      const anschaffungenFuerAfa = anschaffungen.map((a) => ({
        bezeichnung: a.bezeichnung, jahr: a.jahr, monat: a.monat,
        betrag: Number(a.betrag_ist ?? a.betrag_soll) || 0,
        nutzungsdauer: a.nutzungsdauer, ist_gwg: a.ist_gwg,
      }));
      const afa = afaFuerJahr(anschaffungenFuerAfa, jahr);
      const soll = berechneGuV({
        umsatz: js(reihen.umsatzSoll), sonstigeErtraege: js(reihen.foerderungSoll),
        wareneinkauf: js(reihen.wareneinkaufSoll), personalkosten: js(reihen.personalSoll),
        abschreibung: afa.abschreibung, gwg: afa.gwg, sbaw: js(reihen.sbawSoll),
        zinsertrag: js(reihen.zinsertragSoll), zinsaufwand: js(reihen.zinsaufwandSoll),
        koestSatz, koestMindest,
      });
      const ist = berechneGuV({
        umsatz: js(reihen.umsatzIst), sonstigeErtraege: js(reihen.foerderungIst),
        wareneinkauf: js(reihen.wareneinkaufIst), personalkosten: js(reihen.personalIst),
        abschreibung: afa.abschreibung, gwg: afa.gwg, sbaw: js(reihen.sbawIst),
        zinsertrag: js(reihen.zinsertragIst), zinsaufwand: js(reihen.zinsaufwandIst),
        koestSatz, koestMindest,
      });
      return { jahr, soll, ist };
    });
  }, [jahre, reihen, anschaffungen, basisJahr, settings]);

  // --------------------------------------------------------------------------
  // Liquiditätsplan
  // --------------------------------------------------------------------------
  const anfangsbestand = useMemo(() =>
    (Number(settings.finanz_liq_bargeld) || 0)
    + (Number(settings.finanz_liq_konto) || 0)
    + (Number(settings.finanz_liq_kreditlinien) || 0),
  [settings]);

  const liquiditaetSoll = useMemo(() => berechneLiquiditaet({
    kundenzahlungen: reihen.umsatzSoll, zinsertraege: reihen.zinsertragSoll,
    uebrigeErloese: reihen.foerderungSoll, kreditlinienNeu: reihen.kreditlinienNeu,
    sbaw: reihen.sbawSoll, wareneinkauf: reihen.wareneinkaufSoll, personal: reihen.personalSoll,
    investitionen: reihen.investitionSoll, kreditraten: reihen.kreditRaten,
    anfangsbestand, anzahlMonate,
  }, basisJahr), [reihen, anfangsbestand, anzahlMonate, basisJahr]);

  const liquiditaetIst = useMemo(() => berechneLiquiditaet({
    kundenzahlungen: reihen.zahlungenIst, zinsertraege: reihen.zinsertragIst,
    uebrigeErloese: reihen.foerderungIst, kreditlinienNeu: leereReihe(),
    sbaw: reihen.sbawIst, wareneinkauf: reihen.wareneinkaufAbfluss, personal: reihen.personalIst,
    investitionen: reihen.investitionIst, kreditraten: reihen.kreditRaten,
    anfangsbestand, anzahlMonate,
  }, basisJahr), [reihen, anfangsbestand, anzahlMonate, basisJahr]);

  return {
    loading, reload, settings, basisJahr, planJahre, jahre, anzahlMonate, staffel,
    kategorien, werte, kredite, anschaffungen, personal, pipeline,
    reihen, guvJeJahr, liquiditaetSoll, liquiditaetIst, anfangsbestand,
    warnschwelle: Number(settings.finanz_liq_warnschwelle) || 0,
  };
}

function datumTeile(d: string | null): { j: number; m: number } | null {
  if (!d) return null;
  const j = Number(String(d).slice(0, 4));
  const m = Number(String(d).slice(5, 7));
  return j && m ? { j, m } : null;
}
