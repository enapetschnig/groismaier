// ============================================================================
// „Baustelle abrechnen" — alles, was zu einem Projekt gehört, auf einen Blick
//
// Kundenwünsche 30.08./01.09.2026:
//   „eine Schlussrechnung, wo alles drauf ist von der Baustelle"
//   „alles was dem Projekt zugeordnet ist"
//   „übersichtlicher, die einzelnen Positionen aufgeschlüsselt"
//   „wenn schon mal eine Arbeitszeit in eine Rechnung reingeschrieben wurde,
//    dann unter verrechnet — aber ich will ALLE Sachen von diesem Projekt sehen"
//
// Deshalb: sieben Blöcke, jeder aufklappbar, JEDE Position einzeln an- und
// abwählbar mit „Menge × Preis = Summe". Bereits Verrechnetes wird NICHT
// versteckt, sondern mit Vermerk gezeigt („verrechnet in R-2026-041") und
// ist nur nicht vorgewählt.
//
// Keine Doppelverrechnung: Stunden und Material, die an einem Regiebericht
// hängen, stehen ausschließlich im Regie-Block.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, ClipboardList, Clock, Package, Receipt, FileText, Truck,
  ShoppingCart, ChevronDown, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseDecimal } from "@/lib/num";
import { verteileEingangsrechnung } from "@/lib/nachkalkulation";

export interface AbrechnungsPosition {
  /** Eindeutig je Zeile — trägt die Einzelauswahl. */
  id: string;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  /** Steuerfreie Brutto-Zeile (Rechnungs-Abzug). */
  mwst_exempt?: boolean;
  /** „bezahlt · € 12.000" bzw. „verrechnet in R-2026-041" — reine Anzeige. */
  vermerk?: string;
  /** Steht schon auf einer Rechnung: sichtbar, aber nicht vorgewählt. */
  erledigt?: boolean;
  /** Quell-Zeilen, die beim Speichern als verrechnet markiert werden. */
  quelle?: { art: "regie" | "zeit" | "material"; ids: string[] };
}

type BlockKey = "angebot" | "regie" | "zeit" | "material" | "lieferschein" | "eingangsrechnung" | "abzug";

interface Block {
  key: BlockKey;
  titel: string;
  hinweis: string;
  positionen: AbrechnungsPosition[];
}

/** Was der Dialog an den Beleg übergibt. */
export interface AbrechnungsErgebnis {
  positionen: AbrechnungsPosition[];
  regieIds: string[];
  zeitIds: string[];
  materialIds: string[];
}

const eur = (n: number) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(n || 0);
const zahl = (n: number) =>
  new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(n || 0);

const ICONS: Record<BlockKey, typeof Clock> = {
  angebot: FileText, regie: ClipboardList, zeit: Clock, material: Package,
  lieferschein: Truck, eingangsrechnung: ShoppingCart, abzug: Receipt,
};

