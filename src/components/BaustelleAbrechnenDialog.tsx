// ============================================================================
// „Baustelle abrechnen" — alles aus einem Projekt in EINE Rechnung
//
// Kundenwunsch 30.08./01.09.2026: „BV Schindelböck ist fertig und kann
// abgerechnet werden … wie bekomm ich die geleistete Anzahlungsrechnung als
// Abzug rein, und muss ich die gebuchten Stunden per Hand eingeben?" —
// und danach: „eine Schlussrechnung, wo alles drauf ist von der Baustelle".
//
// Bisher lagen die Quellen an vier verschiedenen Knöpfen (Angebot,
// Regiebericht, Zeit & Material, Anzahlungsabzug nur über die Belegliste).
// Dieser Dialog sammelt sie an EINER Stelle, zeigt je Block die Summe und
// übernimmt die Auswahl in einem Zug.
//
// WICHTIG — keine Doppelverrechnung: Stunden, die zu einem Regiebericht
// gehören (time_entries.disturbance_id gesetzt), erscheinen NUR im Block
// „Regieberichte". Werden die Berichte abgewählt, tauchen ihre Stunden im
// Zeit-Block auf — nie in beiden gleichzeitig.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ClipboardList, Clock, Package, Receipt, FileText, Truck, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseDecimal } from "@/lib/num";
import { verteileEingangsrechnung } from "@/lib/nachkalkulation";

export interface AbrechnungsPosition {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  /** Steuerfreie Brutto-Zeile (Anzahlungsabzug). */
  mwst_exempt?: boolean;
}

type BlockKey = "angebot" | "regie" | "zeit" | "material" | "lieferschein" | "eingangsrechnung" | "anzahlung";

interface Block {
  key: BlockKey;
  titel: string;
  hinweis: string;
  positionen: AbrechnungsPosition[];
  /** IDs der Regieberichte — werden nach dem Speichern als verrechnet markiert. */
  regieIds?: string[];
}

const eur = (n: number) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(n || 0);

const ICONS: Record<BlockKey, typeof Clock> = {
  angebot: FileText, regie: ClipboardList, zeit: Clock, material: Package,
  lieferschein: Truck, eingangsrechnung: ShoppingCart, anzahlung: Receipt,
};

