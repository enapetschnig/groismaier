// ============================================================================
// MaterialTabelle — Material-Zeilen eines Aufbaus mit den 3 Zeilenmodi des
// Originals (DB / Manuell / Berechnet) + Nachkalkulations-Spalten (Ist VK,
// Diff). Erweiterung ggü. dem HTML-Tool: "+ Zeile" (dort fix 10 Zeilen).
//
// Modus-Zyklus je Zeile: DB → Manuell → (nur Decke/Dach: Berechnet) → DB;
// jeder Wechsel setzt die Zeile zurück (wie Original).
//
// Zwei Darstellungen:
//   ≥ sm  Tabelle wie bisher (Büro/Desktop)
//   < sm  gestapelte Karten mit 44-px-Feldern (Baustelle/Handy). Dort werden
//         nur befüllte Zeilen + EINE freie Zeile gezeigt — sonst müsste man
//         sich am Handy durch 10 leere Zeilen scrollen.
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

/** Zeile ohne jeden Inhalt (Handy: nur eine davon anzeigen). */
const istLeereZeile = (r: MaterialRow): boolean =>
  !r.manual && !r.calc && !r.category && !r.product &&
  num(r.ekPrice) === 0 && num(r.vkPrice) === 0 && (r.actualVK === null || r.actualVK === undefined);

