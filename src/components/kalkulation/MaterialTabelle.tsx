// ============================================================================
// MaterialTabelle — Material-Zeilen eines Aufbaus mit den 3 Zeilenmodi des
// Originals (DB / Manuell / Berechnet) + Nachkalkulations-Spalten (Ist VK,
// Diff). Erweiterung ggü. dem HTML-Tool: "+ Zeile" (dort fix 10 Zeilen).
//
// Modus-Zyklus je Zeile: DB → Manuell → (nur Decke/Dach: Berechnet) → DB;
// jeder Wechsel setzt die Zeile zurück (wie Original).
// ============================================================================
import { Database, Pencil, Grid3x3, Plus, X } from "lucide-react";
import {
  KalkModule, MaterialRow, Betriebsdaten, calcMaterialRow, calcMaterialSummen,
  newMaterialRow, fmt, fmtEuro, num,
} from "@/lib/kalkulationEngine";
import { KatalogKategorie } from "./useKalkKatalog";
import { NumInput } from "./NumInput";

interface Props {
  module: KalkModule;
  bd: Betriebsdaten;
  kategorien: KatalogKategorie[];
  onPatchRow: (idx: number, patch: Partial<MaterialRow>) => void;
  onReplaceRow: (idx: number, row: MaterialRow) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
}

