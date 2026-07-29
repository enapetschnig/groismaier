/**
 * Finanzplanung — Nachbau der Planrechnung des Steuerberaters in der App.
 *
 * Reiter:
 *   Übersicht     Plan-GuV Soll/Ist je Jahr (Struktur wie Excel-Blatt "Plan GuV")
 *   Liquidität    Monatsraster Zufluss/Abfluss/Endbestand + Verlauf
 *   Bauvorhaben   Pipeline aus Angeboten/Aufträgen inkl. Zahlungsverteilung
 *   Kosten        Monatsraster je Kategorie (Fixkosten, Wareneinkauf, Erträge)
 *   Personal      Soll/Ist je Mitarbeiter und Monat
 *   Kredite       Kredite und Investitionen inkl. Abschreibung
 *
 * Alle Zahlen kommen aus useFinanzplanung(); hier wird nur dargestellt und
 * geschrieben — gerechnet wird in src/lib/finanzplanung.ts.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useZurueck } from "@/hooks/useZurueck";
import { KBToolbar, KBToolbarButton, KBSubTabs } from "@/components/kingbill";
import { useFinanzplanung, type BvZeile } from "@/hooks/useFinanzplanung";
import { MONATSNAMEN, monatsIndex, jahresSumme } from "@/lib/finanzplanung";
import { formatForInput, parseDecimal } from "@/lib/num";
import { ArrowLeft, RefreshCw, Wallet, TrendingUp, Building2, Receipt, Users, Landmark } from "lucide-react";

const eur = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : Number(n).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? "" : `${n.toLocaleString("de-AT", { maximumFractionDigits: 1 })} %`);

/** Zelle, die beim Verlassen speichert (wie im Kalkulations-Katalog). */
function BetragZelle({ wert, onCommit, className = "" }: {
  wert: number | null; onCommit: (n: number | null) => void; className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const anzeige = text ?? (wert === null || wert === undefined ? "" : formatForInput(wert, 2));
  return (
    <input
      className={`kb-input h-8 w-full min-h-0 px-1 py-0 text-right text-xs tabular-nums ${className}`}
      inputMode="decimal"
      value={anzeige}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (text === null) return;
        const n = text.trim() === "" ? null : parseDecimal(text);
        setText(null);
        if (n !== undefined) onCommit(n);
      }}
    />
  );
}

