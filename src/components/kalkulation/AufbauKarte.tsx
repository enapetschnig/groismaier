// ============================================================================
// AufbauKarte — eine einklappbare Aufbau-Karte des Tabs "Aufbau Kalkulation":
// Spalte A (Aufbau/Material inkl. MaterialTabelle), Spalte B (Arbeitszeit,
// Fahrten, Dienstleistungen), Spalte C (Zusammenfassung).
// Drag&Drop-Umsortierung, Klonen, optional-Flag wie im Original.
//
// KEINE Nachkalkulation mehr in der Karte (Kundenentscheid 2026-07-22: „die
// Nachkalkulation mache ich ja erst ganz danach"). Die Ist-Werte im Datenmodell
// (nachkalk.actualDays, materialRows[].actualVK) bleiben unangetastet, damit
// Altdaten nicht kaputtgehen — ausgewertet wird auf der Seite /nachkalkulation.
// ============================================================================
import { AlertTriangle, ChevronDown, Copy, GripVertical, Trash2 } from "lucide-react";
import {
  KalkModule, MaterialRow, ModulErgebnis, Betriebsdaten,
  DAEMMSTAERKEN, fmt, fmtEuro, num, wandhoeheWarnung,
} from "@/lib/kalkulationEngine";
import { KatalogKategorie } from "./useKalkKatalog";
import { MaterialTabelle } from "./MaterialTabelle";
import { NumInput } from "./NumInput";

interface DragProps {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

interface Props {
  module: KalkModule;
  index: number;
  ergebnis: ModulErgebnis;
  faktor: number;
  bd: Betriebsdaten;
  kategorien: KatalogKategorie[];
  onPatch: (patch: Partial<KalkModule>) => void;
  onPatchRow: (idx: number, patch: Partial<MaterialRow>) => void;
  onReplaceRow: (idx: number, row: MaterialRow) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onClone: () => void;
  onRemove: () => void;
  dragProps: DragProps;
}

/** Feldhöhe: am Handy 44 px (Touch-Ziel), am Desktop kompakt. */
const FELD_H = "h-11 sm:h-8";

/** Stückzahlen ohne unnötige Nachkommastellen ("3 Tage" statt "3,00 Tage"). */
const anz = (n: number): string => (Number.isInteger(n) ? String(n) : fmt(n));

const Feld = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block min-w-0 text-xs">
    <span className="mb-0.5 block text-muted-foreground">{label}</span>
    {children}
  </label>
);