export function MaterialTabelle({ module: m, bd, kategorien, onPatchRow, onReplaceRow, onAddRow, onRemoveRow }: Props) {
  const summen = calcMaterialSummen(m, bd);
  const istDecke = m.aufbauKategorie === "Decke" || m.aufbauKategorie === "Dach";
  const rows = m.materialRows || [];
  const ersterLeerIdx = rows.findIndex(istLeereZeile);

  const toggleMode = (idx: number, row: MaterialRow) => {
    // DB → Manuell → (Decke/Dach: Berechnet) → DB; Reset aller Felder je Wechsel.
    const next = newMaterialRow();
    if (!row.manual && !row.calc) next.manual = true;
    else if (row.manual && istDecke) next.calc = true;
    onReplaceRow(idx, next);
  };

  // Edge-Case-Review 2026-07-21: Der Ist-VK der Nachkalkulation überlebte den
  // Artikelwechsel und wurde danach gegen einen ganz anderen Artikel gerechnet
  // (Diff-Spalte zeigte Phantasiewerte). Bei jedem Kategorie-/Artikelwechsel
  // wird er deshalb zurückgesetzt — er gehört immer zum Artikel, der in der
  // Zeile steht.
  const selectKategorie = (idx: number, katName: string) =>
    onPatchRow(idx, { category: katName, product: "", ekPrice: 0, vkPrice: 0, actualVK: null });

  const selectArtikel = (idx: number, row: MaterialRow, artikelName: string) => {
    const kat = kategorien.find((k) => k.name === row.category);
    const art = kat?.artikel.find((a) => a.name === artikelName);
    // Preise aus dem Katalog in die Zeile kopieren; bleiben editierbar
    // (deckt "???"-Artikel ohne Preis und den editierbaren Riegel-m³-Preis ab).
    onPatchRow(idx, {
      product: artikelName, ekPrice: num(art?.ek), vkPrice: num(art?.vk),
      actualVK: artikelName === row.product ? row.actualVK : null,
    });
  };

  const istSumme = rows.reduce(
    (s, r) => s + (r.actualVK !== null && r.category && r.product ? num(r.actualVK) : 0), 0,
  );
  const hatIst = rows.some((r) => r.actualVK !== null && r.category && r.product);

  /** Rechenwerte + Modus-Flags einer Zeile (für beide Darstellungen). */
  const info = (row: MaterialRow) => {
    const erg = calcMaterialRow(row, m, bd);
    return {
      erg,
      diff: row.actualVK !== null && row.category && row.product ? num(row.actualVK) - num(row.vkPrice) : null,
      istRiegel: !row.manual && !row.calc && row.product.startsWith("Riegelkonstruktion"),
      istDaemm: !row.manual && !row.calc && row.category === "Dämmstoffe",
      // Zeile mit EK, aber ohne VK: der VK wird abgeleitet (früher fiel die
      // Zeile mit 0 € aus dem Angebot). Der Anwender muss das sehen.
      warnung: erg.vkAbgeleitet
        ? `⚠ Kein VK erfasst — Verkaufspreis aus EK × ${fmt(bd.vkFaktor)} abgeleitet: ` +
          (row.manual ? `${fmtEuro(erg.vkAbsolut)} gesamt` : `${fmtEuro(erg.vkProM2)} / m²`)
        : null,
    };
  };

  const modusTitel = (row: MaterialRow) =>
    row.manual ? "Modus: Manuell (absolute €-Beträge) — klicken zum Wechseln"
      : row.calc ? "Modus: Holz berechnen — klicken zum Wechseln"
        : "Modus: Datenbank — klicken zum Wechseln";

  const ModusIcon = ({ row }: { row: MaterialRow }) =>
    row.manual ? <Pencil className="h-3.5 w-3.5" />
      : row.calc ? <Grid3x3 className="h-3.5 w-3.5 text-[#C55A11]" />
        : <Database className="h-3.5 w-3.5" />;

  const kategorieOptionen = (
    <>
      <option value="">—</option>
      {kategorien.map((k) => <option key={k.id} value={k.name}>{k.name}</option>)}
    </>
  );
  const artikelOptionen = (row: MaterialRow) => (
    <>
      <option value="">—</option>
      {(kategorien.find((k) => k.name === row.category)?.artikel || []).map((a) => (
        <option key={a.id} value={a.name}>{a.name}{a.ek === null && a.vk === null ? " (Preis manuell)" : ""}</option>
      ))}
    </>
  );

  const hinweis = (row: MaterialRow, r: ReturnType<typeof info>) => (
    <>
      {r.istRiegel && (
        <div className="mt-0.5 text-[10px] text-kb-blue-dark">
          Riegelgeometrie ({fmt(bd.riegelAbstand)} cm Abstand): {fmtEuro(r.erg.vkProM2)} / m²{num(m.wallHeight) <= 0 ? " (Näherung 3,5 lfm/m² — Wandhöhe eintragen!)" : ""}
        </div>
      )}
      {r.istDaemm && row.product && (
        <div className="mt-0.5 text-[10px] text-kb-blue-dark">
          €/m³ × {fmt(num(m.insulationThickness))} cm → {fmtEuro(r.erg.vkProM2)} / m²
        </div>
      )}
      {r.warnung && <div className="mt-0.5 text-[10px] font-semibold text-amber-700">{r.warnung}</div>}
    </>
  );

  return (
    <div>
      {/* ------------------------------------------------ Handy: Karten */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row, idx) => {
          if (istLeereZeile(row) && idx !== ersterLeerIdx) return null;
          const r = info(row);
          return (
            <div key={idx} className="rounded border bg-white p-2">
              <div className="mb-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleMode(idx, row)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-kb-blue-dark/30 bg-white text-kb-blue-dark"
                  title={modusTitel(row)}
                  aria-label="Zeilenmodus wechseln"
                ><ModusIcon row={row} /></button>
                <span className="flex-1 text-[11px] font-semibold text-muted-foreground">
                  {row.manual ? "Manuell (€-Beträge)" : row.calc ? "Holz berechnen" : "Aus Katalog"}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveRow(idx)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Zeile entfernen"
                  aria-label="Zeile entfernen"
                ><X className="h-4 w-4" /></button>
              </div>

              {row.calc ? (
                <div className="grid grid-cols-3 gap-2">
                  <label className="block text-[11px] text-muted-foreground">b (cm)
                    <NumInput min={0} value={row.dimension} onCommit={(n) => onPatchRow(idx, { dimension: n ?? 0 })} className="h-11" />
                  </label>
                  <label className="block text-[11px] text-muted-foreground">h (cm)
                    <NumInput min={0} value={row.dimension2} onCommit={(n) => onPatchRow(idx, { dimension2: n ?? 0 })} className="h-11" />
                  </label>
                  <label className="block text-[11px] text-muted-foreground">lfm/m²
                    <NumInput min={0} value={row.lmPerQm} onCommit={(n) => onPatchRow(idx, { lmPerQm: n ?? 0 })} className="h-11" />
                  </label>
                </div>
              ) : row.manual ? (
                <div className="grid grid-cols-1 gap-2">
                  <input className="kb-input h-11 min-h-0 px-2 py-1 text-sm" value={row.category}
                    placeholder="Kategorie (frei)" onChange={(e) => onPatchRow(idx, { category: e.target.value })} />
                  <input className="kb-input h-11 min-h-0 px-2 py-1 text-sm" value={row.product}
                    placeholder="Artikel (frei)" onChange={(e) => onPatchRow(idx, { product: e.target.value })} />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  <select className="kb-input h-11 min-h-0 w-full px-2 py-1 text-sm" value={row.category}
                    aria-label="Kategorie"
                    onChange={(e) => selectKategorie(idx, e.target.value)}>
                    {kategorieOptionen}
                  </select>
                  <select className="kb-input h-11 min-h-0 w-full px-2 py-1 text-sm" value={row.product}
                    aria-label="Artikel" disabled={!row.category}
                    onChange={(e) => selectArtikel(idx, row, e.target.value)}>
                    {artikelOptionen(row)}
                  </select>
                </div>
              )}
              {hinweis(row, r)}

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-muted-foreground">
                  EK {row.calc || r.istRiegel ? "€/m³" : row.manual ? "€ gesamt" : "€/m²"}
                  <NumInput value={row.ekPrice} onCommit={(n) => onPatchRow(idx, { ekPrice: n ?? 0 })} className="h-11" />
                </label>
                <label className="block text-[11px] text-muted-foreground">
                  VK {row.manual ? "€ gesamt" : "€/m²"}
                  {row.calc ? (
                    <div className="flex h-11 items-center justify-end pr-2 tabular-nums">{fmt(r.erg.vkAbsolut)}</div>
                  ) : r.istRiegel ? (
                    <div className="flex h-11 items-center justify-end pr-2 tabular-nums">{fmt(r.erg.vkProM2)}</div>
                  ) : (
                    <NumInput value={row.vkPrice} onCommit={(n) => onPatchRow(idx, { vkPrice: n ?? 0 })} className="h-11" />
                  )}
                </label>
              </div>

              {(hatIst || row.actualVK !== null) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block text-[11px] text-muted-foreground">Ist VK €/m²
                    <NumInput value={row.actualVK} nullable onCommit={(n) => onPatchRow(idx, { actualVK: n })}
                      className="h-11 border-[#ED7D31]/50" />
                  </label>
                  <div className="text-[11px] text-muted-foreground">Diff
                    <div className="flex h-11 items-center justify-end pr-2 tabular-nums">
                      {r.diff !== null
                        ? <span className={r.diff <= 0 ? "text-green-700" : "text-red-600"}>{r.diff > 0 ? "+" : ""}{fmt(r.diff)}</span>
                        : "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------ Desktop: Tabelle */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[540px] text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-7 py-1" title="Zeilenmodus: Datenbank / Manuell / Berechnet" />
              <th className="py-1 pr-1 font-semibold">Kategorie</th>
              <th className="py-1 pr-1 font-semibold">Artikel</th>
              <th className="w-16 py-1 pr-1 text-right font-semibold">EK</th>
              <th className="w-16 py-1 pr-1 text-right font-semibold">VK</th>
              <th className="w-16 py-1 pr-1 text-right font-semibold" title="Nachkalkulation: tatsächlicher VK">Ist VK</th>
              <th className="w-14 py-1 pr-1 text-right font-semibold">Diff</th>
              <th className="w-7 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const r = info(row);
              return (
                <tr key={idx} className="border-b align-top last:border-b-0">
                  <td className="py-1 pr-1">
                    <button
                      type="button"
                      onClick={() => toggleMode(idx, row)}
                      className="flex h-7 w-6 items-center justify-center rounded border border-kb-blue-dark/30 bg-white text-kb-blue-dark hover:bg-muted"
                      title={modusTitel(row)}
                    ><ModusIcon row={row} /></button>
                  </td>
                  {row.calc ? (
                    <td colSpan={2} className="py-1 pr-1">
                      <div className="grid grid-cols-3 gap-1">
                        <label className="text-[10px] text-muted-foreground">b (cm)
                          <NumInput min={0} value={row.dimension} onCommit={(n) => onPatchRow(idx, { dimension: n ?? 0 })} className="h-7 sm:h-7" />
                        </label>
                        <label className="text-[10px] text-muted-foreground">h (cm)
                          <NumInput min={0} value={row.dimension2} onCommit={(n) => onPatchRow(idx, { dimension2: n ?? 0 })} className="h-7 sm:h-7" />
                        </label>
                        <label className="text-[10px] text-muted-foreground">lfm/m²
                          <NumInput min={0} value={row.lmPerQm} onCommit={(n) => onPatchRow(idx, { lmPerQm: n ?? 0 })} className="h-7 sm:h-7" />
                        </label>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#C55A11]">
                        Holzmenge: {fmt(num(m.area) * num(row.lmPerQm) * (num(row.dimension) / 100) * (num(row.dimension2) / 100))} m³ → {fmtEuro(r.erg.vkAbsolut)} (absolut)
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
                        {hinweis(row, r)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 pr-1">
                        <select
                          className="kb-input h-7 min-h-0 w-full px-1 py-0 text-xs"
                          value={row.category}
                          aria-label="Kategorie"
                          onChange={(e) => selectKategorie(idx, e.target.value)}
                        >
                          {kategorieOptionen}
                        </select>
                      </td>
                      <td className="py-1 pr-1">
                        <select
                          className="kb-input h-7 min-h-0 w-full px-1 py-0 text-xs"
                          value={row.product}
                          aria-label="Artikel"
                          onChange={(e) => selectArtikel(idx, row, e.target.value)}
                          disabled={!row.category}
                        >
                          {artikelOptionen(row)}
                        </select>
                        {hinweis(row, r)}
                      </td>
                    </>
                  )}
                  <td className="py-1 pr-1">
                    <NumInput value={row.ekPrice} onCommit={(n) => onPatchRow(idx, { ekPrice: n ?? 0 })} className="h-7 sm:h-7"
                      title={row.calc || r.istRiegel ? "€ / m³" : row.manual ? "absoluter €-Betrag" : "€ / m²"} />
                  </td>
                  <td className="py-1 pr-1">
                    {row.calc ? (
                      <div className="pt-1.5 text-right tabular-nums">{fmt(r.erg.vkAbsolut)}</div>
                    ) : r.istRiegel ? (
                      <div className="pt-1.5 text-right tabular-nums" title="EK = VK (Riegelkonstruktion ohne Aufschlag)">{fmt(r.erg.vkProM2)}</div>
                    ) : (
                      <NumInput value={row.vkPrice} onCommit={(n) => onPatchRow(idx, { vkPrice: n ?? 0 })} className="h-7 sm:h-7"
                        title={row.manual ? "absoluter €-Betrag" : "€ / m²"} />
                    )}
                  </td>
                  <td className="py-1 pr-1">
                    <NumInput value={row.actualVK} nullable onCommit={(n) => onPatchRow(idx, { actualVK: n })} className="h-7 sm:h-7 border-[#ED7D31]/50" />
                  </td>
                  <td className="py-1 pr-1 pt-2 text-right tabular-nums">
                    {r.diff !== null ? (
                      <span className={r.diff <= 0 ? "text-green-700" : "text-red-600"}>{r.diff > 0 ? "+" : ""}{fmt(r.diff)}</span>
                    ) : "—"}
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(idx)}
                      className="flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Zeile entfernen"
                      aria-label="Zeile entfernen"
                    ><X className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onAddRow}
          className={`kb-btn h-11 min-h-0 px-3 py-1 text-xs sm:h-7 sm:px-2 ${ersterLeerIdx >= 0 ? "hidden sm:inline-flex" : ""}`}
        >
          <Plus className="h-3.5 w-3.5 text-kb-blue-dark" /> Zeile
        </button>
        <div className="ml-auto text-right text-[11px] leading-5 text-muted-foreground">
          <div>Teilsummen: EK <b className="tabular-nums">{fmt(summen.ekProM2)} €/m²</b> · VK <b className="tabular-nums">{fmt(summen.vkProM2)} €/m²</b></div>
          {(summen.ekAbsolut !== 0 || summen.vkAbsolut !== 0) && (
            <div>absolut: EK <b className="tabular-nums">{fmtEuro(summen.ekAbsolut)}</b> · VK <b className="tabular-nums">{fmtEuro(summen.vkAbsolut)}</b></div>
          )}
          {hatIst && <div>Ist VK: <b className="tabular-nums">{fmt(istSumme)} €/m²</b></div>}
          {summen.vkAbgeleitetAnzahl > 0 && (
            <div className="font-semibold text-amber-700">
              ⚠ {summen.vkAbgeleitetAnzahl} Zeile(n) ohne VK — Verkaufspreis aus EK × {fmt(bd.vkFaktor)} abgeleitet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
