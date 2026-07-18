// ============================================================================
// LackierungTab — Tab "Oberflächenbeschichtung" (Lohnlackierung):
// Übersicht + globale Extras (Sätze aus app_settings statt hartkodiert) +
// Lackier-Positions-Karten. Eigenständige Rechnung: kein Aufschlag/Skonto,
// fließt nicht in die Projektsumme von Tab 1 ein (wie beide Referenzen).
// ============================================================================
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  KalkulationState, PaintModule, PaintProjektErgebnis, LackSaetze,
  MAX_PAINT_MODULE, fmt, fmtEuro,
} from "@/lib/kalkulationEngine";
import { KatalogArtikel, KatalogKategorie } from "./useKalkKatalog";
import { NumInput } from "./NumInput";

interface Props {
  state: KalkulationState;
  paintProjekt: PaintProjektErgebnis;
  lackKategorien: KatalogKategorie[];
  aufpreise: KatalogArtikel[];
  saetze: LackSaetze;
  onPatchState: (patch: Partial<KalkulationState>) => void;
  onPatchPaint: (id: number, patch: Partial<PaintModule>) => void;
  onAddPaint: () => void;
  onRemovePaint: (id: number) => void;
}

export function LackierungTab({
  state, paintProjekt, lackKategorien, aufpreise, saetze,
  onPatchState, onPatchPaint, onAddPaint, onRemovePaint,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* Übersicht */}
        <div className="kb-panel overflow-x-auto">
          <div className="border-b px-4 py-2.5 text-sm font-bold">Projektübersicht Lohnlackierung</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Position</th>
                <th className="px-3 py-2 font-semibold">Produkt</th>
                <th className="px-3 py-2 text-right font-semibold">Menge</th>
                <th className="px-3 py-2 text-right font-semibold">Preis/EH</th>
                <th className="px-3 py-2 text-right font-semibold">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {paintProjekt.positionen.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Noch keine Lackier-Position angelegt.</td></tr>
              )}
              {paintProjekt.positionen.map(({ pm, ergebnis }, i) => (
                <tr key={pm.id} className={`border-b last:border-b-0 ${pm.isOptional ? "italic text-muted-foreground" : ""}`}>
                  <td className="px-3 py-1.5">P.{i + 1} {pm.name}{pm.isOptional ? " (optional)" : ""}</td>
                  <td className="px-3 py-1.5">{pm.product} {pm.sides === "Kunde" ? "(Farbe beigestellt)" : `(${pm.sides})`}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(pm.area)} {pm.amountMode === "lfm" ? "lfm" : "m²"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtEuro(ergebnis.unitPrice)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtEuro(ergebnis.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-bold">
                <td className="px-3 py-2" colSpan={2}>Gesamt (Lackierung)</td>
                <td className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Extras: {fmtEuro(paintProjekt.extras.total)}</td>
                <td className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Material: {fmtEuro(paintProjekt.summeMaterial)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(paintProjekt.gesamt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Sonstige Kosten (globale Extras) */}
        <div className="kb-panel">
          <div className="border-b px-4 py-2.5 text-sm font-bold">Sonstige Kosten</div>
          <div className="space-y-2 p-3 text-xs">
            <label className="grid grid-cols-[1fr_90px_70px] items-center gap-2">
              <span>Farbwechsel (á {fmtEuro(saetze.farbwechsel)})</span>
              <NumInput value={state.paintColorChanges} onCommit={(n) => onPatchState({ paintColorChanges: n ?? 0 })} />
              <span className="text-right tabular-nums">{fmtEuro(paintProjekt.extras.farbwechsel)}</span>
            </label>
            <label className="grid grid-cols-[1fr_90px_70px] items-center gap-2">
              <span>Dimension / Farbton &gt;50mm (á {fmtEuro(saetze.dimension)})</span>
              <NumInput value={state.paintDimChanges} onCommit={(n) => onPatchState({ paintDimChanges: n ?? 0 })} />
              <span className="text-right tabular-nums">{fmtEuro(paintProjekt.extras.dimension)}</span>
            </label>
            <label className="grid grid-cols-[1fr_90px_70px] items-center gap-2">
              <span>Anfahrt PKW/Anhänger in km (á {fmtEuro(saetze.anfahrtKm)})</span>
              <NumInput value={state.paintDistance} onCommit={(n) => onPatchState({ paintDistance: n ?? 0 })} />
              <span className="text-right tabular-nums">{fmtEuro(paintProjekt.extras.anfahrt)}</span>
            </label>
            <label className="grid grid-cols-[1fr_90px_70px] items-center gap-2">
              <span>Fahrzeit Mitarbeiter in h (á {fmtEuro(saetze.fahrzeitH)})</span>
              <NumInput value={state.paintTravelHours} onCommit={(n) => onPatchState({ paintTravelHours: n ?? 0 })} />
              <span className="text-right tabular-nums">{fmtEuro(paintProjekt.extras.fahrzeit)}</span>
            </label>
            <div className="flex justify-between border-t pt-2 font-bold">
              <span>Summe Extras</span><span className="tabular-nums">{fmtEuro(paintProjekt.extras.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Positions-Karten */}
      {paintProjekt.positionen.map(({ pm, ergebnis }, i) => (
        <div key={pm.id} className={`kb-panel ${pm.isOptional ? "border-dashed opacity-80" : ""}`}>
          <div
            className="flex cursor-pointer select-none items-center gap-2 border-b px-3 py-2"
            onClick={() => onPatchPaint(pm.id, { collapsed: !pm.collapsed })}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kb-blue text-xs font-bold text-white">P.{i + 1}</span>
            <input
              className="kb-input h-8 min-h-0 max-w-xs flex-1 px-2 py-1 text-sm"
              value={pm.name}
              placeholder="Bezeichnung (z.B. Fassade Ost)"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onPatchPaint(pm.id, { name: e.target.value })}
            />
            <span className="flex-1" />
            <b className="text-sm tabular-nums">{fmtEuro(ergebnis.total)}</b>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${pm.collapsed ? "-rotate-90" : ""}`} />
          </div>

          {!pm.collapsed && (
            <>
              <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <label className="block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">Kategorie</span>
                    <select className="kb-input h-8 min-h-0 px-2 py-1 text-sm" value={pm.category}
                      onChange={(e) => onPatchPaint(pm.id, { category: e.target.value, product: "" })}>
                      <option value="">—</option>
                      {lackKategorien.map((k) => <option key={k.id} value={k.name}>{k.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">Produkt</span>
                    <select className="kb-input h-8 min-h-0 px-2 py-1 text-sm" value={pm.product} disabled={!pm.category}
                      onChange={(e) => onPatchPaint(pm.id, { product: e.target.value })}>
                      <option value="">—</option>
                      {(lackKategorien.find((k) => k.name === pm.category)?.artikel || []).map((a) => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs">
                      <span className="mb-0.5 block text-muted-foreground">Variante</span>
                      <select className="kb-input h-8 min-h-0 px-2 py-1 text-sm" value={pm.sides}
                        onChange={(e) => onPatchPaint(pm.id, { sides: e.target.value as PaintModule["sides"] })}>
                        <option value="3-seitig">3-seitig</option>
                        <option value="4-seitig">4-seitig (×{fmt(saetze.vierseitigFaktor)})</option>
                        <option value="Kunde">Farbe beigestellt (Kunde, {fmtEuro(saetze.kundeSatz)})</option>
                      </select>
                    </label>
                    <label className="block text-xs">
                      <span className="mb-0.5 block text-muted-foreground">Menge</span>
                      <div className="flex gap-1">
                        <NumInput value={pm.area} onCommit={(n) => onPatchPaint(pm.id, { area: n ?? 0 })} />
                        <select className="kb-input h-8 min-h-0 w-16 px-1 py-1 text-sm" value={pm.amountMode}
                          onChange={(e) => onPatchPaint(pm.id, { amountMode: e.target.value as PaintModule["amountMode"] })}>
                          <option value="qm">m²</option>
                          <option value="lfm">lfm</option>
                        </select>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">Auf-/Minderpreise (je Einheit)</div>
                  <div className="space-y-1">
                    {aufpreise.map((a) => (
                      <label key={a.id} className="flex cursor-pointer items-start gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={!!pm.surcharges[a.name]}
                          onChange={(e) => onPatchPaint(pm.id, { surcharges: { ...pm.surcharges, [a.name]: e.target.checked } })}
                        />
                        <span className="flex-1">{a.name}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtEuro(Number(a.vk) || 0)}</span>
                      </label>
                    ))}
                    {aufpreise.length === 0 && <p className="text-xs text-muted-foreground">Keine Aufpreise im Katalog.</p>}
                  </div>
                </div>

                <div className="rounded border bg-[#F0F7EC] p-3 text-sm">
                  <div className="flex justify-between py-0.5"><span>Grundpreis</span><b className="tabular-nums">{fmtEuro(ergebnis.basePrice)}</b></div>
                  <div className="flex justify-between py-0.5"><span>Aufpreise</span><b className="tabular-nums">{fmtEuro(ergebnis.surchargesSum)}</b></div>
                  <div className="mt-1 flex justify-between border-t pt-1"><span className="font-bold">Preis / Einheit</span><b className="tabular-nums">{fmtEuro(ergebnis.unitPrice)}</b></div>
                  <div className="flex justify-between pt-1 text-base"><span className="font-bold">Gesamt</span><b className="tabular-nums">{fmtEuro(ergebnis.total)}</b></div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t bg-muted/20 px-3 py-2">
                <span className="flex-1" />
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={pm.isOptional} onChange={(e) => onPatchPaint(pm.id, { isOptional: e.target.checked })} />
                  optional
                </label>
                <button type="button" onClick={() => onRemovePaint(pm.id)} className="kb-btn h-7 min-h-0 px-2 py-1 text-xs text-destructive">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" /> Entfernen
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={onAddPaint}
        disabled={paintProjekt.positionen.length >= MAX_PAINT_MODULE}
        className="kb-btn"
        title={paintProjekt.positionen.length >= MAX_PAINT_MODULE ? `Maximal ${MAX_PAINT_MODULE} Positionen` : undefined}
      >
        <Plus className="h-4 w-4 text-kb-green" /> Lackier-Position hinzufügen
      </button>
    </div>
  );
}