export function BaustelleAbrechnenDialog({
  open, onClose, projectId, belegId, onUebernehmen,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  /** Der Beleg selbst — er darf sich nicht selbst abziehen. */
  belegId: string | null;
  onUebernehmen: (ergebnis: AbrechnungsErgebnis) => void;
}) {
  const { toast } = useToast();
  const [laedt, setLaedt] = useState(false);
  const [bloecke, setBloecke] = useState<Block[]>([]);
  /** Angehakte Positionen — die Wahrheit der Auswahl (nicht der Block). */
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [offeneBloecke, setOffeneBloecke] = useState<Set<BlockKey>>(new Set());
  const [stundensatz, setStundensatz] = useState(70);
  const [erAufschlag, setErAufschlag] = useState(0);

  const laden = useCallback(async () => {
    if (!projectId) return;
    setLaedt(true);
    try {
      const { data: satzRow } = await supabase
        .from("app_settings").select("value").eq("key", "regie_stundensatz").maybeSingle();
      const satz = Number((satzRow as any)?.value) || 70;
      setStundensatz(satz);

      const gefunden: Block[] = [];
      const vorwahl = new Set<string>();

      // Belegnummern für den Vermerk „verrechnet in …".
      const { data: alleBelege } = await supabase
        .from("invoices").select("id, nummer").eq("project_id", projectId);
      const belegNummer = new Map<string, string>(
        ((alleBelege as any[]) || []).map((b) => [b.id, b.nummer || "Rechnung"]),
      );
      const vermerkFuer = (id: string | null | undefined) =>
        id ? `verrechnet in ${belegNummer.get(id) || "einer Rechnung"}` : undefined;

      // ── 1) Auftrag: Auftragsbestätigung, sonst Angebot ────────────────────
      const { data: auftraege } = await supabase
        .from("invoices")
        .select("id, typ, nummer, status, datum")
        .eq("project_id", projectId)
        .in("typ", ["auftragsbestaetigung", "angebot"])
        .not("status", "in", "(storniert,abgelehnt,entwurf)")
        .order("datum", { ascending: false });
      const auftrag = ((auftraege as any[]) || []).find((a) => a.typ === "auftragsbestaetigung")
        || ((auftraege as any[]) || [])[0];
      if (auftrag) {
        const { data: pos } = await supabase
          .from("invoice_items")
          .select("id, beschreibung, kurztext, menge, einheit, einzelpreis")
          .eq("invoice_id", auftrag.id)
          .order("position");
        const positionen: AbrechnungsPosition[] = ((pos as any[]) || []).map((p) => ({
          id: `auftrag:${p.id}`,
          beschreibung: p.kurztext || p.beschreibung || "",
          menge: Number(p.menge) || 0,
          einheit: p.einheit ?? "",
          einzelpreis: Number(p.einzelpreis) || 0,
        }));
        if (positionen.length > 0) {
          gefunden.push({
            key: "angebot",
            titel: `Auftrag — ${auftrag.typ === "auftragsbestaetigung" ? "Auftragsbestätigung" : "Angebot"} ${auftrag.nummer || ""}`.trim(),
            hinweis: "Die vereinbarten Positionen.",
            positionen,
          });
          positionen.forEach((p) => vorwahl.add(p.id));
        }
      }

      // ── 2) Regieberichte — ALLE, verrechnete mit Vermerk ──────────────────
      const { data: berichte } = await supabase
        .from("disturbances")
        .select("id, datum, beschreibung, stunden, is_verrechnet, verrechnet_in_invoice_id")
        .eq("project_id", projectId)
        .order("datum");
      const regieIds = ((berichte as any[]) || []).map((b) => b.id);
      if (regieIds.length > 0) {
        const [{ data: arbeiter }, { data: materialien }, { data: maschinen }] = await Promise.all([
          supabase.from("disturbance_workers").select("disturbance_id, user_id").in("disturbance_id", regieIds),
          supabase.from("disturbance_materials").select("id, disturbance_id, material, menge, einheit, einzelpreis").in("disturbance_id", regieIds),
          (supabase.from("disturbance_maschinen" as never) as any).select("id, disturbance_id, maschine, menge, einheit, einzelpreis").in("disturbance_id", regieIds),
        ]);
        const proBericht = new Map<string, number>();
        for (const w of ((arbeiter as any[]) || [])) {
          proBericht.set(w.disturbance_id, (proBericht.get(w.disturbance_id) || 0) + 1);
        }
        const positionen: AbrechnungsPosition[] = [];
        for (const b of ((berichte as any[]) || [])) {
          const fertig = !!b.is_verrechnet;
          const vermerk = fertig ? (vermerkFuer(b.verrechnet_in_invoice_id) || "bereits verrechnet") : undefined;
          const datum = b.datum ? new Date(b.datum).toLocaleDateString("de-AT") : "";
          const anzahl = Math.max(1, proBericht.get(b.id) || 1);
          const stunden = (Number(b.stunden) || 0) * anzahl;
          if (stunden > 0) {
            positionen.push({
              id: `regie:${b.id}`,
              beschreibung: `Regiearbeit ${datum}${anzahl > 1 ? ` (${anzahl} Mitarbeiter)` : ""}${b.beschreibung ? ` — ${String(b.beschreibung).slice(0, 60)}` : ""}`,
              menge: Math.round(stunden * 100) / 100,
              einheit: "Std.",
              einzelpreis: satz,
              vermerk, erledigt: fertig,
              quelle: { art: "regie", ids: [b.id] },
            });
          }
          for (const m of ((materialien as any[]) || []).filter((x) => x.disturbance_id === b.id)) {
            // menge ist ein FREITEXT-Feld („2,5") — parseFloat schnitte am Komma ab.
            const menge = parseDecimal(String(m.menge ?? "")) ?? 0;
            if (menge <= 0) continue;
            positionen.push({
              id: `regiemat:${m.id}`,
              beschreibung: `${m.material || "Material"} (Regie ${datum})`,
              menge, einheit: m.einheit || "Stk.",
              einzelpreis: Number(m.einzelpreis) || 0,
              vermerk, erledigt: fertig,
              quelle: { art: "regie", ids: [b.id] },
            });
          }
          for (const ma of ((maschinen as any[]) || []).filter((x) => x.disturbance_id === b.id)) {
            const menge = parseDecimal(String(ma.menge ?? "")) ?? 0;
            if (menge <= 0) continue;
            positionen.push({
              id: `regiemasch:${ma.id}`,
              beschreibung: `${ma.maschine || "Maschine"} (Regie ${datum})`,
              menge, einheit: ma.einheit || "Std.",
              einzelpreis: Number(ma.einzelpreis) || 0,
              vermerk, erledigt: fertig,
              quelle: { art: "regie", ids: [b.id] },
            });
          }
        }
        if (positionen.length > 0) {
          const offen = positionen.filter((p) => !p.erledigt).length;
          gefunden.push({
            key: "regie",
            titel: `Regieberichte — ${offen} offen, ${positionen.length - offen} verrechnet`,
            hinweis: "Stunden × Mitarbeiter, Material und Maschinen der Einsätze.",
            positionen,
          });
          positionen.filter((p) => !p.erledigt).forEach((p) => vorwahl.add(p.id));
        }
      }

      // ── 3) Arbeitszeiten ohne Regiebericht — ALLE, je Mitarbeiter ─────────
      const { data: zeiten } = await supabase
        .from("time_entries")
        .select("id, user_id, stunden, datum, disturbance_id, verrechnet_in_invoice_id")
        .eq("project_id", projectId);
      const freieZeiten = ((zeiten as any[]) || []).filter((z) => !z.disturbance_id);
      if (freieZeiten.length > 0) {
        const userIds = [...new Set(freieZeiten.map((z) => z.user_id).filter(Boolean))];
        const [{ data: profile }, { data: mitarbeiter }] = await Promise.all([
          supabase.from("profiles").select("id, vorname, nachname, hidden").in("id", userIds),
          supabase.from("employees").select("user_id, stundenlohn").in("user_id", userIds),
        ]);
        const sichtbar = new Set(((profile as any[]) || []).filter((p) => !p.hidden).map((p) => p.id));
        const namen = new Map(((profile as any[]) || []).map((p) => [p.id, `${p.vorname || ""} ${p.nachname || ""}`.trim()]));
        const saetze = new Map(((mitarbeiter as any[]) || []).map((e) => [e.user_id, Number(e.stundenlohn) || satz]));
        // Je Mitarbeiter getrennt nach offen / bereits verrechnet — sonst
        // stünde eine halb verrechnete Summe da.
        const gruppen = new Map<string, { stunden: number; ids: string[] }>();
        for (const z of freieZeiten) {
          if (!sichtbar.has(z.user_id)) continue;
          const key = `${z.user_id}|${z.verrechnet_in_invoice_id || ""}`;
          const g = gruppen.get(key) || { stunden: 0, ids: [] };
          g.stunden += Number(z.stunden) || 0;
          g.ids.push(z.id);
          gruppen.set(key, g);
        }
        const positionen: AbrechnungsPosition[] = [...gruppen.entries()]
          .filter(([, g]) => g.stunden > 0)
          .map(([key, g]) => {
            const [uid, rechnungId] = key.split("|");
            const fertig = !!rechnungId;
            return {
              id: `zeit:${key}`,
              beschreibung: `Arbeitszeit ${namen.get(uid) || "Mitarbeiter"}`,
              menge: Math.round(g.stunden * 100) / 100,
              einheit: "Std.",
              einzelpreis: saetze.get(uid) || satz,
              vermerk: fertig ? vermerkFuer(rechnungId) : undefined,
              erledigt: fertig,
              quelle: { art: "zeit" as const, ids: g.ids },
            };
          });
        if (positionen.length > 0) {
          gefunden.push({
            key: "zeit",
            titel: "Gebuchte Arbeitszeiten",
            hinweis: "Stunden aus der Zeiterfassung ohne Regiebericht, je Mitarbeiter zusammengefasst.",
            positionen,
          });
          positionen.filter((p) => !p.erledigt).forEach((p) => vorwahl.add(p.id));
        }
      }

      // ── 4) Materialbuchungen — ALLE ───────────────────────────────────────
      const { data: materialBuchungen } = await supabase
        .from("material_entries")
        .select("id, material, menge, einheit, einzelpreis, disturbance_id, verrechnet_in_invoice_id")
        .eq("project_id", projectId);
      const materialPos: AbrechnungsPosition[] = ((materialBuchungen as any[]) || [])
        // Was am Regiebericht hängt, steht schon im Regie-Block.
        .filter((m) => !m.disturbance_id)
        .map((m) => ({
          id: `mat:${m.id}`,
          beschreibung: m.material || "Material",
          menge: parseDecimal(String(m.menge ?? "")) ?? 0,
          einheit: m.einheit || "Stk.",
          einzelpreis: Number(m.einzelpreis) || 0,
          vermerk: vermerkFuer(m.verrechnet_in_invoice_id),
          erledigt: !!m.verrechnet_in_invoice_id,
          quelle: { art: "material" as const, ids: [m.id] },
        }))
        .filter((m) => m.menge > 0);
      if (materialPos.length > 0) {
        gefunden.push({
          key: "material",
          titel: "Materialbuchungen",
          hinweis: "Auf das Projekt gebuchte Entnahmen — Preise prüfen, oft Einkaufspreise.",
          positionen: materialPos,
        });
        // Bewusst NICHT vorgewählt (Preise prüfen).
      }

      // ── 5) Lieferscheine ──────────────────────────────────────────────────
      const { data: lieferscheine } = await supabase
        .from("invoices")
        .select("id, nummer, datum, status")
        .eq("project_id", projectId)
        .eq("typ", "lieferschein")
        .not("status", "in", "(storniert,entwurf)")
        .order("datum");
      const lsIds = ((lieferscheine as any[]) || []).map((l) => l.id);
      if (lsIds.length > 0) {
        const lsInfo = new Map(((lieferscheine as any[]) || []).map((l) => [l.id, l]));
        const { data: lsPos } = await supabase
          .from("invoice_items")
          .select("id, invoice_id, beschreibung, kurztext, menge, einheit, einzelpreis")
          .in("invoice_id", lsIds)
          .order("position");
        const positionen: AbrechnungsPosition[] = ((lsPos as any[]) || [])
          .map((p) => {
            const ls: any = lsInfo.get(p.invoice_id);
            const fertig = ls?.status === "verrechnet";
            return {
              id: `ls:${p.id}`,
              beschreibung: `${p.kurztext || p.beschreibung || ""} (LS ${ls?.nummer || ""})`.trim(),
              menge: Number(p.menge) || 0,
              einheit: p.einheit ?? "",
              einzelpreis: Number(p.einzelpreis) || 0,
              vermerk: fertig ? "Lieferschein bereits verrechnet" : undefined,
              erledigt: fertig,
            };
          })
          .filter((p) => p.menge || p.einzelpreis);
        if (positionen.length > 0) {
          gefunden.push({
            key: "lieferschein",
            titel: `Lieferscheine (${lsIds.length})`,
            hinweis: "Geliefertes Material.",
            positionen,
          });
          positionen.filter((p) => !p.erledigt).forEach((p) => vorwahl.add(p.id));
        }
      }

      // ── 6) Eingangsrechnungen (Zukauf) ────────────────────────────────────
      const { data: erRechnungen } = await supabase
        .from("purchase_invoices")
        .select("id, lieferant, rechnungsnummer, betrag_netto, status, project_id, kategorie, verrechnet_in_invoice_id");
      const { data: erZuordnungen } = await (supabase.from("purchase_invoice_allocations" as never) as any)
        .select("project_id, purchase_invoice_id, betrag_netto, beschreibung, ziel");
      const erPos: AbrechnungsPosition[] = [];
      for (const r of ((erRechnungen as any[]) || [])) {
        // Dieselbe Verteilung wie die Nachkalkulation: Teilbeträge stimmen,
        // Lager-Anteile bleiben draußen.
        const anteile = verteileEingangsrechnung(r as any, ((erZuordnungen as any[]) || []) as any);
        anteile.forEach((a, i) => {
          if (a.project_id !== projectId || a.betrag === 0) return;
          const wer = [r.lieferant, r.rechnungsnummer].filter(Boolean).join(" ");
          erPos.push({
            id: `er:${r.id}:${i}`,
            beschreibung: a.beschreibung || `${wer || "Eingangsrechnung"}${r.kategorie ? ` (${r.kategorie})` : ""}`,
            menge: 1, einheit: "pausch.", einzelpreis: a.betrag,
            vermerk: vermerkFuer(r.verrechnet_in_invoice_id),
            erledigt: !!r.verrechnet_in_invoice_id,
          });
        });
      }
      if (erPos.length > 0) {
        gefunden.push({
          key: "eingangsrechnung",
          titel: `Eingangsrechnungen (${erPos.length})`,
          hinweis: "Zugekauftes Material und Fremdleistungen — Einkaufspreise, Aufschlag unten einstellbar.",
          positionen: erPos,
        });
        // Bewusst NICHT vorgewählt.
      }

      // ── 7) Bereits gestellte Rechnungen als Abzug ─────────────────────────
      // NICHT nur über das Projekt: Bei Schindelböck (01.09.2026) hing die
      // bezahlte Anzahlung 2026-044 an keinem Projekt, nur an der Belegkette
      // (parent_invoice_id) — und fiel so durch. Deshalb zusätzlich die
      // ganze Kette des aktuellen Belegs einsammeln, wie „Kopieren in →
      // Schlussrechnung" es tut.
      const { data: eigener } = belegId
        ? await supabase.from("invoices").select("id, customer_id, parent_invoice_id").eq("id", belegId).maybeSingle()
        : { data: null as any };
      const kundeId = (eigener as any)?.customer_id || null;
      const { data: kandidaten } = await supabase
        .from("invoices")
        .select("id, typ, nummer, datum, brutto_summe, bezahlt_betrag, status, project_id, customer_id, parent_invoice_id")
        .in("typ", ["anzahlungsrechnung", "rechnung", "schlussrechnung", "angebot", "auftragsbestaetigung"])
        .not("status", "in", "(storniert,entwurf)")
        .or(kundeId ? `project_id.eq.${projectId},customer_id.eq.${kundeId}` : `project_id.eq.${projectId}`)
        .order("datum");
      const alle = ((kandidaten as any[]) || []);
      // Kette: von diesem Beleg nach oben zur Wurzel, von dort alle Nachfahren.
      const byId = new Map(alle.map((b) => [b.id, b]));
      const kinder = new Map<string, string[]>();
      for (const b of alle) {
        if (!b.parent_invoice_id) continue;
        if (!kinder.has(b.parent_invoice_id)) kinder.set(b.parent_invoice_id, []);
        kinder.get(b.parent_invoice_id)!.push(b.id);
      }
      let wurzel: string | null = belegId;
      const gesehen = new Set<string>();
      let elternId = (eigener as any)?.parent_invoice_id as string | null;
      while (elternId && !gesehen.has(elternId)) {
        gesehen.add(elternId);
        wurzel = elternId;
        elternId = byId.get(elternId)?.parent_invoice_id || null;
      }
      const kette = new Set<string>();
      const stapel = wurzel ? [wurzel] : [];
      while (stapel.length) {
        const akt = stapel.pop()!;
        if (kette.has(akt)) continue;
        kette.add(akt);
        for (const k of kinder.get(akt) || []) stapel.push(k);
      }
      const gestellte = alle.filter((b) =>
        ["anzahlungsrechnung", "rechnung", "schlussrechnung"].includes(b.typ)
        && (b.project_id === projectId || kette.has(b.id)));
      const abzuege: AbrechnungsPosition[] = ((gestellte as any[]) || [])
        .filter((a) => a.id !== belegId)
        .map((a) => {
          const brutto = Number(a.brutto_summe) || 0;
          const bezahlt = Number(a.bezahlt_betrag) || 0;
          const label = a.typ === "anzahlungsrechnung" ? "Anzahlung"
            : a.typ === "schlussrechnung" ? "Schlussrechnung" : "Rechnung";
          const stand = a.status === "bezahlt" || (bezahlt > 0 && bezahlt >= brutto - 0.01)
            ? `bezahlt · ${eur(brutto)}`
            : bezahlt > 0 ? `teilbezahlt ${eur(bezahlt)} von ${eur(brutto)}`
            : `offen · ${eur(brutto)}`;
          return {
            id: `abzug:${a.id}`,
            beschreibung: `Abzug ${label} ${a.nummer || ""} vom ${a.datum ? new Date(a.datum).toLocaleDateString("de-AT") : ""} (brutto, MwSt-frei)`.replace(/\s+/g, " ").trim(),
            menge: 1, einheit: "pausch.", einzelpreis: -brutto,
            mwst_exempt: true,
            vermerk: stand,
            // Anzahlungen gehören immer abgezogen; sonstige Rechnungen
            // entscheidet der Chef selbst.
            erledigt: a.typ !== "anzahlungsrechnung",
          };
        })
        .filter((a) => a.einzelpreis !== 0);
      if (abzuege.length > 0) {
        gefunden.push({
          key: "abzug",
          titel: `Bereits gestellte Rechnungen (${abzuege.length})`,
          hinweis: "Als steuerfreie Brutto-Abzugszeile — Anzahlungen sind vorgewählt.",
          positionen: abzuege,
        });
        abzuege.filter((a) => !a.erledigt).forEach((a) => vorwahl.add(a.id));
      }

      setBloecke(gefunden);
      setGewaehlt(vorwahl);
      // Übersichtlich starten: bei wenigen Zeilen alles offen, sonst zu.
      const gesamtZeilen = gefunden.reduce((s, b) => s + b.positionen.length, 0);
      setOffeneBloecke(gesamtZeilen <= 12 ? new Set(gefunden.map((b) => b.key)) : new Set());
    } finally {
      setLaedt(false);
    }
  }, [projectId, belegId]);

  useEffect(() => { if (open) void laden(); }, [open, laden]);

  /** Eingangsrechnungen sind EK — der Aufschlag macht daraus den VK. */
  const preisVon = useCallback((b: Block, p: AbrechnungsPosition) =>
    b.key === "eingangsrechnung" && erAufschlag !== 0
      ? Math.round(p.einzelpreis * (1 + erAufschlag / 100) * 100) / 100
      : p.einzelpreis,
  [erAufschlag]);

  const summeVon = useCallback((b: Block) =>
    b.positionen.filter((p) => gewaehlt.has(p.id))
      .reduce((s, p) => s + p.menge * preisVon(b, p), 0),
  [gewaehlt, preisVon]);

  const gesamt = useMemo(
    () => bloecke.reduce((s, b) => s + summeVon(b), 0),
    [bloecke, summeVon],
  );
  const anzahlGewaehlt = useMemo(
    () => bloecke.reduce((s, b) => s + b.positionen.filter((p) => gewaehlt.has(p.id)).length, 0),
    [bloecke, gewaehlt],
  );

  const blockUmschalten = (b: Block, an: boolean) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      for (const p of b.positionen) {
        if (an) neu.add(p.id); else neu.delete(p.id);
      }
      return neu;
    });

  const uebernehmen = () => {
    const positionen: AbrechnungsPosition[] = [];
    const regieIds = new Set<string>();
    const zeitIds = new Set<string>();
    const materialIds = new Set<string>();
    for (const b of bloecke) {
      for (const p of b.positionen) {
        if (!gewaehlt.has(p.id)) continue;
        positionen.push({ ...p, einzelpreis: preisVon(b, p) });
        if (p.quelle?.art === "regie") p.quelle.ids.forEach((i) => regieIds.add(i));
        if (p.quelle?.art === "zeit") p.quelle.ids.forEach((i) => zeitIds.add(i));
        if (p.quelle?.art === "material") p.quelle.ids.forEach((i) => materialIds.add(i));
      }
    }
    if (positionen.length === 0) {
      toast({ variant: "destructive", title: "Nichts gewählt", description: "Bitte mindestens eine Position anhaken." });
      return;
    }
    onUebernehmen({
      positionen,
      regieIds: [...regieIds],
      zeitIds: [...zeitIds],
      materialIds: [...materialIds],
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Baustelle abrechnen</DialogTitle>
          <DialogDescription>
            Alles, was diesem Projekt zugeordnet ist. Was bereits auf einer
            Rechnung steht, ist mit Vermerk gekennzeichnet und nicht vorgewählt —
            anhaken kannst du es trotzdem.
          </DialogDescription>
        </DialogHeader>

        {!projectId ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Dem Beleg ist noch kein Projekt zugeordnet — bitte oben unter „Allgemein" ein Projekt wählen.
          </p>
        ) : laedt ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : bloecke.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Für dieses Projekt ist nichts Abrechenbares hinterlegt.
          </p>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {bloecke.map((b) => {
                const Icon = ICONS[b.key];
                const auf = offeneBloecke.has(b.key);
                const gewaehltImBlock = b.positionen.filter((p) => gewaehlt.has(p.id)).length;
                return (
                  <div key={b.key} className="rounded-md border">
                    <div className="flex items-start gap-2 p-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={gewaehltImBlock === b.positionen.length ? true : gewaehltImBlock > 0 ? "indeterminate" : false}
                        onCheckedChange={(c) => blockUmschalten(b, !!c)}
                        aria-label={`${b.titel} komplett an- oder abwählen`}
                      />
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() =>
                          setOffeneBloecke((alt) => {
                            const neu = new Set(alt);
                            if (neu.has(b.key)) neu.delete(b.key); else neu.add(b.key);
                            return neu;
                          })
                        }
                      >
                        <span className="flex flex-wrap items-center gap-1.5">
                          {auf ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="text-sm font-semibold">{b.titel}</span>
                          <span className="text-xs text-muted-foreground">
                            ({gewaehltImBlock} von {b.positionen.length} gewählt)
                          </span>
                        </span>
                        <span className="block pl-5 text-xs text-muted-foreground">{b.hinweis}</span>
                      </button>
                      <span className={`shrink-0 text-sm font-bold tabular-nums ${summeVon(b) < 0 ? "text-destructive" : ""}`}>
                        {eur(summeVon(b))}
                      </span>
                    </div>

                    {auf && (
                      <div className="divide-y border-t">
                        {b.positionen.map((p) => {
                          const an = gewaehlt.has(p.id);
                          const preis = preisVon(b, p);
                          return (
                            <label
                              key={p.id}
                              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 ${p.erledigt && !an ? "opacity-60" : ""}`}
                            >
                              <Checkbox
                                checked={an}
                                onCheckedChange={(c) =>
                                  setGewaehlt((alt) => {
                                    const neu = new Set(alt);
                                    if (c) neu.add(p.id); else neu.delete(p.id);
                                    return neu;
                                  })
                                }
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{p.beschreibung}</span>
                                {p.vermerk && (
                                  <span className={`text-[11px] ${p.erledigt ? "text-amber-700" : "text-muted-foreground"}`}>
                                    {p.vermerk}
                                  </span>
                                )}
                              </span>
                              <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums sm:block">
                                {zahl(p.menge)} {p.einheit} × {eur(preis)}
                              </span>
                              <span className={`w-24 shrink-0 text-right text-sm font-medium tabular-nums ${p.menge * preis < 0 ? "text-destructive" : ""}`}>
                                {eur(p.menge * preis)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 border-t pt-3">
              {bloecke.some((b) => b.key === "eingangsrechnung" && b.positionen.some((p) => gewaehlt.has(p.id))) && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                  <ShoppingCart className="h-4 w-4 shrink-0 text-amber-700" />
                  <span className="text-sm text-amber-900">Aufschlag auf zugekaufte Leistungen</span>
                  {[0, 10, 15, 20, 35].map((v) => (
                    <button
                      key={v} type="button" onClick={() => setErAufschlag(v)}
                      className={`min-h-[32px] rounded border px-2 text-sm ${erAufschlag === v ? "border-amber-600 bg-white font-semibold text-amber-900" : "bg-white/70"}`}
                    >{v} %</button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <span className="text-sm font-semibold">
                  {anzahlGewaehlt} Position{anzahlGewaehlt === 1 ? "" : "en"} gewählt — Summe netto
                </span>
                <span className="text-base font-bold tabular-nums">{eur(gesamt)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Regiestundensatz {eur(stundensatz)}/Std. · Stunden und Material aus
                Regieberichten stehen nur im Regie-Block, nie doppelt.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Abbrechen</Button>
                <Button onClick={uebernehmen}>In den Beleg übernehmen</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