export function MaterialTabelle({ module: m, bd, kategorien, onPatchRow, onReplaceRow, onAddRow, onRemoveRow }: Props) {
  const summen = calcMaterialSummen(m, bd);
  const istDecke = m.aufbauKategorie === "Decke" || m.aufbauKategorie === "Dach";

  const toggleMode = (idx: number, row: MaterialRow) => {
    // DB → Manuell → (Decke/Dach: Berechnet) → DB; Reset aller Felder je Wechsel.
    const next = newMaterialRow();
    if (!row.manual && !row.calc) next.manual = true;
    else if (row.manual && istDecke) next.calc = true;
    onReplaceRow(idx, next);
  };

  const selectArtikel = (idx: number, row: MaterialRow, artikelName: string) => {
    const kat = kategorien.find((k) => k.name === row.category);
    const art = kat?.artikel.find((a) => a.name === artikelName);
    // Preise aus dem Katalog in die Zeile kopieren; bleiben editierbar
    // (deckt "???"-Artikel ohne Preis und den editierbaren Riegel-m³-Preis ab).
    onPatchRow(idx, { product: artikelName, ekPrice: num(art?.ek), vkPrice: num(art?.vk) });
  };

  const istSumme = (m.materialRows || []).reduce(
    (s, r) => s + (r.actualVK !== null && r.category && r.product ? num(r.actualVK) : 0), 0,
  );
  const hatIst = (m.materialRows || []).some((r) => r.actualVK !== null && r.category && r.product);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-7 py-1" title="Zeilenmodus: Datenbank / Manuell / Berechnet" />
              <th className="py-1 pr-1 font-semibold">Kategorie</th>
              <th className="py-1 pr-1 font-semibold">Artikel</th>
              <th className="w-16 py-1 pr-1 text-right font-semibold">EK</th>
              <th className="w-16 py-1 pr-1 text-right font-semibold">VK</th>
              <th className="w-16 py-1 pr-1 text-right font-semibold">Ist VK</th>
              <th className="w-16 py-1 pr-1 text-right font-semibold">Diff</th>
              <th className="w-7 py-1" />
            </tr>
          </thead>
          <tbody>
            {(m.materialRows || []).map((row, idx) => {
              const erg = calcMaterialRow(row, m, bd);
              const diff = row.actualVK !== null && row.category && row.product ? num(row.actualVK) - num(row.vkPrice) : null;
              const istRiegel = !row.manual && !row.calc && row.product.startsWith("Riegelkonstruktion");
              const istDaemm = !row.manual && !row.calc && row.category === "Dämmstoffe";
              return (
                <tr key={idx} className="border-b align-top last:border-b-0">
                  <td className="py-1 pr-1">
                    <button
                      type="button"
                      onClick={() => toggleMode(idx, row)}
                      className="flex h-7 w-6 items-center justify-center rounded border border-kb-blue-dark/30 bg-white text-kb-blue-dark hover:bg-muted"
                      title={row.manual ? "Modus: Manuell (absolute €-Beträge) — klicken zum Wechseln"
                        : row.calc ? "Modus: Holz berechnen — klicken zum Wechseln"
                        : "Modus: Datenbank — klicken zum Wechseln"}
                    >
                      {row.manual ? <Pencil className="h-3.5 w-3.5" /> : row.calc ? <Grid3x3 className="h-3.5 w-3.5 text-[#C55A11]" /> : <Database className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  {row.calc ? (
                    <td colSpan={2} className="py-1 pr-1">
                      <div className="grid grid-cols-3 gap-1">
                        <label className="text-[10px] text-muted-foreground">b (cm)
                          <NumInput value={row.dimension} onCommit={(n) => onPatchRow(idx, { dimension: n ?? 0 })} className="h-7" />
                        </label>
                        <label className="text-[10px] text-muted-foreground">h (cm)
                          <NumInput value={row.dimension2} onCommit={(n) => onPatchRow(idx, { dimension2: n ?? 0 })} className="h-7" />
                        </label>
                        <label className="text-[10px] text-muted-foreground">lfm/m²
                          <NumInput value={row.lmPerQm} onCommit={(n) => onPatchRow(idx, { lmPerQm: n ?? 0 })} className="h-7" />
                        </label>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#C55A11]">
                        Holzmenge: {fmt(num(m.area) * num(row.lmPerQm) * (num(row.dimension) / 100) * (num(row.dimension2) / 100))} m³ → {fmtEuro(erg.vkAbsolut)} (absolut)
                      </div>
                    </td>
                  ) : row.manual ? (
                    <>
                      <td className="py-1 pr-1">
                        <input
                          className="kb-input h-7 min-h-0 px-2 py-1 text-xs"
                          value={row.category}
                          placeholder="Kategorie (frei)"
                          onChange={(e) => onPatchRow(idx, { category: e.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-1">
                        <input
                          className="kb-input h-7 min-h-0 px-2 py-1 text-xs"
                          value={row.product}
                          placeholder="Artikel (frei)"
                          onChange={(e) => onPatchRow(idx, { product: e.target.value })}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 pr-1">
                        <select
                          className="kb-input h-7 min-h-0 w-full px-1 py-0 text-xs"
                          value={row.category}
                          onChange={(e) => onPatchRow(idx, { category: e.target.value, product: "", ekPrice: 0, vkPrice: 0 })}
                        >
                          <option value="">—</option>
                          {kategorien.map((k) => <option key={k.id} value={k.name}>{k.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1 pr-1">
                        <select
                          className="kb-input h-7 min-h-0 w-full px-1 py-0 text-xs"
                          value={row.product}
                          onChange={(e) => selectArtikel(idx, row, e.target.value)}
                          disabled={!row.category}
                        >
                          <option value="">—</option>
                          {(kategorien.find((k) => k.name === row.category)?.artikel || []).map((a) => (
                            <option key={a.id} value={a.name}>{a.name}{a.ek === null && a.vk === null ? " (Preis manuell)" : ""}</option>
                          ))}
                        </select>
                        {istRiegel && (
                          <div className="mt-0.5 text-[10px] text-kb-blue-dark">
                            Riegelgeometrie ({fmt(bd.riegelAbstand)} cm Abstand): {fmtEuro(erg.vkProM2)} / m²{num(m.wallHeight) <= 0 ? " (Näherung 3,5 lfm/m² — Wandhöhe eintragen!)" : ""}
                          </div>
                        )}
                        {istDaemm && row.product && (
                          <div className="mt-0.5 text-[10px] text-kb-blue-dark">
                            €/m³ × {fmt(num(m.insulationThickness))} cm → {fmtEuro(erg.vkProM2)} / m²
                          </div>
                        )}
                      </td>
                    </>
                  )}
                  <td className="py-1 pr-1">
                    <NumInput value={row.ekPrice} onCommit={(n) => onPatchRow(idx, { ekPrice: n ?? 0 })} className="h-7"
                      title={row.calc || istRiegel ? "€ / m³" : row.manual ? "absoluter €-Betrag" : "€ / m²"} />
                  </td>
                  <td className="py-1 pr-1">
                    {row.calc ? (
                      <div className="pt-1.5 text-right tabular-nums">{fmt(erg.vkAbsolut)}</div>
                    ) : istRiegel ? (
                      <div className="pt-1.5 text-right tabular-nums" title="EK = VK (Riegelkonstruktion ohne Aufschlag)">{fmt(erg.vkProM2)}</div>
                    ) : (
                      <NumInput value={row.vkPrice} onCommit={(n) => onPatchRow(idx, { vkPrice: n ?? 0 })} className="h-7"
                        title={row.manual ? "absoluter €-Betrag" : "€ / m²"} />
                    )}
                  </td>
                  <td className="py-1 pr-1">
                    <NumInput value={row.actualVK} nullable onCommit={(n) => onPatchRow(idx, { actualVK: n })} className="h-7 border-[#ED7D31]/50" />
                  </td>
                  <td className="py-1 pr-1 pt-2 text-right tabular-nums">
                    {diff !== null ? (
                      <span className={diff <= 0 ? "text-green-700" : "text-red-600"}>{diff > 0 ? "+" : ""}{fmt(diff)}</span>
                    ) : "—"}
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(idx)}
                      className="flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Zeile entfernen"
                    ><X className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <button type="button" onClick={onAddRow} className="kb-btn h-7 min-h-0 px-2 py-1 text-xs">
          <Plus className="h-3.5 w-3.5 text-kb-blue-dark" /> Zeile
        </button>
        <div className="text-right text-[11px] leading-5 text-muted-foreground">
          <div>Teilsummen: EK <b className="tabular-nums">{fmt(summen.ekProM2)} €/m²</b> · VK <b className="tabular-nums">{fmt(summen.vkProM2)} €/m²</b></div>
          {(summen.ekAbsolut !== 0 || summen.vkAbsolut !== 0) && (
            <div>absolut: EK <b className="tabular-nums">{fmtEuro(summen.ekAbsolut)}</b> · VK <b className="tabular-nums">{fmtEuro(summen.vkAbsolut)}</b></div>
          )}
          {hatIst && <div>Ist VK: <b className="tabular-nums">{fmt(istSumme)} €/m²</b></div>}
        </div>
      </div>
    </div>
  );
}
