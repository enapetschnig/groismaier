// ============================================================================
// AufbauKarte — eine einklappbare Aufbau-Karte des Tabs "Aufbau Kalkulation":
// Spalte A (Aufbau/Material inkl. MaterialTabelle), Spalte B (Arbeitszeit,
// Fahrten, Dienstleistungen), Spalte C (Zusammenfassung + Nachkalkulation).
// Drag&Drop-Umsortierung, Klonen, optional-Flag wie im Original.
// ============================================================================
import { ChevronDown, Copy, GripVertical, Trash2 } from "lucide-react";
import {
  KalkModule, MaterialRow, ModulErgebnis, Betriebsdaten,
  DAEMMSTAERKEN, fmt, fmtEuro, num,
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

const Feld = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-xs">
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
  const nk = erg.nachkalk;

  return (
    <div
      className={`kb-panel ${m.isOptional ? "border-dashed opacity-80" : ""}`}
      onDragOver={dragProps.onDragOver}
      onDrop={dragProps.onDrop}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer select-none items-center gap-2 border-b px-3 py-2"
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
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${m.collapsed ? "-rotate-90" : ""}`} />
      </div>

      {!m.collapsed && (
        <>
          <div className="grid gap-4 p-3 xl:grid-cols-3">
            {/* Spalte A: Aufbau / Material */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-kb-blue-dark">Aufbau / Material</h4>
              <Feld label="Bezeichnung">
                <input className="kb-input h-8 min-h-0 px-2 py-1 text-sm" value={m.name}
                  placeholder={`Aufbau ${index + 1}`}
                  onChange={(e) => onPatch({ name: e.target.value })} />
              </Feld>
              <div className="grid grid-cols-2 gap-2">
                <Feld label="Kategorie">
                  <select className="kb-input h-8 min-h-0 px-2 py-1 text-sm" value={m.aufbauKategorie}
                    onChange={(e) => onPatch({ aufbauKategorie: e.target.value as KalkModule["aufbauKategorie"] })}>
                    <option value="">—</option>
                    <option value="Wand">Wand</option>
                    <option value="Decke">Decke</option>
                    <option value="Dach">Dach</option>
                    <option value="AW">AW</option>
                  </select>
                </Feld>
                <Feld label="Fläche in qm">
                  <NumInput value={m.area} onCommit={(n) => onPatch({ area: n ?? 0 })} />
                </Feld>
                <Feld label="Wandhöhe in m (Riegel)">
                  <NumInput value={m.wallHeight} onCommit={(n) => onPatch({ wallHeight: n ?? 0 })}
                    title="Für die Riegelkonstruktions-Geometrie (Excel-Formel). Leer = Näherung 3,5 lfm/m²." />
                </Feld>
                <Feld label="Dämmstärke in cm">
                  <select className="kb-input h-8 min-h-0 px-2 py-1 text-sm" value={String(m.insulationThickness)}
                    onChange={(e) => onPatch({ insulationThickness: num(e.target.value) })}>
                    {DAEMMSTAERKEN.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                </Feld>
              </div>
              <Feld label="Notiz">
                <input className="kb-input h-8 min-h-0 px-2 py-1 text-sm" value={m.note}
                  onChange={(e) => onPatch({ note: e.target.value })} />
              </Feld>
              <MaterialTabelle
                module={m} bd={bd} kategorien={kategorien}
                onPatchRow={onPatchRow} onReplaceRow={onReplaceRow}
                onAddRow={onAddRow} onRemoveRow={onRemoveRow}
              />
            </div>

            {/* Spalte B: Arbeitszeit und Sonstiges */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-kb-blue-dark">Arbeitszeit und Sonstiges</h4>
              <div className="rounded border bg-muted/20 p-2">
                <div className="mb-1 text-xs font-semibold">Arbeitszeit</div>
                <div className="grid grid-cols-2 gap-2">
                  <Feld label="Anzahl Arbeiter">
                    <NumInput value={m.workers} onCommit={(n) => onPatch({ workers: n ?? 0 })} />
                  </Feld>
                  <Feld label="Dauer in Tagen">
                    <NumInput value={m.days} onCommit={(n) => onPatch({ days: n ?? 0 })} />
                  </Feld>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  á {fmt(bd.stundenProTag)} h zu {fmtEuro(bd.mittellohn * num(m.workers))} → <b className="tabular-nums text-foreground">{fmtEuro(erg.laborCosts)}</b>
                </div>
              </div>

              <div className="rounded border bg-muted/20 p-2">
                <div className="mb-1 text-xs font-semibold">Fahrten</div>
                <Feld label="Entfernung zur Baustelle in km">
                  <NumInput value={m.distanceKM} onCommit={(n) => onPatch({ distanceKM: n ?? 0 })} />
                </Feld>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Feld label={`Busfahrten (${fmtEuro(erg.transport.bus)})`}>
                    <NumInput value={m.busTrips} onCommit={(n) => onPatch({ busTrips: n ?? 0 })} />
                  </Feld>
                  <Feld label={`LKW-Fahrten (${fmtEuro(erg.transport.lkw)})`}>
                    <NumInput value={m.lkwTrips} onCommit={(n) => onPatch({ lkwTrips: n ?? 0 })} />
                  </Feld>
                </div>
                <div className="mt-1 text-right text-[11px]">Summe Fahrten: <b className="tabular-nums">{fmtEuro(erg.transport.total)}</b></div>
              </div>

              <div className="rounded border bg-muted/20 p-2">
                <div className="mb-1 text-xs font-semibold">Eingekaufte Dienstleistungen</div>
                <div className="grid grid-cols-2 gap-2">
                  <Feld label={`Kranstunden (${fmtEuro(erg.craneCosts)})`}>
                    <NumInput value={m.craneHours} onCommit={(n) => onPatch({ craneHours: n ?? 0 })} />
                  </Feld>
                  <Feld label="Speditionskosten €">
                    <NumInput value={m.shippingCosts} onCommit={(n) => onPatch({ shippingCosts: n ?? 0 })} />
                  </Feld>
                  <Feld label="Lohnabdunst Kosten €">
                    <NumInput value={m.paintCosts} onCommit={(n) => onPatch({ paintCosts: n ?? 0 })} />
                  </Feld>
                  <Feld label="Sonstige Kosten €">
                    <NumInput value={m.miscCosts} onCommit={(n) => onPatch({ miscCosts: n ?? 0 })} />
                  </Feld>
                </div>
                <div className="mt-1 text-right text-[11px]">Summe Dienstleistungen: <b className="tabular-nums">{fmtEuro(erg.servicesTotal)}</b></div>
              </div>
            </div>

            {/* Spalte C: Zusammenfassung + Nachkalkulation */}
            <div className="space-y-3">
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

              <div className="rounded border border-dashed border-[#ED7D31] p-3">
                <div className="mb-2 text-xs font-bold text-[#C55A11]">📊 Nachkalkulation (Ist-Kosten)</div>
                <Feld label="Tatsächliche Dauer in Tagen">
                  <NumInput value={m.nachkalk?.actualDays ?? null} nullable
                    onCommit={(n) => onPatch({ nachkalk: { actualDays: n } })} className="border-[#ED7D31]/50" />
                </Feld>
                {nk.istLohn !== null && (
                  <div className="mt-2 space-y-0.5 text-xs">
                    <div className="flex justify-between"><span>Lohnkosten (ist)</span><b className="tabular-nums">{fmtEuro(nk.istLohn)}</b></div>
                    <div className="flex justify-between">
                      <span>Differenz Tage</span>
                      <b className={`tabular-nums ${num(nk.diffTage) <= 0 ? "text-green-700" : "text-red-600"}`}>{num(nk.diffTage) > 0 ? "+" : ""}{fmt(num(nk.diffTage))}</b>
                    </div>
                    <div className="flex justify-between">
                      <span>Differenz €</span>
                      <b className={`tabular-nums ${num(nk.diffLohn) <= 0 ? "text-green-700" : "text-red-600"}`}>{num(nk.diffLohn) > 0 ? "+" : ""}{fmtEuro(num(nk.diffLohn))}</b>
                    </div>
                  </div>
                )}
                {nk.istMaterial !== null && (
                  <div className="mt-2 space-y-0.5 border-t pt-2 text-xs">
                    <div className="flex justify-between"><span>Material (ist)</span><b className="tabular-nums">{fmtEuro(nk.istMaterial)}</b></div>
                    <div className="flex justify-between">
                      <span>Differenz €</span>
                      <b className={`tabular-nums ${num(nk.diffMaterial) <= 0 ? "text-green-700" : "text-red-600"}`}>{num(nk.diffMaterial) > 0 ? "+" : ""}{fmtEuro(num(nk.diffMaterial))}</b>
                    </div>
                  </div>
                )}
                {nk.istLohn === null && nk.istMaterial === null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Ist-Werte (Dauer bzw. Ist-VK je Materialzeile) eintragen, sobald abgerechnet.</p>
                )}
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
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="checkbox" checked={m.isOptional} onChange={(e) => onPatch({ isOptional: e.target.checked })} />
              optional
            </label>
            <button type="button" onClick={onClone} className="kb-btn h-7 min-h-0 px-2 py-1 text-xs" title="Aufbau direkt dahinter duplizieren">
              <Copy className="h-3.5 w-3.5 text-kb-blue-dark" /> Verdoppeln
            </button>
            <button type="button" onClick={onRemove} className="kb-btn h-7 min-h-0 px-2 py-1 text-xs text-destructive" title="Aufbau entfernen">
              <Trash2 className="h-3.5 w-3.5 text-destructive" /> Entfernen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
