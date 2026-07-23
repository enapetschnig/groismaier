import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AdjustLine,
  AdjustResult,
  adjustByAmount,
  adjustByPercent,
  adjustToTarget,
  applyAiPrices,
  r2,
} from "@/lib/priceAdjust";
import { Percent, Euro, Sparkles, RotateCcw, AlertTriangle, Loader2, Info } from "lucide-react";

/**
 * Preise anpassen — Rabatt/Aufschlag auf ausgewählte Positionen oder
 * KI-gestützte Verteilung einer Ziel-Differenz.
 *
 * Der Dialog verändert nichts selbst: er liefert über `onApply` neue
 * Einzelpreise je Positionsindex zurück. Das Neuberechnen der Gesamtpreise
 * und der Belegsummen bleibt in InvoiceDetail.
 */

interface PriceAdjustDialogProps {
  open: boolean;
  onClose: () => void;
  /** Alle preisrelevanten Positionen des Belegs. */
  lines: AdjustLine[];
  /** MwSt-Satz für die Brutto-Vorschau (0 bei Reverse Charge). */
  mwstSatz: number;
  /**
   * Global-Rabatt des Belegs (Prozent) — wirkt auf die Positions-Netto-Summe.
   * Ohne diese Angabe zeigte der Dialog eine zu hohe Belegsumme/Brutto an.
   */
  rabattProzent?: number;
  /** Global-Rabatt des Belegs als Fixbetrag € (greift nur, wenn Prozent = 0). */
  rabattBetrag?: number;
  /**
   * Bereits als BRUTTO verrechnete, MwSt-freie Zeilen (Anzahlungs-Abzüge).
   * Sie sind nicht Teil von `lines`, gehören aber in die Brutto-Vorschau.
   */
  exemptBrutto?: number;
  /**
   * Übernimmt die neuen Einzelpreise: Map Positionsindex → neuer Einzelpreis.
   * InvoiceDetail rechnet damit Gesamtpreise + Summen neu und setzt isDirty.
   */
  onApply: (neuePreise: Record<number, number>) => void;
}

type Modus = "manuell" | "ki";
type Einheit = "prozent" | "betrag";
type KiZielArt = "delta_betrag" | "delta_prozent" | "zielsumme";

const fmt = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Vorzeichenbehaftete Anzeige einer Differenz. */
const fmtDelta = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));