export default function Finanzplanung() {
  const zurueck = useZurueck("/");
  const { toast } = useToast();
  const fp = useFinanzplanung();
  const [tab, setTab] = useState("uebersicht");
  const [jahrAuswahl, setJahrAuswahl] = useState<number | null>(null);
  const jahr = jahrAuswahl ?? fp.basisJahr;

  const fehler = (m: string) => toast({ variant: "destructive", title: "Nicht gespeichert", description: m });

  // --- Schreiben ---------------------------------------------------------
  const setzeWert = async (kategorieId: string, j: number, m: number, feld: "soll" | "ist_manuell", betrag: number | null) => {
    const t = (supabase.from("finanz_werte" as never) as any);
    const { error } = await t.upsert(
      { kategorie_id: kategorieId, jahr: j, monat: m, [feld]: betrag, updated_at: new Date().toISOString() },
      { onConflict: "kategorie_id,jahr,monat" },
    );
    if (error) { fehler(error.message); return; }
    fp.reload();
  };

  const setzePersonal = async (name: string, j: number, m: number, feld: "soll" | "ist", betrag: number | null) => {
    const t = (supabase.from("finanz_personal" as never) as any);
    const { error } = await t.upsert(
      { name, jahr: j, monat: m, [feld]: betrag, updated_at: new Date().toISOString() },
      { onConflict: "name,jahr,monat" },
    );
    if (error) { fehler(error.message); return; }
    fp.reload();
  };

  /** Pipeline-Zusatz zu einem Beleg speichern (legt bei Bedarf die Zeile an). */
  const setzeBv = async (bv: BvZeile, patch: Record<string, unknown>) => {
    const t = (supabase.from("finanz_bv" as never) as any);
    const bestehend = !bv.id.startsWith("inv:");
    const { error } = bestehend
      ? await t.update(patch).eq("id", bv.id)
      : await t.insert({
          invoice_id: bv.invoice_id, kunde: bv.kunde, bezeichnung: bv.bezeichnung,
          phase: bv.phase, summe: bv.summe,
          start_jahr: bv.startJahr, start_monat: bv.startMonat,
          ende_jahr: bv.endeJahr, ende_monat: bv.endeMonat, ...patch,
        });
    if (error) { fehler(error.message); return; }
    fp.reload();
  };

  // --- Ableitungen für die Anzeige ---------------------------------------
  const guv = fp.guvJeJahr.find((g) => g.jahr === jahr);
  const kategorienJeBereich = useMemo(() => {
    const m = new Map<string, typeof fp.kategorien>();
    for (const k of fp.kategorien) {
      if (!m.has(k.bereich)) m.set(k.bereich, []);
      m.get(k.bereich)!.push(k);
    }
    return m;
  }, [fp.kategorien]);

  const wertMap = useMemo(() => {
    const m = new Map<string, { soll: number | null; ist: number | null }>();
    for (const w of fp.werte) m.set(`${w.kategorie_id}|${w.jahr}|${w.monat}`, { soll: w.soll, ist: w.ist_manuell });
    return m;
  }, [fp.werte]);

  const personalNamen = useMemo(
    () => [...new Set(fp.personal.map((p) => p.name))].sort(),
    [fp.personal],
  );
  const personalMap = useMemo(() => {
    const m = new Map<string, { soll: number | null; ist: number | null }>();
    for (const p of fp.personal) m.set(`${p.name}|${p.jahr}|${p.monat}`, { soll: p.soll, ist: p.ist });
    return m;
  }, [fp.personal]);

  const liqJahr = useMemo(() => {
    const von = monatsIndex(jahr, 1, fp.basisJahr);
    return {
      soll: fp.liquiditaetSoll.filter((l) => l.idx >= von && l.idx <= von + 11),
      ist: fp.liquiditaetIst.filter((l) => l.idx >= von && l.idx <= von + 11),
    };
  }, [fp.liquiditaetSoll, fp.liquiditaetIst, jahr, fp.basisJahr]);

  const tiefpunkt = useMemo(
    () => fp.liquiditaetSoll.reduce((min, l) => (l.endbestand < min.endbestand ? l : min),
      fp.liquiditaetSoll[0] || { endbestand: 0, jahr: 0, monat: 1, idx: 0 } as any),
    [fp.liquiditaetSoll],
  );

  if (fp.loading) {
    return (
      <div className="kb-page min-h-screen">
        <KBToolbar title="Finanzplanung" onBack={zurueck} />
        <div className="p-6 text-sm text-muted-foreground">Wird geladen …</div>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        title="Finanzplanung"
        onBack={zurueck}
        rightActions={<KBToolbarButton icon={RefreshCw} label="Aktualisieren" onClick={() => fp.reload()} />}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/80">Jahr</span>
          <select
            className="kb-input h-8 min-h-0 px-2 py-0 text-sm"
            value={jahr}
            onChange={(e) => setJahrAuswahl(Number(e.target.value))}
          >
            {fp.jahre.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
      </KBToolbar>

      <div className="p-3 sm:p-4">
        <KBSubTabs
          activeId={tab}
          onSelect={setTab}
          items={[
            { id: "uebersicht", label: "Übersicht", icon: TrendingUp },
            { id: "liquiditaet", label: "Liquidität", icon: Wallet },
            { id: "bauvorhaben", label: "Bauvorhaben", icon: Building2, badge: fp.pipeline.length },
            { id: "kosten", label: "Kosten", icon: Receipt },
            { id: "personal", label: "Personal", icon: Users },
            { id: "kredite", label: "Kredite & Investitionen", icon: Landmark },
          ]}
        />

        {/* ================= ÜBERSICHT ================= */}
        {tab === "uebersicht" && guv && (
          <div className="kb-panel mt-3">
            <div className="border-b px-4 py-2.5 text-sm font-bold">Plan-Gewinn- und Verlustrechnung {jahr}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Position</th>
                    <th className="w-32 px-3 py-2 text-right font-semibold">Soll</th>
                    <th className="w-20 px-3 py-2 text-right font-semibold">%</th>
                    <th className="w-32 px-3 py-2 text-right font-semibold">Ist</th>
                    <th className="w-20 px-3 py-2 text-right font-semibold">%</th>
                    <th className="w-32 px-3 py-2 text-right font-semibold">Abweichung</th>
                  </tr>
                </thead>
                <tbody>
                  {guv.soll.zeilen.map((z, i) => {
                    const ist = guv.ist.zeilen[i];
                    const diff = (ist?.betrag ?? 0) - z.betrag;
                    // Bei Aufwandszeilen ist "mehr" schlecht, bei Ertragszeilen gut.
                    const istAufwand = /Wareneinsatz|Personalkosten|Abschreibung|Aufwendungen|KÖSt/.test(z.label);
                    const gut = istAufwand ? diff <= 0 : diff >= 0;
                    return (
                      <tr key={z.label} className={`border-b last:border-b-0 ${z.hervor ? "bg-muted/40 font-bold" : ""}`}>
                        <td className="px-3 py-1.5">{z.label}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{eur(z.betrag)}</td>
                        <td className="px-3 py-1.5 text-right text-xs text-muted-foreground tabular-nums">{pct(z.prozent)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{eur(ist?.betrag)}</td>
                        <td className="px-3 py-1.5 text-right text-xs text-muted-foreground tabular-nums">{pct(ist?.prozent ?? null)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${diff === 0 ? "text-muted-foreground" : gut ? "text-kb-green" : "text-destructive"}`}>
                          {diff === 0 ? "" : (diff > 0 ? "+" : "") + eur(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              Ist-Werte kommen aus den Belegen der App (Rechnungen, Zahlungseingänge, Eingangsrechnungen);
              für Zeiträume davor aus der importierten Historie.
            </div>
          </div>
        )}

        {/* ================= LIQUIDITÄT ================= */}
        {tab === "liquiditaet" && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Kennzahl titel="Anfangsbestand" wert={fp.anfangsbestand} />
              <Kennzahl
                titel={`Endbestand Dezember ${jahr}`}
                wert={liqJahr.soll[liqJahr.soll.length - 1]?.endbestand ?? 0}
                warnung={(liqJahr.soll[liqJahr.soll.length - 1]?.endbestand ?? 0) < fp.warnschwelle}
              />
              <Kennzahl
                titel={`Tiefpunkt ${tiefpunkt?.monat ? MONATSNAMEN[tiefpunkt.monat - 1] : ""} ${tiefpunkt?.jahr || ""}`}
                wert={tiefpunkt?.endbestand ?? 0}
                warnung={(tiefpunkt?.endbestand ?? 0) < fp.warnschwelle}
              />
            </div>
            <div className="kb-panel">
              <div className="border-b px-4 py-2.5 text-sm font-bold">Liquiditätsplan {jahr}</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="px-2 py-2 font-semibold">Position</th>
                      {liqJahr.soll.map((l) => (
                        <th key={l.idx} className="px-2 py-2 text-right font-semibold">{MONATSNAMEN[l.monat - 1].slice(0, 3)}</th>
                      ))}
                      <th className="px-2 py-2 text-right font-semibold">Jahr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["Kundenzahlungen", "kundenzahlungen"], ["Übrige Erlöse", "uebrigeErloese"],
                      ["Zinserträge", "zinsertraege"], ["Neue Kreditlinien", "kreditlinienNeu"],
                    ] as const).map(([label, key]) => (
                      <LiqZeile key={key} label={label} monate={liqJahr.soll} feld={key} />
                    ))}
                    <tr className="border-b bg-muted/40 font-bold">
                      <td className="px-2 py-1.5">Summe Zufluss</td>
                      {liqJahr.soll.map((l) => <td key={l.idx} className="px-2 py-1.5 text-right tabular-nums">{eur(l.zufluss)}</td>)}
                      <td className="px-2 py-1.5 text-right tabular-nums">{eur(liqJahr.soll.reduce((s, l) => s + l.zufluss, 0))}</td>
                    </tr>
                    {([
                      ["Wareneinkauf", "wareneinkauf"], ["Personal", "personal"],
                      ["Sonstige betriebliche Aufwendungen", "sbaw"], ["Investitionen", "investitionen"],
                      ["Kreditraten", "kreditraten"],
                    ] as const).map(([label, key]) => (
                      <LiqZeile key={key} label={label} monate={liqJahr.soll} feld={key} />
                    ))}
                    <tr className="border-b bg-muted/40 font-bold">
                      <td className="px-2 py-1.5">Summe Abfluss</td>
                      {liqJahr.soll.map((l) => <td key={l.idx} className="px-2 py-1.5 text-right tabular-nums">{eur(l.abfluss)}</td>)}
                      <td className="px-2 py-1.5 text-right tabular-nums">{eur(liqJahr.soll.reduce((s, l) => s + l.abfluss, 0))}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1.5 font-semibold">Saldo</td>
                      {liqJahr.soll.map((l) => (
                        <td key={l.idx} className={`px-2 py-1.5 text-right tabular-nums ${l.saldo < 0 ? "text-destructive" : ""}`}>{eur(l.saldo)}</td>
                      ))}
                      <td className="px-2 py-1.5 text-right tabular-nums">{eur(liqJahr.soll.reduce((s, l) => s + l.saldo, 0))}</td>
                    </tr>
                    <tr className="bg-muted/40 font-bold">
                      <td className="px-2 py-1.5">Endbestand</td>
                      {liqJahr.soll.map((l) => (
                        <td key={l.idx} className={`px-2 py-1.5 text-right tabular-nums ${l.endbestand < fp.warnschwelle ? "text-destructive" : ""}`}>
                          {eur(l.endbestand)}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                Rot = Endbestand unter der eingestellten Warnschwelle ({eur(fp.warnschwelle)} €).
              </div>
            </div>
          </div>
        )}

        {/* ================= BAUVORHABEN ================= */}
        {tab === "bauvorhaben" && (
          <div className="kb-panel mt-3">
            <div className="border-b px-4 py-2.5 text-sm font-bold">
              Bauvorhaben — Pipeline und Zahlungsverteilung
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Kunde</th>
                    <th className="px-2 py-2 font-semibold">Bauvorhaben</th>
                    <th className="w-28 px-2 py-2 font-semibold">Phase</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">Summe</th>
                    <th className="w-24 px-2 py-2 font-semibold">Beginn</th>
                    <th className="w-24 px-2 py-2 font-semibold">Ende</th>
                    <th className="w-16 px-2 py-2 text-right font-semibold">Teilr.</th>
                    <th className="w-16 px-2 py-2 text-right font-semibold">Anz %</th>
                    <th className="w-16 px-2 py-2 text-right font-semibold">Schl %</th>
                    <th className="w-20 px-2 py-2 text-right font-semibold">Raten</th>
                  </tr>
                </thead>
                <tbody>
                  {fp.pipeline.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-4 text-center text-muted-foreground">
                      Noch keine Angebote oder Aufträge erfasst.
                    </td></tr>
                  )}
                  {fp.pipeline.map((bv) => (
                    <tr key={bv.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1.5">{bv.kunde}</td>
                      <td className="px-2 py-1.5">{bv.bezeichnung}</td>
                      <td className="px-2 py-1.5">
                        <select
                          className="kb-input h-8 min-h-0 w-full px-1 py-0 text-xs"
                          value={bv.phase}
                          onChange={(e) => setzeBv(bv, { phase: e.target.value })}
                        >
                          <option value="entwurf">Entwurf</option>
                          <option value="angebot">Angebot</option>
                          <option value="beauftragt">Beauftragt</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{eur(bv.summe)}</td>
                      <td className="px-2 py-1.5">{bv.startMonat ? `${bv.startMonat}/${bv.startJahr}` : "—"}</td>
                      <td className="px-2 py-1.5">{bv.endeMonat ? `${bv.endeMonat}/${bv.endeJahr}` : "—"}</td>
                      <td className="px-2 py-1.5">
                        <BetragZelle wert={bv.teilzahlungen} onCommit={(n) => setzeBv(bv, { teilzahlungen: n })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <BetragZelle wert={bv.anzProzent} onCommit={(n) => setzeBv(bv, { anz_prozent: n })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <BetragZelle wert={bv.schlussProzent} onCommit={(n) => setzeBv(bv, { schluss_prozent: n })} />
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground" title={
                        bv.raten.map((r) => `${r.art}: ${eur(r.betrag)} €`).join("\n")
                      }>{bv.raten.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              Die Zeilen entstehen aus Angeboten und Auftragsbestätigungen. Leere Felder bedeuten
              „Vorgabe der Zahlungsstaffel verwenden".
            </div>
          </div>
        )}

        {/* ================= KOSTEN ================= */}
        {tab === "kosten" && (
          <div className="mt-3 space-y-3">
            {[
              ["sbaw", "Sonstige betriebliche Aufwendungen"],
              ["wareneinkauf", "Wareneinkauf"],
              ["foerderung", "Förderungen und Zuschüsse"],
              ["sonstiger_ertrag", "Sonstige Erträge"],
              ["zinsertrag", "Zinserträge"],
            ].map(([bereich, titel]) => {
              const kats = kategorienJeBereich.get(bereich) || [];
              if (kats.length === 0) return null;
              return (
                <div key={bereich} className="kb-panel">
                  <div className="border-b px-4 py-2.5 text-sm font-bold">{titel} — {jahr}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                          <th className="w-44 px-2 py-2 font-semibold">Kategorie</th>
                          <th className="w-48 px-2 py-2 font-semibold">Detail</th>
                          {MONATSNAMEN.map((m) => <th key={m} className="px-1 py-2 text-right font-semibold">{m.slice(0, 3)}</th>)}
                          <th className="w-24 px-2 py-2 text-right font-semibold">Jahr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kats.map((k) => {
                          const jahresSoll = MONATSNAMEN.reduce((s, _, i) =>
                            s + (wertMap.get(`${k.id}|${jahr}|${i + 1}`)?.soll || 0), 0);
                          return (
                            <tr key={k.id} className="border-b last:border-b-0">
                              <td className="px-2 py-1 font-medium">{k.kategorie}{k.ist_zinsaufwand && <span className="ml-1 text-[10px] text-muted-foreground">(Zinsen)</span>}</td>
                              <td className="px-2 py-1 text-muted-foreground">{k.detail}</td>
                              {MONATSNAMEN.map((_, i) => (
                                <td key={i} className="px-0.5 py-1">
                                  <BetragZelle
                                    wert={wertMap.get(`${k.id}|${jahr}|${i + 1}`)?.soll ?? null}
                                    onCommit={(n) => setzeWert(k.id, jahr, i + 1, "soll", n)}
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-1 text-right font-semibold tabular-nums">{eur(jahresSoll)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {fp.kategorien.length === 0 && (
              <div className="kb-panel p-6 text-center text-sm text-muted-foreground">
                Noch keine Kategorien angelegt. Sie entstehen beim Import der Planrechnung.
              </div>
            )}
          </div>
        )}

        {/* ================= PERSONAL ================= */}
        {tab === "personal" && (
          <div className="kb-panel mt-3">
            <div className="border-b px-4 py-2.5 text-sm font-bold">Personalkosten {jahr}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="w-44 px-2 py-2 font-semibold">Mitarbeiter</th>
                    <th className="w-16 px-2 py-2 font-semibold">Wert</th>
                    {MONATSNAMEN.map((m) => <th key={m} className="px-1 py-2 text-right font-semibold">{m.slice(0, 3)}</th>)}
                    <th className="w-24 px-2 py-2 text-right font-semibold">Jahr</th>
                  </tr>
                </thead>
                <tbody>
                  {personalNamen.length === 0 && (
                    <tr><td colSpan={15} className="px-3 py-4 text-center text-muted-foreground">
                      Noch keine Personalplanung erfasst.
                    </td></tr>
                  )}
                  {personalNamen.map((name) => ([
                    <tr key={`${name}-soll`} className="border-b">
                      <td className="px-2 py-1 font-medium" rowSpan={2}>{name}</td>
                      <td className="px-2 py-1 text-muted-foreground">Soll</td>
                      {MONATSNAMEN.map((_, i) => (
                        <td key={i} className="px-0.5 py-1">
                          <BetragZelle
                            wert={personalMap.get(`${name}|${jahr}|${i + 1}`)?.soll ?? null}
                            onCommit={(n) => setzePersonal(name, jahr, i + 1, "soll", n)}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-semibold tabular-nums">
                        {eur(MONATSNAMEN.reduce((s, _, i) => s + (personalMap.get(`${name}|${jahr}|${i + 1}`)?.soll || 0), 0))}
                      </td>
                    </tr>,
                    <tr key={`${name}-ist`} className="border-b last:border-b-0">
                      <td className="px-2 py-1 text-muted-foreground">Ist</td>
                      {MONATSNAMEN.map((_, i) => (
                        <td key={i} className="px-0.5 py-1">
                          <BetragZelle
                            wert={personalMap.get(`${name}|${jahr}|${i + 1}`)?.ist ?? null}
                            onCommit={(n) => setzePersonal(name, jahr, i + 1, "ist", n)}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-semibold tabular-nums">
                        {eur(MONATSNAMEN.reduce((s, _, i) => s + (personalMap.get(`${name}|${jahr}|${i + 1}`)?.ist || 0), 0))}
                      </td>
                    </tr>,
                  ]))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              Ist-Werte kommen aus der Lohnverrechnung — die App kann sie nicht aus Stunden ableiten,
              weil Sonderzahlungen und Lohnnebenkosten dort nicht abgebildet sind.
            </div>
          </div>
        )}

        {/* ================= KREDITE & INVESTITIONEN ================= */}
        {tab === "kredite" && (
          <div className="mt-3 space-y-3">
            <div className="kb-panel">
              <div className="border-b px-4 py-2.5 text-sm font-bold">Kredite</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Bezeichnung</th>
                    <th className="px-2 py-2 font-semibold">Bank</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">Rate/Monat</th>
                    <th className="w-24 px-2 py-2 font-semibold">Beginn</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Laufzeit</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">Summe {jahr}</th>
                  </tr>
                </thead>
                <tbody>
                  {fp.kredite.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Noch keine Kredite erfasst.</td></tr>
                  )}
                  {fp.kredite.map((k) => (
                    <tr key={k.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1.5">{k.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{k.bank}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{eur(k.rate_monatlich)}</td>
                      <td className="px-2 py-1.5">{k.start_monat ? `${k.start_monat}/${k.start_jahr}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{k.laufzeit_monate ? `${k.laufzeit_monate} Mon.` : "offen"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {eur(Number(k.rate_monatlich) * 12)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t px-3 py-2 text-right text-xs font-bold">
                Kreditraten {jahr}: {eur(jahresSumme(fp.reihen.kreditRaten, jahr, fp.basisJahr))} €
              </div>
            </div>

            <div className="kb-panel">
              <div className="border-b px-4 py-2.5 text-sm font-bold">Investitionen und Abschreibung</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Bezeichnung</th>
                    <th className="px-2 py-2 font-semibold">AfA-Position</th>
                    <th className="w-20 px-2 py-2 text-right font-semibold">ND</th>
                    <th className="w-24 px-2 py-2 font-semibold">Anschaffung</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">Betrag</th>
                    <th className="w-20 px-2 py-2 font-semibold">Art</th>
                  </tr>
                </thead>
                <tbody>
                  {fp.anschaffungen.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Noch keine Investitionen erfasst.</td></tr>
                  )}
                  {fp.anschaffungen.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1.5">{a.bezeichnung}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{a.afa_text}</td>
                      <td className="px-2 py-1.5 text-right">{a.nutzungsdauer ? `${a.nutzungsdauer} J.` : "—"}</td>
                      <td className="px-2 py-1.5">{a.monat}/{a.jahr}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{eur(a.betrag_ist ?? a.betrag_soll)}</td>
                      <td className="px-2 py-1.5">{a.ist_gwg ? "GWG" : "Anlage"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {guv && (
                <div className="border-t px-3 py-2 text-right text-xs font-bold">
                  Abschreibung {jahr}: {eur(guv.soll.zeilen.find((z) => z.label === "Abschreibung gesamt")?.betrag ?? 0)} €
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Kennzahl({ titel, wert, warnung, versteckt }: {
  titel: string; wert: number; warnung?: boolean; versteckt?: boolean;
}) {
  if (versteckt) return null;
  return (
    <div className="kb-panel px-4 py-3">
      <div className="text-xs text-muted-foreground">{titel}</div>
      <div className={`text-lg font-bold tabular-nums ${warnung ? "text-destructive" : ""}`}>{eur(wert)} €</div>
    </div>
  );
}

function LiqZeile({ label, monate, feld }: {
  label: string; monate: { idx: number; positionen: Record<string, number> }[]; feld: string;
}) {
  const summe = monate.reduce((s, l) => s + (l.positionen[feld] || 0), 0);
  return (
    <tr className="border-b">
      <td className="px-2 py-1.5">{label}</td>
      {monate.map((l) => (
        <td key={l.idx} className="px-2 py-1.5 text-right tabular-nums">{eur(l.positionen[feld] || 0)}</td>
      ))}
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{eur(summe)}</td>
    </tr>
  );
}
