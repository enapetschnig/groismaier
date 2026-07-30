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
import { ArrowLeft, RefreshCw, Wallet, TrendingUp, Building2, Receipt, Users, Landmark, Plus, Trash2, Settings } from "lucide-react";

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

/** Textfeld, das beim Verlassen speichert. */
function TextZelle({ wert, onCommit, className = "", platzhalter }: {
  wert: string; onCommit: (v: string) => void; className?: string; platzhalter?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className={`kb-input h-8 w-full min-h-0 px-1 py-0 text-xs ${className}`}
      value={text ?? wert}
      placeholder={platzhalter}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === null) return;
        const v = text.trim();
        setText(null);
        if (v !== wert) onCommit(v);
      }}
    />
  );
}

/** Monatsauswahl 1–12. */
function MonatWahl({ wert, onCommit }: { wert: number | null; onCommit: (n: number) => void }) {
  return (
    <select
      className="kb-input h-8 min-h-0 w-full px-1 py-0 text-xs"
      value={wert ?? ""}
      onChange={(e) => onCommit(Number(e.target.value))}
    >
      <option value="">—</option>
      {MONATSNAMEN.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </select>
  );
}

export default function Finanzplanung() {
  const zurueck = useZurueck("/");
  const { toast } = useToast();
  const fp = useFinanzplanung();
  const [tab, setTab] = useState("uebersicht");
  const [jahrAuswahl, setJahrAuswahl] = useState<number | null>(null);
  /** Kostenraster: Plan- oder Ist-Werte bearbeiten. */
  const [kostenAnsicht, setKostenAnsicht] = useState<"soll" | "ist_manuell">("soll");
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

  // ── Stammdaten anlegen, aendern, entfernen ─────────────────────────────
  const tabelle = (name: string) => (supabase.from(name as never) as any);

  const schreiben = async (name: string, aktion: Promise<{ error: unknown }>) => {
    const { error } = await aktion as { error: { message?: string } | null };
    if (error) { fehler(error.message || "Unbekannter Fehler"); return false; }
    fp.reload();
    return true;
  };

  const neueKategorie = async (bereich: string) => {
    const name = window.prompt("Bezeichnung der neuen Kategorie:")?.trim();
    if (!name) return;
    const maxSort = Math.max(0, ...fp.kategorien.filter((k) => k.bereich === bereich).map((k) => k.sort));
    await schreiben("finanz_kategorien", tabelle("finanz_kategorien").insert({
      bereich, kategorie: name, sort: maxSort + 10,
    }));
  };

  const aendereKategorie = (id: string, patch: Record<string, unknown>) =>
    schreiben("finanz_kategorien", tabelle("finanz_kategorien").update(patch).eq("id", id));

  const loescheKategorie = async (id: string, bezeichnung: string) => {
    if (!window.confirm(`Kategorie „${bezeichnung}" samt aller erfassten Monatswerte entfernen?`)) return;
    await schreiben("finanz_kategorien", tabelle("finanz_kategorien").delete().eq("id", id));
  };

  const neuerKredit = () =>
    schreiben("finanz_kredite", tabelle("finanz_kredite").insert({
      name: "Neuer Kredit", rate_monatlich: 0, aktiv: true,
      start_jahr: jahr, start_monat: 1,
    }));

  const aendereKredit = (id: string, patch: Record<string, unknown>) =>
    schreiben("finanz_kredite", tabelle("finanz_kredite").update(patch).eq("id", id));

  const loescheKredit = async (id: string, name: string) => {
    if (!window.confirm(`Kredit „${name}" entfernen?`)) return;
    await schreiben("finanz_kredite", tabelle("finanz_kredite").delete().eq("id", id));
  };

  const neueAnschaffung = () =>
    schreiben("finanz_anschaffungen", tabelle("finanz_anschaffungen").insert({
      bezeichnung: "Neue Anschaffung", jahr, monat: 1, ist_gwg: false,
    }));

  const aendereAnschaffung = (id: string, patch: Record<string, unknown>) =>
    schreiben("finanz_anschaffungen", tabelle("finanz_anschaffungen").update(patch).eq("id", id));

  const loescheAnschaffung = async (id: string, bezeichnung: string) => {
    if (!window.confirm(`„${bezeichnung}" entfernen?`)) return;
    await schreiben("finanz_anschaffungen", tabelle("finanz_anschaffungen").delete().eq("id", id));
  };

  /** Personalzeile fuer einen Namen anlegen (12 Monate des gewaehlten Jahres). */
  const neuePersonalZeile = async () => {
    const name = window.prompt("Name des Mitarbeiters:")?.trim();
    if (!name) return;
    const zeilen = Array.from({ length: 12 }, (_, i) => ({ name, jahr, monat: i + 1 }));
    await schreiben("finanz_personal", tabelle("finanz_personal")
      .upsert(zeilen, { onConflict: "name,jahr,monat" }));
  };

  const loeschePersonal = async (name: string) => {
    if (!window.confirm(`Alle Personalwerte von „${name}" im Jahr ${jahr} entfernen?`)) return;
    await schreiben("finanz_personal", tabelle("finanz_personal")
      .delete().eq("name", name).eq("jahr", jahr));
  };

  const neuesBauvorhaben = async () => {
    const kunde = window.prompt("Kunde:")?.trim();
    if (!kunde) return;
    const bezeichnung = window.prompt("Bauvorhaben:")?.trim() || "";
    await schreiben("finanz_bv", tabelle("finanz_bv").insert({
      kunde, bezeichnung, phase: "angebot", summe: 0,
      start_jahr: jahr, start_monat: 1, ende_jahr: jahr, ende_monat: 3, aktiv: true,
    }));
  };

  const loescheBauvorhaben = async (id: string, bezeichnung: string) => {
    if (!window.confirm(`Bauvorhaben „${bezeichnung}" entfernen?`)) return;
    await schreiben("finanz_bv", tabelle("finanz_bv").delete().eq("id", id));
  };

  /** Einstellung in app_settings schreiben. */
  const setzeEinstellung = async (key: string, value: string) => {
    const { error } = await supabase.from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });
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
            { id: "einstellungen", label: "Einstellungen", icon: Settings },
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
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="text-sm font-bold">Bauvorhaben — Pipeline und Zahlungsverteilung</span>
              <button type="button" className="kb-btn h-8 px-3 text-xs" onClick={neuesBauvorhaben}>
                <Plus className="h-3.5 w-3.5 text-kb-green" /> Vorhaben ohne Beleg
              </button>
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
                    <th className="w-9 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fp.pipeline.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-4 text-center text-muted-foreground">
                      Noch keine Angebote oder Aufträge erfasst.
                    </td></tr>
                  )}
                  {fp.pipeline.map((bv) => (
                    <tr key={bv.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1.5">
                        {bv.ausBeleg ? bv.kunde
                          : <TextZelle wert={bv.kunde} onCommit={(v) => setzeBv(bv, { kunde: v })} />}
                      </td>
                      <td className="px-2 py-1.5">
                        {bv.ausBeleg ? bv.bezeichnung
                          : <TextZelle wert={bv.bezeichnung} onCommit={(v) => setzeBv(bv, { bezeichnung: v })} />}
                      </td>
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
                      <td className="px-2 py-1">
                        {bv.ausBeleg
                          ? <span className="block text-right tabular-nums">{eur(bv.summe)}</span>
                          : <BetragZelle wert={bv.summe} onCommit={(n) => setzeBv(bv, { summe: n ?? 0 })} />}
                      </td>
                      <td className="px-2 py-1">
                        {bv.ausBeleg
                          ? (bv.startMonat ? `${bv.startMonat}/${bv.startJahr}` : "—")
                          : <MonatWahl wert={bv.startMonat} onCommit={(n) => setzeBv(bv, { start_monat: n, start_jahr: bv.startJahr ?? jahr })} />}
                      </td>
                      <td className="px-2 py-1">
                        {bv.ausBeleg
                          ? (bv.endeMonat ? `${bv.endeMonat}/${bv.endeJahr}` : "—")
                          : <MonatWahl wert={bv.endeMonat} onCommit={(n) => setzeBv(bv, { ende_monat: n, ende_jahr: bv.endeJahr ?? jahr })} />}
                      </td>
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
                      <td className="px-1 py-1">
                        {!bv.ausBeleg && (
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Vorhaben entfernen"
                            onClick={() => loescheBauvorhaben(bv.id, bv.bezeichnung || bv.kunde)}
                          ><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </td>
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
            <div className="kb-panel flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="text-sm font-bold">Ansicht</span>
              {([["soll", "Plan (Soll)"], ["ist_manuell", "Tatsächlich (Ist)"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`kb-btn h-8 px-3 text-xs ${kostenAnsicht === id ? "kb-btn-primary" : ""}`}
                  onClick={() => setKostenAnsicht(id)}
                >{label}</button>
              ))}
              <span className="ml-2 text-xs text-muted-foreground">
                {kostenAnsicht === "soll"
                  ? "Geplante Beträge — Grundlage für Vorschau und Liquidität."
                  : "Tatsächliche Beträge für Zeiträume, für die es in der App noch keine Belege gibt."}
              </span>
            </div>

            {[
              ["sbaw", "Sonstige betriebliche Aufwendungen"],
              ["wareneinkauf", "Wareneinkauf"],
              ["foerderung", "Förderungen und Zuschüsse"],
              ["sonstiger_ertrag", "Sonstige Erträge"],
              ["zinsertrag", "Zinserträge"],
            ].map(([bereich, titel]) => {
              const kats = kategorienJeBereich.get(bereich) || [];
              return (
                <div key={bereich} className="kb-panel">
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                    <span className="text-sm font-bold">{titel} — {jahr}</span>
                    <button type="button" className="kb-btn h-8 px-3 text-xs" onClick={() => neueKategorie(bereich)}>
                      <Plus className="h-3.5 w-3.5 text-kb-green" /> Kategorie
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                          <th className="w-44 px-2 py-2 font-semibold">Kategorie</th>
                          <th className="w-48 px-2 py-2 font-semibold">Detail</th>
                          {MONATSNAMEN.map((m) => <th key={m} className="px-1 py-2 text-right font-semibold">{m.slice(0, 3)}</th>)}
                          <th className="w-24 px-2 py-2 text-right font-semibold">Jahr</th>
                          <th className="w-9 px-1 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {kats.length === 0 && (
                          <tr><td colSpan={15} className="px-3 py-4 text-center text-muted-foreground">
                            Noch keine Kategorie — oben rechts anlegen.
                          </td></tr>
                        )}
                        {kats.map((k) => {
                          const feld = kostenAnsicht === "soll" ? "soll" : "ist";
                          const jahresWert = MONATSNAMEN.reduce((s, _, i) =>
                            s + ((wertMap.get(`${k.id}|${jahr}|${i + 1}`) as any)?.[feld] || 0), 0);
                          return (
                            <tr key={k.id} className="border-b last:border-b-0">
                              <td className="px-2 py-1">
                                <TextZelle
                                  wert={k.kategorie}
                                  onCommit={(v) => v && aendereKategorie(k.id, { kategorie: v })}
                                  className="font-medium"
                                />
                                {k.ist_zinsaufwand && <span className="ml-1 text-[10px] text-muted-foreground">(Zinsen)</span>}
                              </td>
                              <td className="px-2 py-1">
                                <TextZelle
                                  wert={k.detail || ""}
                                  onCommit={(v) => aendereKategorie(k.id, { detail: v || null })}
                                  className="text-muted-foreground"
                                />
                              </td>
                              {MONATSNAMEN.map((_, i) => (
                                <td key={i} className="px-0.5 py-1">
                                  <BetragZelle
                                    wert={(wertMap.get(`${k.id}|${jahr}|${i + 1}`) as any)?.[feld] ?? null}
                                    onCommit={(n) => setzeWert(k.id, jahr, i + 1, kostenAnsicht, n)}
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-1 text-right font-semibold tabular-nums">{eur(jahresWert)}</td>
                              <td className="px-1 py-1">
                                <button
                                  type="button"
                                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  title="Kategorie entfernen"
                                  onClick={() => loescheKategorie(k.id, k.kategorie)}
                                ><Trash2 className="h-3.5 w-3.5" /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================= PERSONAL ================= */}
        {tab === "personal" && (
          <div className="kb-panel mt-3">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="text-sm font-bold">Personalkosten {jahr}</span>
              <button type="button" className="kb-btn h-8 px-3 text-xs" onClick={neuePersonalZeile}>
                <Plus className="h-3.5 w-3.5 text-kb-green" /> Mitarbeiter
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="w-44 px-2 py-2 font-semibold">Mitarbeiter</th>
                    <th className="w-16 px-2 py-2 font-semibold">Wert</th>
                    {MONATSNAMEN.map((m) => <th key={m} className="px-1 py-2 text-right font-semibold">{m.slice(0, 3)}</th>)}
                    <th className="w-24 px-2 py-2 text-right font-semibold">Jahr</th>
                    <th className="w-9 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {personalNamen.length === 0 && (
                    <tr><td colSpan={16} className="px-3 py-4 text-center text-muted-foreground">
                      Noch kein Mitarbeiter erfasst — oben rechts anlegen.
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
                      <td className="px-1 py-1" rowSpan={2}>
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Mitarbeiter aus der Planung entfernen"
                          onClick={() => loeschePersonal(name)}
                        ><Trash2 className="h-3.5 w-3.5" /></button>
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
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <span className="text-sm font-bold">Kredite</span>
                <button type="button" className="kb-btn h-8 px-3 text-xs" onClick={neuerKredit}>
                  <Plus className="h-3.5 w-3.5 text-kb-green" /> Kredit
                </button>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Bezeichnung</th>
                    <th className="px-2 py-2 font-semibold">Bank</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">Kreditbetrag</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Rate/Monat</th>
                    <th className="w-28 px-2 py-2 font-semibold">Beginn</th>
                    <th className="w-20 px-2 py-2 text-right font-semibold">Jahr</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Laufzeit</th>
                    <th className="w-20 px-2 py-2 text-center font-semibold">Neue Linie</th>
                    <th className="w-9 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fp.kredite.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                      Noch kein Kredit erfasst — oben rechts anlegen.
                    </td></tr>
                  )}
                  {fp.kredite.map((k) => (
                    <tr key={k.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1"><TextZelle wert={k.name} onCommit={(v) => v && aendereKredit(k.id, { name: v })} /></td>
                      <td className="px-2 py-1"><TextZelle wert={k.bank || ""} platzhalter="Bank" onCommit={(v) => aendereKredit(k.id, { bank: v || null })} /></td>
                      <td className="px-2 py-1"><BetragZelle wert={k.kreditbetrag} onCommit={(n) => aendereKredit(k.id, { kreditbetrag: n })} /></td>
                      <td className="px-2 py-1"><BetragZelle wert={k.rate_monatlich} onCommit={(n) => aendereKredit(k.id, { rate_monatlich: n ?? 0 })} /></td>
                      <td className="px-2 py-1"><MonatWahl wert={k.start_monat} onCommit={(n) => aendereKredit(k.id, { start_monat: n })} /></td>
                      <td className="px-2 py-1"><BetragZelle wert={k.start_jahr} onCommit={(n) => aendereKredit(k.id, { start_jahr: n })} /></td>
                      <td className="px-2 py-1"><BetragZelle wert={k.laufzeit_monate} onCommit={(n) => aendereKredit(k.id, { laufzeit_monate: n })} /></td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          title="Geplante neue Kreditlinie — zählt als Zufluss in der Liquidität"
                          checked={!!k.ist_neue_linie}
                          onChange={(e) => aendereKredit(k.id, { ist_neue_linie: e.target.checked })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Kredit entfernen"
                          onClick={() => loescheKredit(k.id, k.name)}
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="border-t px-3 py-2 text-right text-xs font-bold">
                Kreditraten {jahr}: {eur(jahresSumme(fp.reihen.kreditRaten, jahr, fp.basisJahr))} €
              </div>
            </div>

            <div className="kb-panel">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <span className="text-sm font-bold">Investitionen und Abschreibung</span>
                <button type="button" className="kb-btn h-8 px-3 text-xs" onClick={neueAnschaffung}>
                  <Plus className="h-3.5 w-3.5 text-kb-green" /> Anschaffung
                </button>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Bezeichnung</th>
                    <th className="px-2 py-2 font-semibold">AfA-Position (Katalog)</th>
                    <th className="w-16 px-2 py-2 text-right font-semibold">ND</th>
                    <th className="w-28 px-2 py-2 font-semibold">Monat</th>
                    <th className="w-20 px-2 py-2 text-right font-semibold">Jahr</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Plan</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Ist</th>
                    <th className="w-16 px-2 py-2 text-center font-semibold">GWG</th>
                    <th className="w-9 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fp.anschaffungen.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                      Noch keine Investition erfasst — oben rechts anlegen.
                    </td></tr>
                  )}
                  {fp.anschaffungen.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1"><TextZelle wert={a.bezeichnung} onCommit={(v) => v && aendereAnschaffung(a.id, { bezeichnung: v })} /></td>
                      <td className="px-2 py-1">
                        {/* Auswahl aus dem AfA-Katalog: setzt die Nutzungsdauer gleich mit. */}
                        <input
                          className="kb-input h-8 w-full min-h-0 px-1 py-0 text-xs"
                          list="afa-katalog"
                          defaultValue={a.afa_text || ""}
                          placeholder="z.B. Abrichtmaschinen"
                          onBlur={(e) => {
                            const text = e.target.value.trim();
                            if (text === (a.afa_text || "")) return;
                            const treffer = fp.afaSaetze.find(
                              (x) => x.anlagenbeschreibung.toLowerCase() === text.toLowerCase());
                            aendereAnschaffung(a.id, {
                              afa_text: text || null,
                              ...(treffer ? { nutzungsdauer: treffer.nutzungsdauer } : {}),
                            });
                          }}
                        />
                      </td>
                      <td className="px-2 py-1"><BetragZelle wert={a.nutzungsdauer} onCommit={(n) => aendereAnschaffung(a.id, { nutzungsdauer: n })} /></td>
                      <td className="px-2 py-1"><MonatWahl wert={a.monat} onCommit={(n) => aendereAnschaffung(a.id, { monat: n })} /></td>
                      <td className="px-2 py-1"><BetragZelle wert={a.jahr} onCommit={(n) => n && aendereAnschaffung(a.id, { jahr: n })} /></td>
                      <td className="px-2 py-1"><BetragZelle wert={a.betrag_soll} onCommit={(n) => aendereAnschaffung(a.id, { betrag_soll: n })} /></td>
                      <td className="px-2 py-1"><BetragZelle wert={a.betrag_ist} onCommit={(n) => aendereAnschaffung(a.id, { betrag_ist: n })} /></td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          title="Geringwertiges Wirtschaftsgut — sofort voll abgeschrieben"
                          checked={!!a.ist_gwg}
                          onChange={(e) => aendereAnschaffung(a.id, { ist_gwg: e.target.checked })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Anschaffung entfernen"
                          onClick={() => loescheAnschaffung(a.id, a.bezeichnung)}
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <datalist id="afa-katalog">
                {fp.afaSaetze.map((x) => (
                  <option key={x.id} value={x.anlagenbeschreibung}>{x.nutzungsdauer} Jahre</option>
                ))}
              </datalist>
              {guv && (
                <div className="border-t px-3 py-2 text-right text-xs font-bold">
                  Abschreibung {jahr}: {eur(guv.soll.zeilen.find((z) => z.label === "Abschreibung gesamt")?.betrag ?? 0)} €
                </div>
              )}
            </div>
          </div>
        )}
        {/* ================= EINSTELLUNGEN ================= */}
        {tab === "einstellungen" && (
          <div className="mt-3 space-y-3">
            <div className="kb-panel">
              <div className="border-b px-4 py-2.5 text-sm font-bold">Liquiditäts-Startwerte</div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ["finanz_liq_bargeld", "Bargeld"],
                  ["finanz_liq_konto", "Konto"],
                  ["finanz_liq_kreditlinien", "Freie Kreditlinien"],
                  ["finanz_liq_warnschwelle", "Warnschwelle"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">{label} (€)</span>
                    <BetragZelle
                      wert={Number(fp.settings[key]) || 0}
                      onCommit={(n) => setzeEinstellung(key, String(n ?? 0))}
                    />
                  </label>
                ))}
              </div>
              <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                Bargeld, Konto und freie Kreditlinien bilden den Anfangsbestand der
                Liquiditätsrechnung. Fällt der Endbestand unter die Warnschwelle, wird der
                Monat rot markiert.
              </div>
            </div>

            <div className="kb-panel">
              <div className="border-b px-4 py-2.5 text-sm font-bold">Planungszeitraum</div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="mb-0.5 block text-muted-foreground">Erstes Planjahr</span>
                  <BetragZelle
                    wert={fp.basisJahr}
                    onCommit={(n) => n && setzeEinstellung("finanz_basisjahr", String(Math.round(n)))}
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-0.5 block text-muted-foreground">Anzahl Planjahre</span>
                  <BetragZelle
                    wert={fp.planJahre}
                    onCommit={(n) => n && setzeEinstellung("finanz_planjahre", String(Math.round(n)))}
                  />
                </label>
              </div>
            </div>

            <div className="kb-panel">
              <div className="border-b px-4 py-2.5 text-sm font-bold">Zahlungsstaffel</div>
              <p className="px-4 pt-3 text-xs text-muted-foreground">
                Legt fest, wann das Geld eines Auftrags eingeht: Anzahlung im Startmonat,
                Schlusszahlung im Endmonat, die Teilrechnungen gleichmäßig dazwischen.
                Diese Werte stammen aus der Planrechnung — bitte prüfen, ob sie noch gelten.
              </p>
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-1 font-semibold">Auftragswert</th>
                      <th className="w-28 px-2 py-1 text-right font-semibold">Anzahlung %</th>
                      <th className="w-28 px-2 py-1 text-right font-semibold">Teilrechnungen</th>
                      <th className="w-28 px-2 py-1 text-right font-semibold">Schluss %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fp.staffel.map((band, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-2 py-1">
                          {band.bis === null ? `über ${eur(fp.staffel[i - 1]?.bis ?? 0)} €` : `bis ${eur(band.bis)} €`}
                        </td>
                        {(["anzahlung", "teilzahlungen", "schluss"] as const).map((feld) => (
                          <td key={feld} className="px-2 py-1">
                            <BetragZelle
                              wert={band[feld]}
                              onCommit={(n) => {
                                const neu = fp.staffel.map((b, k) => k === i ? { ...b, [feld]: n ?? 0 } : b);
                                setzeEinstellung("finanz_zahlungsstaffel", JSON.stringify(neu));
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="kb-panel">
              <div className="border-b px-4 py-2.5 text-sm font-bold">Steuer</div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="mb-0.5 block text-muted-foreground">Körperschaftsteuer (%)</span>
                  <BetragZelle
                    wert={Number(fp.settings.finanz_koest_satz) || 23}
                    onCommit={(n) => setzeEinstellung("finanz_koest_satz", String(n ?? 23))}
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-0.5 block text-muted-foreground">Mindest-KÖSt (€)</span>
                  <BetragZelle
                    wert={Number(fp.settings.finanz_koest_mindest) || 500}
                    onCommit={(n) => setzeEinstellung("finanz_koest_mindest", String(n ?? 500))}
                  />
                </label>
              </div>
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