export function PriceAdjustDialog({
  open,
  onClose,
  lines,
  mwstSatz,
  rabattProzent = 0,
  rabattBetrag = 0,
  exemptBrutto = 0,
  onApply,
}: PriceAdjustDialogProps) {
  const { toast } = useToast();

  const [modus, setModus] = useState<Modus>("manuell");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Modus 1 — Rabatt / Aufschlag
  const [einheit, setEinheit] = useState<Einheit>("prozent");
  const [wertInput, setWertInput] = useState("");

  // Modus 2 — KI
  const [kiZielArt, setKiZielArt] = useState<KiZielArt>("delta_betrag");
  const [kiZielInput, setKiZielInput] = useState("");
  const [kiHinweis, setKiHinweis] = useState("");
  const [kiLoading, setKiLoading] = useState(false);
  const [kiResult, setKiResult] = useState<AdjustResult | null>(null);
  const [kiBegruendung, setKiBegruendung] = useState("");
  const [kiFallback, setKiFallback] = useState(false);

  // Beim Öffnen zurücksetzen: alle Positionen ausgewählt.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(lines.map(l => l.index)));
    setModus("manuell");
    setEinheit("prozent");
    setWertInput("");
    setKiZielArt("delta_betrag");
    setKiZielInput("");
    setKiHinweis("");
    setKiResult(null);
    setKiBegruendung("");
    setKiFallback(false);
    setKiLoading(false);
    // lines bewusst nicht in den Deps: die Auswahl soll beim Tippen im
    // Beleg-Editor nicht zurückspringen, nur beim Öffnen initialisiert werden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedLines = useMemo(
    () => lines.filter(l => selected.has(l.index)),
    [lines, selected]
  );

  /** Summe ALLER Positionen (auch der nicht ausgewählten) — die Belegsumme. */
  const belegSummeAlt = useMemo(
    () => r2(lines.reduce((s, l) => s + (Number(l.gesamtpreis) || 0), 0)),
    [lines]
  );
  const auswahlSummeAlt = useMemo(
    () => r2(selectedLines.reduce((s, l) => s + (Number(l.gesamtpreis) || 0), 0)),
    [selectedLines]
  );

  const wert = useMemo(() => {
    const n = Number(String(wertInput).replace(",", "."));
    return isFinite(n) ? n : 0;
  }, [wertInput]);

  const kiZielWert = useMemo(() => {
    const n = Number(String(kiZielInput).replace(",", "."));
    return isFinite(n) ? n : 0;
  }, [kiZielInput]);

  // ── Vorschau Modus 1 ──────────────────────────────────────────────────────
  const manuellResult = useMemo<AdjustResult | null>(() => {
    if (selectedLines.length === 0 || !wertInput.trim() || wert === 0) return null;
    return einheit === "prozent"
      ? adjustByPercent(selectedLines, wert)
      : adjustByAmount(selectedLines, wert);
  }, [selectedLines, einheit, wert, wertInput]);

  const aktivesResult = modus === "ki" ? kiResult : manuellResult;

  const belegSummeNeu = useMemo(() => {
    if (!aktivesResult) return belegSummeAlt;
    return r2(belegSummeAlt - aktivesResult.summeAlt + aktivesResult.summeNeu);
  }, [aktivesResult, belegSummeAlt]);

  /**
   * Global-Rabatt des Belegs — exakt die Formel aus InvoiceDetail:
   * Prozent hat Vorrang, sonst der Fixbetrag. Ohne diese Berücksichtigung
   * zeigte der Dialog die Belegsumme und den Bruttobetrag zu hoch an.
   */
  const rabattP = Number(rabattProzent) || 0;
  const rabattB = Number(rabattBetrag) || 0;
  const rabattAlt = r2(rabattP > 0 ? belegSummeAlt * (rabattP / 100) : rabattB);
  const rabattNeu = r2(rabattP > 0 ? belegSummeNeu * (rabattP / 100) : rabattB);
  const hatGlobalRabatt = rabattAlt !== 0 || rabattNeu !== 0;

  /** Netto NACH Global-Rabatt — das ist die Netto-Summe des Belegs. */
  const nettoAlt = useMemo(() => r2(belegSummeAlt - rabattAlt), [belegSummeAlt, rabattAlt]);
  const nettoNeu = useMemo(() => r2(belegSummeNeu - rabattNeu), [belegSummeNeu, rabattNeu]);

  const bruttoAlt = useMemo(
    () =>
      r2(
        nettoAlt * (1 + (Number(mwstSatz) || 0) / 100) + (Number(exemptBrutto) || 0)
      ),
    [nettoAlt, mwstSatz, exemptBrutto]
  );
  const bruttoNeu = useMemo(
    () =>
      r2(
        nettoNeu * (1 + (Number(mwstSatz) || 0) / 100) + (Number(exemptBrutto) || 0)
      ),
    [nettoNeu, mwstSatz, exemptBrutto]
  );

  // ── Auswahl ───────────────────────────────────────────────────────────────
  const alleAusgewaehlt = lines.length > 0 && selected.size === lines.length;

  const toggleAlle = () => {
    setSelected(alleAusgewaehlt ? new Set() : new Set(lines.map(l => l.index)));
    setKiResult(null);
  };

  const toggleOne = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setKiResult(null);
  };

  // ── KI-Ziel in eine absolute Zielsumme übersetzen ─────────────────────────
  const kiZielSumme = useMemo(() => {
    if (kiZielArt === "zielsumme") return r2(kiZielWert);
    if (kiZielArt === "delta_prozent") return r2(auswahlSummeAlt * (1 + kiZielWert / 100));
    return r2(auswahlSummeAlt + kiZielWert);
  }, [kiZielArt, kiZielWert, auswahlSummeAlt]);

  const kiZielValide =
    selectedLines.length > 0 &&
    kiZielInput.trim() !== "" &&
    isFinite(kiZielSumme) &&
    kiZielSumme >= 0 &&
    r2(kiZielSumme - auswahlSummeAlt) !== 0;

  /** Proportionaler Fallback, wenn die KI nicht verfügbar ist. */
  const fallbackVerteilen = (grund: string) => {
    const res = adjustToTarget(selectedLines, kiZielSumme);
    setKiResult(res);
    setKiFallback(true);
    setKiBegruendung(
      `KI nicht verfügbar — proportional verteilt. Die Differenz von ` +
        `${fmtDelta(r2(kiZielSumme - auswahlSummeAlt))} € wurde im Verhältnis zum ` +
        `bisherigen Positionswert auf die ${selectedLines.length} ausgewählten ` +
        `Positionen aufgeteilt.` + (grund ? ` (${grund})` : "")
    );
  };

  const kiAnfragen = async () => {
    if (!kiZielValide) return;
    setKiLoading(true);
    setKiResult(null);
    setKiBegruendung("");
    setKiFallback(false);

    try {
      const { data, error } = await supabase.functions.invoke("adjust-invoice-prices", {
        body: {
          positionen: selectedLines.map(l => ({
            index: l.index,
            beschreibung: l.beschreibung,
            menge: l.menge,
            einheit: l.einheit,
            einzelpreis: l.einzelpreis,
            gesamtpreis: l.gesamtpreis,
          })),
          ziel_summe_netto: kiZielSumme,
          hinweis: kiHinweis.trim() || undefined,
        },
      });

      if (error) throw new Error(error.message || "Function nicht erreichbar");
      if (!data?.success || !Array.isArray(data?.positionen)) {
        throw new Error(data?.error || "Unerwartete Antwort");
      }

      const preise: Record<number, number> = {};
      for (const p of data.positionen) {
        const idx = Number(p?.index);
        const preis = Number(p?.neuer_einzelpreis);
        if (Number.isInteger(idx) && isFinite(preis) && preis >= 0) preise[idx] = preis;
      }
      if (Object.keys(preise).length !== selectedLines.length) {
        throw new Error("Unvollständige KI-Antwort");
      }

      // Runden + Zielsumme centgenau nachziehen.
      const res = applyAiPrices(selectedLines, preise, kiZielSumme);
      setKiResult(res);
      setKiFallback(false);
      setKiBegruendung(String(data.begruendung || "").trim());
    } catch (err: any) {
      // Feature muss auch ohne KI funktionieren.
      console.warn("adjust-invoice-prices fehlgeschlagen:", err);
      fallbackVerteilen(err?.message ? String(err.message).slice(0, 160) : "");
    } finally {
      setKiLoading(false);
    }
  };

  const uebernehmen = () => {
    if (!aktivesResult || aktivesResult.lines.length === 0) return;
    const preise: Record<number, number> = {};
    for (const l of aktivesResult.lines) preise[l.index] = l.einzelpreisNeu;
    onApply(preise);

    const diff = r2(aktivesResult.summeNeu - aktivesResult.summeAlt);
    toast({
      title: "Preise angepasst",
      description:
        `${aktivesResult.lines.length} Position(en) geändert — ` +
        `Netto ${fmtDelta(diff)} € auf ${fmt(nettoNeu)} € (Belegsumme).`,
    });
    onClose();
  };

  const zuruecksetzen = () => {
    setWertInput("");
    setKiZielInput("");
    setKiHinweis("");
    setKiResult(null);
    setKiBegruendung("");
    setKiFallback(false);
    setSelected(new Set(lines.map(l => l.index)));
  };

  const geaenderteZeilen = aktivesResult
    ? aktivesResult.lines.filter(l => l.gesamtNeu !== l.gesamtAlt || l.einzelpreisNeu !== l.einzelpreisAlt)
    : [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      {/* Am Handy darf der Dialog nicht breiter als der Bildschirm werden:
          DialogContent ist ein CSS-Grid, dessen Spalte sonst auf die
          max-content-Breite der Inhalte wächst (Kopftext, Positionszeilen) —
          dann muss man im Dialog seitwärts scrollen und findet „Übernehmen"
          nicht mehr. Feste Breite + min-w-0 auf den Grid-Kindern verhindert das. */}
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-4xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Preise anpassen
          </DialogTitle>
          <DialogDescription>
            Rabatt oder Aufschlag auf ausgewählte Positionen — wahlweise in Prozent
            oder als Betrag. Oder die KI die Differenz sinnvoll verteilen lassen.
          </DialogDescription>
        </DialogHeader>

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Keine preisrelevanten Positionen vorhanden.
          </p>
        ) : (
          <div className="space-y-4">
            {/* ── Positions-Auswahl ─────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Positionen auswählen</Label>
                <Button variant="ghost" size="sm" onClick={toggleAlle} className="h-9 px-3 text-xs sm:h-7">
                  {alleAusgewaehlt ? "Keine" : "Alle"}
                </Button>
              </div>
              <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                {lines.map(l => {
                  const aktiv = selected.has(l.index);
                  return (
                    <label
                      key={l.index}
                      className={`flex min-h-[44px] items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 sm:min-h-0 ${
                        aktiv ? "" : "opacity-55"
                      }`}
                    >
                      <Checkbox checked={aktiv} onCheckedChange={() => toggleOne(l.index)} />
                      <span className="text-xs text-muted-foreground w-7 shrink-0">
                        {l.index + 1}.
                      </span>
                      <span className="flex-1 text-sm truncate">
                        {l.beschreibung?.trim() || <em className="text-muted-foreground">(ohne Beschreibung)</em>}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                        {l.menge} {l.einheit}
                      </span>
                      <span className="text-sm tabular-nums font-medium shrink-0 w-24 text-right">
                        € {fmt(Number(l.gesamtpreis) || 0)}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {selected.size} von {lines.length} ausgewählt — Auswahl netto{" "}
                <strong>€ {fmt(auswahlSummeAlt)}</strong>
              </p>
            </div>

            <Separator />

            {/* ── Modus ─────────────────────────────────────────────────── */}
            <Tabs value={modus} onValueChange={v => setModus(v as Modus)}>
              <TabsList className="grid h-auto w-full grid-cols-2">
                <TabsTrigger value="manuell" className="gap-1.5 py-2.5 sm:py-1.5">
                  <Percent className="w-4 h-4" />
                  Rabatt / Aufschlag
                </TabsTrigger>
                <TabsTrigger value="ki" className="gap-1.5 py-2.5 sm:py-1.5">
                  <Sparkles className="w-4 h-4" />
                  KI-Anpassung
                </TabsTrigger>
              </TabsList>

              {/* ── Modus 1 ─────────────────────────────────────────────── */}
              <TabsContent value="manuell" className="space-y-3 pt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex rounded-md border overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setEinheit("prozent")}
                      className={`px-3 py-2 text-sm flex items-center gap-1 ${
                        einheit === "prozent" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <Percent className="w-3.5 h-3.5" /> Prozent
                    </button>
                    <button
                      type="button"
                      onClick={() => setEinheit("betrag")}
                      className={`px-3 py-2 text-sm flex items-center gap-1 border-l ${
                        einheit === "betrag" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <Euro className="w-3.5 h-3.5" /> Betrag
                    </button>
                  </div>
                  <div className="flex-1 min-w-[10rem]">
                    <Label htmlFor="pa-wert" className="text-xs">
                      {einheit === "prozent" ? "Prozent (− = Nachlass)" : "Betrag € netto (− = Nachlass)"}
                    </Label>
                    <Input
                      id="pa-wert"
                      type="text"
                      inputMode="decimal"
                      value={wertInput}
                      onChange={e => setWertInput(e.target.value)}
                      placeholder={einheit === "prozent" ? "z.B. -3 oder 5" : "z.B. -1500 oder 20000"}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(einheit === "prozent"
                    ? ["-3", "-5", "-10", "5", "10"]
                    : ["-1000", "-500", "500", "1000", "20000"]
                  ).map(v => (
                    <Button
                      key={v}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs tabular-nums sm:h-7"
                      onClick={() => setWertInput(v)}
                    >
                      {Number(v) > 0 ? "+" : ""}
                      {v}
                      {einheit === "prozent" ? " %" : " €"}
                    </Button>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {einheit === "prozent"
                    ? "Der Prozentsatz wirkt auf den Einzelpreis jeder ausgewählten Position."
                    : "Der Betrag wird proportional zum Positionswert verteilt — die neue Summe der Auswahl stimmt centgenau."}
                </p>
              </TabsContent>

              {/* ── Modus 2 ─────────────────────────────────────────────── */}
              <TabsContent value="ki" className="space-y-3 pt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex rounded-md border overflow-hidden shrink-0 text-sm">
                    {([
                      ["delta_betrag", "± €"],
                      ["delta_prozent", "± %"],
                      ["zielsumme", "Zielsumme"],
                    ] as [KiZielArt, string][]).map(([key, label], i) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setKiZielArt(key); setKiResult(null); }}
                        className={`px-3 py-2 ${i > 0 ? "border-l" : ""} ${
                          kiZielArt === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-w-[10rem]">
                    <Label htmlFor="pa-ki-ziel" className="text-xs">
                      {kiZielArt === "zielsumme"
                        ? "Zielsumme netto €"
                        : kiZielArt === "delta_prozent"
                        ? "Veränderung in %"
                        : "Veränderung in € netto"}
                    </Label>
                    <Input
                      id="pa-ki-ziel"
                      type="text"
                      inputMode="decimal"
                      value={kiZielInput}
                      onChange={e => { setKiZielInput(e.target.value); setKiResult(null); }}
                      placeholder={
                        kiZielArt === "zielsumme"
                          ? "z.B. 85000"
                          : kiZielArt === "delta_prozent"
                          ? "z.B. 8 oder -5"
                          : "z.B. 20000 oder -10000"
                      }
                      className="h-10"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="pa-ki-hinweis" className="text-xs">
                    Hinweis an die KI (optional)
                  </Label>
                  <Textarea
                    id="pa-ki-hinweis"
                    value={kiHinweis}
                    onChange={e => { setKiHinweis(e.target.value); setKiResult(null); }}
                    placeholder="z.B. Montage nicht anfassen, eher beim Material aufschlagen. Runde Preise bevorzugen."
                    rows={2}
                    className="resize-none"
                  />
                </div>

                {kiZielValide && (
                  <p className="text-xs text-muted-foreground">
                    Ziel: Auswahl von <strong>€ {fmt(auswahlSummeAlt)}</strong> auf{" "}
                    <strong>€ {fmt(kiZielSumme)}</strong> netto (
                    {fmtDelta(r2(kiZielSumme - auswahlSummeAlt))} €)
                  </p>
                )}

                <Button
                  type="button"
                  onClick={kiAnfragen}
                  disabled={!kiZielValide || kiLoading}
                  className="gap-1.5"
                >
                  {kiLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {kiLoading ? "KI rechnet…" : "Vorschlag berechnen"}
                </Button>

                {kiBegruendung && (
                  <div
                    className={`rounded-md border px-3 py-2.5 text-sm flex items-start gap-2 ${
                      kiFallback
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-blue-200 bg-blue-50 text-blue-900"
                    }`}
                  >
                    {kiFallback ? (
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <p className="flex-1">{kiBegruendung}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* ── Vorschau ──────────────────────────────────────────────── */}
            {aktivesResult && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Vorschau</Label>
                    {geaenderteZeilen.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {geaenderteZeilen.length} Position(en) geändert
                      </Badge>
                    )}
                  </div>

                  {aktivesResult.geklemmt && (
                    <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>
                        Der Nachlass ist größer als der Positionswert — betroffene Positionen
                        wurden auf € 0,00 begrenzt. Negative Preise werden nicht gesetzt.
                      </p>
                    </div>
                  )}
                  {aktivesResult.restdifferenz !== 0 && (
                    <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>
                        Restdifferenz von € {fmt(Math.abs(aktivesResult.restdifferenz))} — bei
                        diesen Mengen lässt sich die Zielsumme mit zwei Nachkommastellen im
                        Einzelpreis nicht exakt treffen.
                      </p>
                    </div>
                  )}

                  <div className="border rounded-md overflow-x-auto max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-10">Pos.</TableHead>
                          <TableHead>Beschreibung</TableHead>
                          <TableHead className="text-right w-28">bisher</TableHead>
                          <TableHead className="text-right w-28">neu</TableHead>
                          <TableHead className="text-right w-28">Differenz</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aktivesResult.lines.map(l => {
                          const src = lines.find(x => x.index === l.index);
                          const diff = r2(l.gesamtNeu - l.gesamtAlt);
                          return (
                            <TableRow key={l.index}>
                              <TableCell className="text-xs text-muted-foreground">
                                {l.index + 1}
                              </TableCell>
                              <TableCell className="text-sm max-w-[16rem] truncate">
                                {src?.beschreibung?.trim() || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                                {fmt(l.gesamtAlt)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm font-medium">
                                {fmt(l.gesamtNeu)}
                              </TableCell>
                              <TableCell
                                className={`text-right tabular-nums text-sm ${
                                  diff > 0 ? "text-emerald-700" : diff < 0 ? "text-red-600" : "text-muted-foreground"
                                }`}
                              >
                                {diff === 0 ? "—" : fmtDelta(diff)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-3 rounded-md bg-muted/60 px-3 py-2.5 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Auswahl netto</span>
                      <span className="tabular-nums">
                        € {fmt(aktivesResult.summeAlt)} → <strong>€ {fmt(aktivesResult.summeNeu)}</strong>
                      </span>
                    </div>
                    <div className={`flex justify-between ${hatGlobalRabatt ? "text-muted-foreground" : "font-medium"}`}>
                      <span>Positionen netto</span>
                      <span className="tabular-nums">
                        € {fmt(belegSummeAlt)} → <strong>€ {fmt(belegSummeNeu)}</strong>
                      </span>
                    </div>
                    {hatGlobalRabatt && (
                      <div className="flex justify-between text-orange-600">
                        <span>
                          Beleg-Rabatt
                          {(Number(rabattProzent) || 0) > 0 ? ` (${Number(rabattProzent)}%)` : ""}
                        </span>
                        <span className="tabular-nums">
                          − € {fmt(rabattAlt)} → <strong>− € {fmt(rabattNeu)}</strong>
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium">
                      <span>Belegsumme netto</span>
                      <span className="tabular-nums">
                        € {fmt(nettoAlt)} → <strong>€ {fmt(nettoNeu)}</strong>
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                      <span>
                        Belegsumme brutto
                        <span className="font-normal text-muted-foreground">
                          {" "}(inkl. {Number(mwstSatz) || 0} % MwSt
                          {(Number(exemptBrutto) || 0) !== 0 ? ", inkl. Anzahlungs-Abzug" : ""})
                        </span>
                      </span>
                      <span className="tabular-nums">
                        € {fmt(bruttoAlt)} → <strong>€ {fmt(bruttoNeu)}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={zuruecksetzen} className="gap-1.5 mr-auto">
            <RotateCcw className="w-4 h-4" />
            Zurücksetzen
          </Button>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={uebernehmen}
            disabled={!aktivesResult || geaenderteZeilen.length === 0}
          >
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
