import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, AlertTriangle, Info, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Projekt-Nachkalkulation — Deckungsbeitrag je Baustelle:
 *   Erlöse (gestellte Rechnungen, netto)
 *   − Lohnkosten (gebuchte Stunden × Stundenlohn × Lohnnebenkosten-Faktor)
 *   − Materialkosten (verbrauchtes Material × EK)
 *   − Fremdkosten (Eingangsrechnungen, netto)
 *   = Deckungsbeitrag (€ und % vom Erlös)
 *
 * Zusätzlich ein "Unverrechnet"-Radar: Regieberichte und Fremdkosten, die dem
 * Projekt zugeordnet, aber noch auf keiner Rechnung sind (Verlust-Warnung).
 *
 * Nur Lese-Ansicht; alle Zahlen aus vorhandenen Daten. Annahmen werden im UI
 * transparent gemacht (Faktor, Erlös-Basis).
 */

// purchase_invoice_allocations ist (noch) nicht in den generierten Supabase-
// Typen — lokales Interface + Cast (Repo-Muster, types.ts nicht regenerieren).
interface AllocationRow {
  betrag_netto: number;
  purchase_invoice_id: string;
  purchase_invoices: { verrechnet_in_invoice_id: string | null } | null;
}

const RECHNUNG_TYPEN = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);
const eur = (n: number) => `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props { projectId: string; }

export function ProjektNachkalkulation({ projectId }: Props) {
  const [loading, setLoading] = useState(true);
  // Standardmäßig ZUGEKLAPPT — die Geldzahlen erscheinen erst auf
  // "Nachkalkulation öffnen" (bewusster Blick statt Dauer-Anzeige).
  const [offen, setOffen] = useState(false);
  const [d, setD] = useState<null | {
    erloes: number; lohn: number; material: number; fremd: number;
    faktor: number; stundenIst: number;
    unverrechnetRegie: number; unverrechnetFremd: number;
  }>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [invRes, teRes, matRes, purRes, allocRes, distRes, factRes] = await Promise.all([
        supabase.from("invoices").select("typ, status, netto_summe").eq("project_id", projectId),
        supabase.from("time_entries").select("user_id, stunden, taetigkeit").eq("project_id", projectId),
        supabase.from("material_entries").select("typ, menge, einzelpreis").eq("project_id", projectId),
        supabase.from("purchase_invoices").select("id, betrag_netto, betrag_brutto, verrechnet_in_invoice_id").eq("project_id", projectId),
        // Teilbeträge (Positions-Aufteilung) fremder Rechnungen, die DIESEM
        // Projekt zugeordnet sind — inkl. Verrechnet-Status der Mutter-Rechnung.
        (supabase.from("purchase_invoice_allocations" as never) as any)
          .select("betrag_netto, purchase_invoice_id, purchase_invoices(verrechnet_in_invoice_id)")
          .eq("project_id", projectId),
        supabase.from("disturbances").select("id, is_verrechnet").eq("project_id", projectId),
        supabase.from("app_settings").select("value").eq("key", "lohnnebenkosten_faktor").maybeSingle(),
      ]);
      if (cancelled) return;

      // --- Erlöse (netto) ---
      const alleBelege = ((invRes.data as any[]) || []).filter(i => i.status !== "storniert");
      const rechnungen = alleBelege.filter(i => RECHNUNG_TYPEN.has(i.typ));
      const hatSR = rechnungen.some(i => i.typ === "schlussrechnung");
      // Wenn es eine Schlussrechnung gibt, deckt sie die Gesamtleistung ab —
      // Anzahlungsrechnungen NICHT zusätzlich zählen (sonst doppelt).
      // Gutschriften mindern den Erlös.
      const gutschriften = alleBelege
        .filter(i => i.typ === "gutschrift")
        .reduce((s, i) => s + (Number(i.netto_summe) || 0), 0);
      const erloes = rechnungen
        .filter(i => (hatSR ? i.typ !== "anzahlungsrechnung" : true))
        .reduce((s, i) => s + (Number(i.netto_summe) || 0), 0) - gutschriften;

      // --- Lohnkosten (Ist) ---
      const faktor = Number(factRes.data?.value) || 1.8;
      const entries = ((teRes.data as any[]) || []).filter(e => !["Urlaub", "Krankenstand", "Feiertag", "Zeitausgleich", "Weiterbildung"].includes(e.taetigkeit));
      const userIds = [...new Set(entries.map(e => e.user_id))];
      const lohnByUser: Record<string, number> = {};
      if (userIds.length > 0) {
        const { data: emps } = await supabase.from("employees").select("user_id, stundenlohn").in("user_id", userIds);
        for (const e of ((emps as any[]) || [])) lohnByUser[e.user_id] = Number(e.stundenlohn) || 0;
      }
      let lohn = 0, stundenIst = 0;
      for (const e of entries) {
        const std = Number(e.stunden) || 0;
        stundenIst += std;
        lohn += std * (lohnByUser[e.user_id] || 0) * faktor;
      }

      // --- Materialkosten (Ist-Verbrauch × EK) ---
      let material = 0;
      for (const m of ((matRes.data as any[]) || [])) {
        const menge = parseFloat(String(m.menge || "0")) || 0;
        const ek = Number(m.einzelpreis) || 0;
        if (m.typ === "entnahme" || m.typ === "verbrauch") material += menge * ek;
        else if (m.typ === "rueckgabe") material -= menge * ek;
      }

      // --- Fremdkosten (Eingangsrechnungen netto, inkl. Projekt-Aufteilung) ---
      // Regel: Teilbeträge (purchase_invoice_allocations) zählen immer zu ihrem
      // Projekt. Der Kopf-Betrag einer Rechnung (project_id) zählt nur, wenn
      // die Rechnung KEINE Teilbeträge hat — sonst würde doppelt gezählt.
      const purchases = (purRes.data as any[]) || [];
      const allocRows = ((allocRes.data as AllocationRow[]) || []);
      const headerIds = purchases.map(p => p.id);
      let idsMitAufteilung = new Set<string>();
      if (headerIds.length > 0) {
        const { data: allocAny } = await (supabase.from("purchase_invoice_allocations" as never) as any)
          .select("purchase_invoice_id")
          .in("purchase_invoice_id", headerIds);
        idsMitAufteilung = new Set(((allocAny as any[]) || []).map(r => r.purchase_invoice_id));
      }
      if (cancelled) return;
      const headerNetto = (p: any) => Number(p.betrag_netto) || (Number(p.betrag_brutto) || 0) / 1.2;
      const purchasesOhneAufteilung = purchases.filter(p => !idsMitAufteilung.has(p.id));
      const fremd =
        purchasesOhneAufteilung.reduce((s, p) => s + headerNetto(p), 0) +
        allocRows.reduce((s, a) => s + (Number(a.betrag_netto) || 0), 0);

      // --- Unverrechnet-Radar ---
      const distRows = ((distRes.data as any[]) || []);
      const unverrechnetRegie = distRows.filter(x => !x.is_verrechnet).length;
      const unverrechnetFremd =
        purchasesOhneAufteilung
          .filter(p => !p.verrechnet_in_invoice_id)
          .reduce((s, p) => s + headerNetto(p), 0) +
        allocRows
          .filter(a => !a.purchase_invoices?.verrechnet_in_invoice_id)
          .reduce((s, a) => s + (Number(a.betrag_netto) || 0), 0);

      setD({ erloes, lohn: Math.round(lohn * 100) / 100, material: Math.round(material * 100) / 100, fremd: Math.round(fremd * 100) / 100, faktor, stundenIst: Math.round(stundenIst * 10) / 10, unverrechnetRegie, unverrechnetFremd });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading || !d) return null;

  const kosten = d.lohn + d.material + d.fremd;
  const db = Math.round((d.erloes - kosten) * 100) / 100;
  const dbProzent = d.erloes > 0 ? Math.round((db / d.erloes) * 1000) / 10 : null;
  const positiv = db >= 0;

  const Zeile = ({ label, wert, sub, minus }: any) => (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/50 last:border-0">
      <div>
        <span className="text-sm">{label}</span>
        {sub && <span className="text-[11px] text-muted-foreground ml-2">{sub}</span>}
      </div>
      <span className="font-mono tabular-nums text-sm">{minus ? "− " : ""}{eur(wert)}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOffen(o => !o)}>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {positiv ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-destructive" />}
            Nachkalkulation — verdient die Baustelle Geld?
          </span>
          <span className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
            {offen ? "Schließen" : "Öffnen"}
            {offen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </CardTitle>
      </CardHeader>
      {offen && (
      <CardContent>
        <Zeile label="Erlöse (gestellte Rechnungen, netto)" wert={d.erloes} />
        <Zeile label="Lohnkosten" sub={`${d.stundenIst} Std × Lohn × ${d.faktor.toLocaleString("de-AT")} (inkl. Nebenkosten)`} wert={d.lohn} minus />
        <Zeile label="Materialkosten (Verbrauch × EK)" wert={d.material} minus />
        <Zeile label="Fremdkosten (Eingangsrechnungen)" wert={d.fremd} minus />
        <div className={`flex items-baseline justify-between mt-2 pt-2 border-t-2 ${positiv ? "border-green-600/40" : "border-destructive/40"}`}>
          <span className="font-semibold">Deckungsbeitrag</span>
          <span className={`font-mono tabular-nums font-bold text-lg ${positiv ? "text-green-700" : "text-destructive"}`}>
            {eur(db)}{dbProzent !== null && <span className="text-sm font-normal ml-1">({dbProzent}%)</span>}
          </span>
        </div>

        {(d.unverrechnetRegie > 0 || d.unverrechnetFremd > 0.5) && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <b>Noch nicht verrechnet:</b>
              {d.unverrechnetRegie > 0 && <span> {d.unverrechnetRegie} Regiebericht{d.unverrechnetRegie === 1 ? "" : "e"}</span>}
              {d.unverrechnetRegie > 0 && d.unverrechnetFremd > 0.5 && <span> ·</span>}
              {d.unverrechnetFremd > 0.5 && <span> {eur(d.unverrechnetFremd)} Fremdkosten</span>}
              <span> — beim Erstellen der Schlussrechnung berücksichtigen.</span>
            </div>
          </div>
        )}

        <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          Erlös = netto der gestellten Rechnungen (bei Schlussrechnung ohne Doppelzählung der Anzahlungen). Lohn-Nebenkostenfaktor unter Admin → Einstellungen anpassbar.
        </p>
      </CardContent>
      )}
    </Card>
  );
}