export function BaustelleAbrechnenDialog({
  open, onClose, projectId, customerId, belegId, onUebernehmen,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  customerId: string | null;
  /** Der Beleg selbst — er darf sich nicht als Anzahlung selbst abziehen. */
  belegId: string | null;
  onUebernehmen: (positionen: AbrechnungsPosition[], regieIds: string[]) => void;
}) {
  const { toast } = useToast();
  const [laedt, setLaedt] = useState(false);
  const [bloecke, setBloecke] = useState<Block[]>([]);
  const [gewaehlt, setGewaehlt] = useState<Set<BlockKey>>(new Set());
  const [stundensatz, setStundensatz] = useState(70);
  /** Aufschlag auf eingekaufte Leistungen (Kundenwunsch 01.09.2026: die
   *  Eingangsrechnungen sind EK — weiterverrechnet wird mit Aufschlag). */
  const [erAufschlag, setErAufschlag] = useState(0);
  const [erRoh, setErRoh] = useState<{ beschreibung: string; betrag: number }[]>([]);

  const laden = useCallback(async () => {
    if (!projectId) return;
    setLaedt(true);
    try {
      const { data: satzRow } = await supabase
        .from("app_settings").select("value").eq("key", "regie_stundensatz").maybeSingle();
      const satz = Number((satzRow as any)?.value) || 70;
      setStundensatz(satz);

      const gefunden: Block[] = [];

      // ── 1) Auftrag: Positionen aus Auftragsbestätigung, sonst Angebot ──────
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
          .select("beschreibung, kurztext, menge, einheit, einzelpreis, gesamtpreis")
          .eq("invoice_id", auftrag.id)
          .order("position");
        const positionen = ((pos as any[]) || []).map((p) => ({
          beschreibung: p.kurztext || p.beschreibung || "",
          menge: Number(p.menge) || 0,
          einheit: p.einheit ?? "",
          einzelpreis: Number(p.einzelpreis) || 0,
        }));
        if (positionen.length > 0) {
          gefunden.push({
            key: "angebot",
            titel: `Auftrag: ${auftrag.typ === "auftragsbestaetigung" ? "Auftragsbestätigung" : "Angebot"} ${auftrag.nummer || ""}`.trim(),
            hinweis: "Die vereinbarten Positionen — Grundlage der Schlussrechnung.",
            positionen,
          });
        }
      }

      // ── 2) Offene Regieberichte (Stunden, Material, Maschinen) ────────────
      const { data: berichte } = await supabase
        .from("disturbances")
        .select("id, datum, beschreibung, stunden, is_verrechnet")
        .eq("project_id", projectId)
        .eq("is_verrechnet", false)
        .order("datum");
      const regieIds = ((berichte as any[]) || []).map((b) => b.id);
      if (regieIds.length > 0) {
        const [{ data: arbeiter }, { data: materialien }, { data: maschinen }] = await Promise.all([
          supabase.from("disturbance_workers").select("disturbance_id, user_id").in("disturbance_id", regieIds),
          supabase.from("disturbance_materials").select("disturbance_id, material, menge, einheit, einzelpreis").in("disturbance_id", regieIds),
          (supabase.from("disturbance_maschinen" as never) as any).select("disturbance_id, maschine, menge, einheit, einzelpreis").in("disturbance_id", regieIds),
        ]);
        const proBericht = new Map<string, number>();
        for (const w of ((arbeiter as any[]) || [])) {
          proBericht.set(w.disturbance_id, (proBericht.get(w.disturbance_id) || 0) + 1);
        }
        const positionen: AbrechnungsPosition[] = [];
        for (const b of ((berichte as any[]) || [])) {
          const anzahl = Math.max(1, proBericht.get(b.id) || 1);
          const stunden = (Number(b.stunden) || 0) * anzahl;
          if (stunden > 0) {
            const datum = b.datum ? new Date(b.datum).toLocaleDateString("de-AT") : "";
            positionen.push({
              beschreibung: `Regiearbeit ${datum}${anzahl > 1 ? ` (${anzahl} Mitarbeiter)` : ""}${b.beschreibung ? ` — ${String(b.beschreibung).slice(0, 60)}` : ""}`,
              menge: Math.round(stunden * 100) / 100,
              einheit: "Std.",
              einzelpreis: satz,
            });
          }
        }
        // menge ist ein FREITEXT-Feld („2,5") — parseFloat schnitte am
        // Komma ab und machte daraus 2.
        for (const m of ((materialien as any[]) || [])) {
          const menge = parseDecimal(String(m.menge ?? "")) ?? 0;
          if (menge <= 0) continue;
          positionen.push({
            beschreibung: `${m.material || "Material"} (Regie)`,
            menge,
            einheit: m.einheit || "Stk.",
            einzelpreis: Number(m.einzelpreis) || 0,
          });
        }
        // Maschinen/Geräte des Einsatzes gehören genauso dazu.
        for (const ma of ((maschinen as any[]) || [])) {
          const menge = parseDecimal(String(ma.menge ?? "")) ?? 0;
          if (menge <= 0) continue;
          positionen.push({
            beschreibung: `${ma.maschine || "Maschine"} (Regie)`,
            menge,
            einheit: ma.einheit || "Std.",
            einzelpreis: Number(ma.einzelpreis) || 0,
          });
        }
        if (positionen.length > 0) {
          gefunden.push({
            key: "regie",
            titel: `Regieberichte (${regieIds.length} offen)`,
            hinweis: "Stunden × Mitarbeiter und das gebuchte Material. Werden nach dem Speichern als verrechnet markiert.",
            positionen,
            regieIds,
          });
        }
      }

      // ── 3) Gebuchte Arbeitszeiten OHNE Regiebericht ───────────────────────
      const { data: zeiten } = await supabase
        .from("time_entries")
        .select("user_id, stunden, taetigkeit, disturbance_id")
        .eq("project_id", projectId);
      const freieZeiten = ((zeiten as any[]) || []).filter((z) => !z.disturbance_id);
      if (freieZeiten.length > 0) {
        const userIds = [...new Set(freieZeiten.map((z) => z.user_id).filter(Boolean))];
        const [{ data: profile }, { data: mitarbeiter }] = await Promise.all([
          supabase.from("profiles").select("id, vorname, nachname, hidden").in("id", userIds),
          supabase.from("employees").select("user_id, stundenlohn, position").in("user_id", userIds),
        ]);
        const sichtbar = new Set(((profile as any[]) || []).filter((p) => !p.hidden).map((p) => p.id));
        const namen = new Map(((profile as any[]) || []).map((p) => [p.id, `${p.vorname || ""} ${p.nachname || ""}`.trim()]));
        const saetze = new Map(((mitarbeiter as any[]) || []).map((e) => [e.user_id, Number(e.stundenlohn) || satz]));
        const summen = new Map<string, number>();
        for (const z of freieZeiten) {
          if (!sichtbar.has(z.user_id)) continue;
          summen.set(z.user_id, (summen.get(z.user_id) || 0) + (Number(z.stunden) || 0));
        }
        const positionen = [...summen.entries()]
          .filter(([, std]) => std > 0)
          .map(([uid, std]) => ({
            beschreibung: `Arbeitszeit ${namen.get(uid) || "Mitarbeiter"}`,
            menge: Math.round(std * 100) / 100,
            einheit: "Std.",
            einzelpreis: saetze.get(uid) || satz,
          }));
        if (positionen.length > 0) {
          gefunden.push({
            key: "zeit",
            titel: "Gebuchte Arbeitszeiten",
            hinweis: "Stunden aus der Zeiterfassung, die zu KEINEM Regiebericht gehören — je Mitarbeiter zusammengefasst.",
            positionen,
          });
        }
      }

      // ── 4) Materialbuchungen des Projekts ─────────────────────────────────
      const { data: materialBuchungen } = await supabase
        .from("material_entries")
        .select("material, menge, einheit, einzelpreis, typ, disturbance_id")
        .eq("project_id", projectId);
      const materialPos = ((materialBuchungen as any[]) || [])
        // Buchungen, die an einem Regiebericht hängen, stehen bereits im
        // Regie-Block — sonst stünde dasselbe Material zweimal auf der Rechnung.
        .filter((m) => !m.disturbance_id)
        .map((m) => ({
          beschreibung: m.material || "Material",
          menge: parseDecimal(String(m.menge ?? "")) ?? 0,
          einheit: m.einheit || "Stk.",
          einzelpreis: Number(m.einzelpreis) || 0,
        }))
        .filter((m) => m.menge > 0);
      if (materialPos.length > 0) {
        gefunden.push({
          key: "material",
          titel: "Materialbuchungen",
          hinweis: "Auf das Projekt gebuchte Entnahmen. Preise ggf. noch prüfen.",
          positionen: materialPos,
        });
      }

      // ── 5) Offene Lieferscheine des Projekts ──────────────────────────────
      const { data: lieferscheine } = await supabase
        .from("invoices")
        .select("id, nummer, datum, status")
        .eq("project_id", projectId)
        .eq("typ", "lieferschein")
        .not("status", "in", "(storniert,verrechnet,entwurf)")
        .order("datum");
      const lsIds = ((lieferscheine as any[]) || []).map((l) => l.id);
      if (lsIds.length > 0) {
        const { data: lsPos } = await supabase
          .from("invoice_items")
          .select("invoice_id, beschreibung, kurztext, menge, einheit, einzelpreis")
          .in("invoice_id", lsIds)
          .order("position");
        const positionen = ((lsPos as any[]) || [])
          .map((p) => ({
            beschreibung: p.kurztext || p.beschreibung || "",
            menge: Number(p.menge) || 0,
            einheit: p.einheit ?? "",
            einzelpreis: Number(p.einzelpreis) || 0,
          }))
          .filter((p) => p.beschreibung || p.menge);
        if (positionen.length > 0) {
          gefunden.push({
            key: "lieferschein",
            titel: `Offene Lieferscheine (${lsIds.length})`,
            hinweis: "Geliefertes Material, das noch nicht verrechnet ist.",
            positionen,
          });
        }
      }

      // ── 6) Eingangsrechnungen des Projekts (Zukauf weiterverrechnen) ──────
      // Kopf-Zuordnung UND Teilbeträge — dieselbe Verteilung wie in der
      // Nachkalkulation, damit Lager-Anteile korrekt draußen bleiben.
      const { data: erRechnungen } = await supabase
        .from("purchase_invoices")
        .select("id, lieferant, rechnungsnummer, rechnungsdatum, betrag_netto, status, project_id, kategorie");
      const { data: erZuordnungen } = await (supabase.from("purchase_invoice_allocations" as never) as any)
        .select("project_id, purchase_invoice_id, betrag_netto, beschreibung, ziel");
      const erPositionen: { beschreibung: string; betrag: number }[] = [];
      for (const r of ((erRechnungen as any[]) || [])) {
        const anteile = verteileEingangsrechnung(r as any, ((erZuordnungen as any[]) || []) as any);
        for (const a of anteile) {
          if (a.project_id !== projectId || a.betrag === 0) continue;
          const wer = [r.lieferant, r.rechnungsnummer].filter(Boolean).join(" ");
          erPositionen.push({
            beschreibung: a.beschreibung || `${wer || "Eingangsrechnung"}${r.kategorie ? ` (${r.kategorie})` : ""}`,
            betrag: a.betrag,
          });
        }
      }
      setErRoh(erPositionen);
      if (erPositionen.length > 0) {
        gefunden.push({
          key: "eingangsrechnung",
          titel: `Eingangsrechnungen (${erPositionen.length})`,
          hinweis: "Zugekauftes Material und Fremdleistungen dieser Baustelle — Einkaufspreise, Aufschlag unten einstellbar.",
          positionen: erPositionen.map((e) => ({
            beschreibung: e.beschreibung, menge: 1, einheit: "pausch.", einzelpreis: e.betrag,
          })),
        });
      }

      // ── 7) Anzahlungen der Belegkette als Abzug ───────────────────────────
      const { data: anzahlungen } = await supabase
        .from("invoices")
        .select("id, nummer, datum, brutto_summe, status")
        .eq("project_id", projectId)
        .eq("typ", "anzahlungsrechnung")
        .not("status", "eq", "storniert");
      const abzuege = ((anzahlungen as any[]) || [])
        .filter((a) => a.id !== belegId)
        .map((a) => ({
          beschreibung: `Abzug Anzahlung ${a.nummer || ""} vom ${a.datum ? new Date(a.datum).toLocaleDateString("de-AT") : ""} (brutto, MwSt-frei)`.replace(/\s+/g, " ").trim(),
          menge: 1,
          einheit: "pausch.",
          einzelpreis: -(Number(a.brutto_summe) || 0),
          mwst_exempt: true,
        }))
        .filter((a) => a.einzelpreis !== 0);
      if (abzuege.length > 0) {
        gefunden.push({
          key: "anzahlung",
          titel: `Anzahlungen abziehen (${abzuege.length})`,
          hinweis: "Bereits gestellte Anzahlungsrechnungen — als steuerfreie Brutto-Zeile, wie es das Finanzamt verlangt.",
          positionen: abzuege,
        });
      }

      setBloecke(gefunden);
      // Alles vorgewählt außer den Materialbuchungen: deren Preise sind oft
      // Einkaufspreise und müssen erst geprüft werden.
      // Material und Zukauf bewusst NICHT vorgewählt: dort stehen
      // Einkaufspreise, die erst geprüft bzw. mit Aufschlag versehen gehören.
      setGewaehlt(new Set(gefunden.map((b) => b.key).filter((k) => k !== "material" && k !== "eingangsrechnung")));
    } finally {
      setLaedt(false);
    }
  }, [projectId, belegId]);

  useEffect(() => { if (open) void laden(); }, [open, laden]);

  /**
   * Eingangsrechnungen sind EINKAUFSpreise — mit Aufschlag wird daraus der
   * Verkaufspreis. Die Umrechnung passiert erst hier, damit der Schieber
   * ohne Neuladen wirkt und die Rohbeträge erhalten bleiben.
   */
  const mitAufschlag = useCallback((b: Block): Block => {
    if (b.key !== "eingangsrechnung" || erAufschlag === 0) return b;
    const f = 1 + erAufschlag / 100;
    return {
      ...b,
      positionen: b.positionen.map((p) => ({
        ...p,
        einzelpreis: Math.round(p.einzelpreis * f * 100) / 100,
      })),
    };
  }, [erAufschlag]);

  const summeVon = (b: Block) =>
    mitAufschlag(b).positionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0);
  const gesamt = useMemo(
    () => bloecke.filter((b) => gewaehlt.has(b.key)).reduce((s, b) => s + summeVon(b), 0),
    [bloecke, gewaehlt],
  );

  const uebernehmen = () => {
    const aktive = bloecke.filter((b) => gewaehlt.has(b.key)).map(mitAufschlag);
    const positionen = aktive.flatMap((b) => b.positionen);
    if (positionen.length === 0) {
      toast({ variant: "destructive", title: "Nichts gewählt", description: "Bitte mindestens einen Block auswählen." });
      return;
    }
    const regieIds = aktive.flatMap((b) => b.regieIds || []);
    onUebernehmen(positionen, regieIds);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Baustelle abrechnen</DialogTitle>
          <DialogDescription>
            Alles, was auf dieser Baustelle angefallen ist — auf einmal in den Beleg.
            Wähle aus, was drauf soll; die Positionen sind danach ganz normal änderbar.
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
            Für dieses Projekt ist nichts Abrechenbares gefunden worden — keine Auftragspositionen,
            keine offenen Regieberichte, keine gebuchten Stunden oder Materialien.
          </p>
        ) : (
          <div className="space-y-2">
            {bloecke.map((b) => {
              const Icon = ICONS[b.key];
              const an = gewaehlt.has(b.key);
              return (
                <label
                  key={b.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${an ? "border-primary/50 bg-primary/5" : "bg-background"}`}
                >
                  <Checkbox
                    checked={an}
                    className="mt-0.5"
                    onCheckedChange={(c) =>
                      setGewaehlt((alt) => {
                        const neu = new Set(alt);
                        if (c) neu.add(b.key); else neu.delete(b.key);
                        return neu;
                      })
                    }
                  />
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{b.titel}</span>
                      <span className={`text-sm font-bold tabular-nums ${summeVon(b) < 0 ? "text-destructive" : ""}`}>
                        {eur(summeVon(b))}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{b.hinweis}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {b.positionen.length} Position{b.positionen.length === 1 ? "" : "en"}
                      {b.positionen.length > 0 && `: ${b.positionen.slice(0, 2).map((p) => p.beschreibung).join(" · ")}${b.positionen.length > 2 ? " …" : ""}`}
                    </p>
                  </div>
                </label>
              );
            })}

            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-sm font-semibold">Summe der Auswahl (netto)</span>
              <span className="text-base font-bold tabular-nums">{eur(gesamt)}</span>
            </div>
            {gewaehlt.has("eingangsrechnung") && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                <ShoppingCart className="h-4 w-4 shrink-0 text-amber-700" />
                <span className="text-sm text-amber-900">Aufschlag auf zugekaufte Leistungen</span>
                <div className="flex items-center gap-1">
                  {[0, 10, 15, 20, 35].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setErAufschlag(v)}
                      className={`min-h-[32px] rounded border px-2 text-sm ${erAufschlag === v ? "border-amber-600 bg-white font-semibold text-amber-900" : "bg-white/70"}`}
                    >
                      {v} %
                    </button>
                  ))}
                </div>
                <span className="text-xs text-amber-900/80">
                  Einkauf {eur(erRoh.reduce((s, e) => s + e.betrag, 0))} → Verkauf{" "}
                  {eur(erRoh.reduce((s, e) => s + e.betrag, 0) * (1 + erAufschlag / 100))}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Regiestundensatz: {eur(stundensatz)}/Std. (Einstellungen). Stunden aus
              Regieberichten stehen nur im Regie-Block — nie doppelt.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button onClick={uebernehmen}>In den Beleg übernehmen</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