export function AufbauKarte({
  module: m, index, ergebnis: erg, faktor, bd, kategorien,
  onPatch, onPatchRow, onReplaceRow, onAddRow, onRemoveRow, onClone, onRemove, dragProps,
}: Props) {
  const titel = m.name || `Aufbau ${index + 1}`;
  const materialAdj = erg.material.vkTotal * faktor;
  const laborAdj = erg.laborTotal * faktor;
  const gesamtAdj = materialAdj + laborAdj;
  const area = num(m.area);
  // Unplausible Wandhöhen (0,1 m, kleiner als 2× Brettdicke) wurden früher
  // wortlos durchgerechnet — jetzt steht der Hinweis direkt am Feld.
  const hoehenWarnung = wandhoeheWarnung(m.wallHeight, bd);

  return (
    <div
      className={`kb-panel ${m.isOptional ? "border-dashed opacity-80" : ""}`}
      onDragOver={dragProps.onDragOver}
      onDrop={dragProps.onDrop}
    >
      {/* Header */}
      <div
        className="flex min-h-[44px] cursor-pointer select-none items-center gap-2 border-b px-3 py-2"
        onClick={() => onPatch({ collapsed: !m.collapsed })}
      >
        <span
          draggable={dragProps.draggable}
          onDragStart={dragProps.onDragStart}
          onDragEnd={dragProps.onDragEnd}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab text-muted-foreground active:cursor-grabbing"
          title="Ziehen zum Umsortieren"
        ><GripVertical className="h-4 w-4" /></span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kb-blue text-xs font-bold text-white">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{titel}{m.isOptional ? " (optional)" : ""}</span>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Material <b className="tabular-nums">{fmtEuro(materialAdj)}</b> · Arbeit <b className="tabular-nums">{fmtEuro(laborAdj)}</b> · Gesamt <b className="tabular-nums text-foreground">{fmtEuro(gesamtAdj)}</b>
        </span>
        {/* Handy: wenigstens die Gesamtsumme muss auf der zugeklappten Karte stehen */}
        <span className="whitespace-nowrap text-xs font-bold tabular-nums sm:hidden">{fmtEuro(gesamtAdj)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${m.collapsed ? "-rotate-90" : ""}`} />
      </div>

      {!m.collapsed && (
        <>
          {/* min-w-0 an jeder Spalte: sonst zwingt die Materialtabelle
              (min-w-540) das Grid am Handy breiter als der Bildschirm. */}
          {/* Spalte A bekommt mehr Platz, seit die Nachkalkulation aus Spalte C
              raus ist — die Materialtabelle ist die eigentliche Arbeitsfläche. */}
          <div className="grid gap-4 p-3 xl:grid-cols-[1.6fr_1fr_0.85fr]">
            {/* Spalte A: Aufbau / Material */}
            <div className="min-w-0 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-kb-blue-dark">Aufbau / Material</h4>
              <Feld label="Bezeichnung">
                <input className={`kb-input ${FELD_H} min-h-0 px-2 py-1 text-sm`} value={m.name}
                  placeholder={`Aufbau ${index + 1}`}
                  onChange={(e) => onPatch({ name: e.target.value })} />
              </Feld>
              <div className="grid grid-cols-2 gap-2">
                <Feld label="Kategorie">
                  <select className={`kb-input ${FELD_H} min-h-0 w-full px-2 py-1 text-sm`} value={m.aufbauKategorie}
                    onChange={(e) => onPatch({ aufbauKategorie: e.target.value as KalkModule["aufbauKategorie"] })}>
                    <option value="">—</option>
                    <option value="Wand">Wand</option>
                    <option value="Decke">Decke</option>
                    <option value="Dach">Dach</option>
                    <option value="AW">AW</option>
                  </select>
                </Feld>
                <Feld label="Fläche in qm">
                  <NumInput min={0} value={m.area} onCommit={(n) => onPatch({ area: n ?? 0 })} className={FELD_H} />
                </Feld>
                <Feld label="Wandhöhe in m (Riegel)">
                  <NumInput min={0} value={m.wallHeight} onCommit={(n) => onPatch({ wallHeight: n ?? 0 })}
                    className={`${FELD_H} ${hoehenWarnung ? "border-amber-500 bg-amber-50" : ""}`}
                    title="Für die Riegelkonstruktions-Geometrie (Excel-Formel). Leer = Näherung 3,5 lfm/m²." />
                  {hoehenWarnung && (
                    <span className="mt-0.5 flex items-start gap-1 text-[10px] font-semibold leading-snug text-amber-700">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                      <span>{hoehenWarnung}</span>
                    </span>
                  )}
                </Feld>
                <Feld label="Dämmstärke in cm">
                  <select className={`kb-input ${FELD_H} min-h-0 w-full px-2 py-1 text-sm`} value={String(m.insulationThickness)}
                    onChange={(e) => onPatch({ insulationThickness: num(e.target.value) })}>
                    {DAEMMSTAERKEN.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                </Feld>
              </div>
              <Feld label="Notiz">
                <input className={`kb-input ${FELD_H} min-h-0 px-2 py-1 text-sm`} value={m.note}
                  onChange={(e) => onPatch({ note: e.target.value })} />
              </Feld>
              <MaterialTabelle
                module={m} bd={bd} kategorien={kategorien}
                onPatchRow={onPatchRow} onReplaceRow={onReplaceRow}
                onAddRow={onAddRow} onRemoveRow={onRemoveRow}
              />
            </div>

            {/* Spalte B: Arbeitszeit und Sonstiges */}
            <div className="min-w-0 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-kb-blue-dark">Arbeitszeit und Sonstiges</h4>
              <div className="rounded border bg-muted/20 p-2">
                <div className="mb-1 text-xs font-semibold">Arbeitszeit</div>
                <div className="grid grid-cols-2 gap-2">
                  <Feld label="Anzahl Arbeiter">
                    <NumInput min={0} value={m.workers} onCommit={(n) => onPatch({ workers: n ?? 0 })} className={FELD_H} />
                  </Feld>
                  <Feld label="Dauer in Tagen">
                    <NumInput min={0} value={m.days} onCommit={(n) => onPatch({ days: n ?? 0 })} className={FELD_H} />
                  </Feld>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {anz(num(m.days))} Tage × {anz(num(m.workers))} Arbeiter × {anz(bd.stundenProTag)} h × {fmtEuro(bd.mittellohn)}/h
                  {" = "}<b className="tabular-nums text-foreground">{fmtEuro(erg.laborCosts)}</b>
                  {erg.laborHours > 0 && <> ({anz(erg.laborHours)} Std.)</>}
                </div>
              </div>

              <div className="rounded border bg-muted/20 p-2">
                <div className="mb-1 text-xs font-semibold">Fahrten</div>
                <Feld label="Entfernung zur Baustelle in km">
                  <NumInput min={0} value={m.distanceKM} onCommit={(n) => onPatch({ distanceKM: n ?? 0 })} className={FELD_H} />
                </Feld>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Feld label={`Busfahrten (${fmtEuro(erg.transport.bus)})`}>
                    <NumInput min={0} value={m.busTrips} onCommit={(n) => onPatch({ busTrips: n ?? 0 })} className={FELD_H} />
                  </Feld>
                  <Feld label={`LKW-Fahrten (${fmtEuro(erg.transport.lkw)})`}>
                    <NumInput min={0} value={m.lkwTrips} onCommit={(n) => onPatch({ lkwTrips: n ?? 0 })} className={FELD_H} />
                  </Feld>
                </div>
                <div className="mt-1 text-right text-[11px]">Summe Fahrten: <b className="tabular-nums">{fmtEuro(erg.transport.total)}</b></div>
              </div>

              <div className="rounded border bg-muted/20 p-2">
                <div className="mb-1 text-xs font-semibold">Eingekaufte Dienstleistungen</div>
                <div className="grid grid-cols-2 gap-2">
                  <Feld label={`Kranstunden (${fmtEuro(erg.craneCosts)})`}>
                    <NumInput min={0} value={m.craneHours} onCommit={(n) => onPatch({ craneHours: n ?? 0 })} className={FELD_H} />
                  </Feld>
                  <Feld label="Speditionskosten €">
                    <NumInput value={m.shippingCosts} onCommit={(n) => onPatch({ shippingCosts: n ?? 0 })} className={FELD_H} />
                  </Feld>
                  <Feld label="Lohnabdunst Kosten €">
                    <NumInput value={m.paintCosts} onCommit={(n) => onPatch({ paintCosts: n ?? 0 })} className={FELD_H} />
                  </Feld>
                  <Feld label="Sonstige Kosten €">
                    <NumInput value={m.miscCosts} onCommit={(n) => onPatch({ miscCosts: n ?? 0 })} className={FELD_H} />
                  </Feld>
                </div>
                <div className="mt-1 text-right text-[11px]">Summe Dienstleistungen: <b className="tabular-nums">{fmtEuro(erg.servicesTotal)}</b></div>
              </div>
            </div>

            {/* Spalte C: Zusammenfassung */}
            <div className="min-w-0 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-kb-blue-dark">Zusammenfassung</h4>
              <div className="rounded border bg-[#F0F7EC] p-3 text-sm">
                <div className="flex justify-between py-0.5"><span>Material</span><b className="tabular-nums">{fmtEuro(materialAdj)}</b></div>
                <div className="flex justify-between py-0.5"><span>Arbeit</span><b className="tabular-nums">{fmtEuro(laborAdj)}</b></div>
                <div className="mt-1 flex justify-between border-t pt-1 text-base"><span className="font-bold">Gesamt</span><b className="tabular-nums">{fmtEuro(gesamtAdj)}</b></div>
                {area > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    pro qm: Material {fmtEuro(area > 0 ? materialAdj / area : 0)} · Arbeit {fmtEuro(area > 0 ? laborAdj / area : 0)} · Gesamt <b className="tabular-nums">{fmtEuro(area > 0 ? gesamtAdj / area : 0)}</b>
                  </div>
                )}
                {faktor !== 1 && <div className="mt-1 text-[10px] text-muted-foreground">inkl. Aufschlag/Skonto (Faktor {fmt(faktor)})</div>}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              Material EK <b className="tabular-nums">{fmtEuro(erg.material.ekTotal)}</b> · VK <b className="tabular-nums">{fmtEuro(erg.material.vkTotal)}</b>
              {area > 0 && <> · Gesamt/qm <b className="tabular-nums">{fmtEuro(gesamtAdj / area)}</b></>}
            </span>
            <span className="flex-1" />
            <label className="flex h-11 cursor-pointer items-center gap-2 px-1 text-xs sm:h-7">
              <input type="checkbox" className="h-4 w-4" checked={m.isOptional}
                onChange={(e) => onPatch({ isOptional: e.target.checked })} />
              optional
            </label>
            <button type="button" onClick={onClone} className="kb-btn h-11 min-h-0 px-3 py-1 text-xs sm:h-7 sm:px-2" title="Aufbau direkt dahinter duplizieren">
              <Copy className="h-3.5 w-3.5 text-kb-blue-dark" /> Verdoppeln
            </button>
            <button type="button" onClick={onRemove} className="kb-btn h-11 min-h-0 px-3 py-1 text-xs text-destructive sm:h-7 sm:px-2" title="Aufbau entfernen">
              <Trash2 className="h-3.5 w-3.5 text-destructive" /> Entfernen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
