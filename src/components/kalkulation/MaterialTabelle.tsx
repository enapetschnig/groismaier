// ============================================================================
// MaterialTabelle — Material-Zeilen eines Aufbaus mit den 3 Zeilenmodi des
// Originals (DB / Manuell / Berechnet). Erweiterung ggü. dem HTML-Tool:
// "+ Zeile" (dort fix 10 Zeilen).
//
// Modus-Zyklus je Zeile: DB → Manuell → (nur Decke/Dach: Berechnet) → DB;
// jeder Wechsel setzt die Zeile zurück (wie Original).
//
// FREIE POSITIONEN (Kundenwunsch 2026-07-22): Kategorie und Artikel sind im
// DB-Modus keine reinen Dropdowns mehr, sondern Comboboxen — man wählt einen
// Katalog-Eintrag ODER tippt einen neuen Namen ein („… neu anlegen"). Frei
// eingetippte Namen gelten nur in dieser Kalkulation und werden mit dem Badge
// „neu" gekennzeichnet; die Übernahme in den Katalog passiert im Editor
// (Knopf „In Katalog übernehmen" bzw. Abfrage beim Speichern).
//
// Die Nachkalkulation (Ist VK / Diff) wurde hier ENTFERNT — sie passiert erst
// nach der Abrechnung auf der eigenen Seite /nachkalkulation. Das Feld
// `actualVK` bleibt im Datenmodell erhalten (Altdaten), wird aber nicht mehr
// angezeigt.
//
// Zwei Darstellungen:
//   ≥ sm  Tabelle wie bisher (Büro/Desktop)
//   < sm  gestapelte Karten mit 44-px-Feldern (Baustelle/Handy). Dort werden
//         nur befüllte Zeilen + EINE freie Zeile gezeigt — sonst müsste man
//         sich am Handy durch 10 leere Zeilen scrollen.
// ============================================================================
import { useState } from "react";
import { Check, ChevronsUpDown, Database, Grid3x3, Pencil, Plus, X } from "lucide-react";
import {
  KalkModule, MaterialRow, Betriebsdaten, calcMaterialRow, calcMaterialSummen,
  newMaterialRow, fmt, fmtEuro, num,
} from "@/lib/kalkulationEngine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { KatalogKategorie, findeArtikel, findeKategorie, normName } from "./useKalkKatalog";
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
  num(r.ekPrice) === 0 && num(r.vkPrice) === 0;

/** Badge an frei eingetippten Namen — der Chef muss sie wiedererkennen. */
const NeuBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "shrink-0 rounded border border-amber-400 bg-amber-100 px-1 text-[9px] font-bold uppercase leading-4 text-amber-800",
      className,
    )}
    title="Frei eingetippt — steht noch nicht im Katalog"
  >neu</span>
);

interface ComboProps {
  value: string;
  optionen: { name: string; hinweis?: string }[];
  placeholder: string;
  ariaLabel: string;
  /** true: der eingetragene Name steht nicht im Katalog → Badge „neu". */
  frei: boolean;
  className?: string;
  disabled?: boolean;
  /** Eintrag aus dem Katalog gewählt (Preise werden übernommen). */
  onKatalog: (name: string) => void;
  /** Neuer Name frei eingetippt. */
  onFrei: (name: string) => void;
  onLeeren: () => void;
}

/**
 * Combobox mit Freitext: Katalog-Eintrag wählen ODER neuen Namen eintippen.
 * Bewusst als Popover (Portal) umgesetzt — ein absolut positioniertes Menü
 * würde im horizontal scrollenden Tabellen-Container abgeschnitten.
 */
function KatalogCombobox({
  value, optionen, placeholder, ariaLabel, frei, className, disabled,
  onKatalog, onFrei, onLeeren,
}: ComboProps) {
  const [open, setOpen] = useState(false);
  const [suche, setSuche] = useState("");
  const text = suche.trim();
  // Eigene Filterung (shouldFilter={false}): die Fuzzy-Suche von cmdk würde den
  // „neu anlegen"-Eintrag je nach Tippfehler wegfiltern.
  const treffer = text
    ? optionen.filter((o) => o.name.toLowerCase().includes(text.toLowerCase()))
    : optionen;
  const exakt = optionen.some((o) => normName(o.name) === normName(text));

  const waehlen = (fn: () => void) => { fn(); setSuche(""); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSuche(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          title={value || placeholder}
          className={cn(
            "kb-input flex min-h-0 w-full items-center gap-1 px-2 py-0 text-left text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          {value && frei && <NeuBadge />}
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,340px)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={suche}
            onValueChange={setSuche}
            placeholder="Suchen oder neu eintippen …"
          />
          <CommandList className="max-h-[45vh]">
            {text && !exakt && (
              <CommandGroup heading="Frei eintragen">
                <CommandItem
                  value={`__neu__${text}`}
                  onSelect={() => waehlen(() => onFrei(text))}
                  className="min-h-[44px] sm:min-h-[32px]"
                >
                  <Plus className="mr-2 h-4 w-4 shrink-0 text-kb-green" />
                  <span className="truncate">„{text}“ neu anlegen</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading={treffer.length ? "Katalog" : undefined}>
              {value && (
                <CommandItem
                  value="__leeren__"
                  onSelect={() => waehlen(onLeeren)}
                  className="min-h-[44px] text-muted-foreground sm:min-h-[32px]"
                >
                  <X className="mr-2 h-4 w-4 shrink-0" /> Eintrag leeren
                </CommandItem>
              )}
              {treffer.map((o) => (
                <CommandItem
                  key={o.name}
                  value={o.name}
                  onSelect={() => waehlen(() => onKatalog(o.name))}
                  className="min-h-[44px] sm:min-h-[32px]"
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", normName(o.name) === normName(value) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.name}</span>
                  {o.hinweis && <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">{o.hinweis}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {treffer.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                {text ? "Kein Katalog-Eintrag — oben neu anlegen." : "Katalog ist leer."}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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

  // Katalog-Kategorie gewählt: Artikel + Preise gehören zur alten Kategorie und
  // werden zurückgesetzt (inkl. Ist-VK aus Altdaten, der immer zum Artikel der
  // Zeile gehört).
  const selectKategorie = (idx: number, katName: string) =>
    onPatchRow(idx, { category: katName, product: "", ekPrice: 0, vkPrice: 0, actualVK: null });

  // Freie Kategorie: nur umbenennen. Der Anwender tippt hier ein eigenes
  // Kapitel — bereits erfasste Artikel/Preise der Zeile dürfen dabei nicht
  // verlorengehen.
  const freieKategorie = (idx: number, katName: string) =>
    onPatchRow(idx, { category: katName });

  const selectArtikel = (idx: number, row: MaterialRow, artikelName: string) => {
    const art = findeArtikel(kategorien, row.category, artikelName);
    // Preise aus dem Katalog in die Zeile kopieren; bleiben editierbar
    // (deckt "???"-Artikel ohne Preis und den editierbaren Riegel-m³-Preis ab).
    onPatchRow(idx, {
      product: artikelName, ekPrice: num(art?.ek), vkPrice: num(art?.vk),
      actualVK: artikelName === row.product ? row.actualVK : null,
    });
  };

  // Freier Artikel: Bezeichnung übernehmen, Preise stehen lassen — sie werden
  // hier von Hand erfasst (EK/VK-Felder der Zeile).
  const freierArtikel = (idx: number, artikelName: string) =>
    onPatchRow(idx, { product: artikelName });

  /** Rechenwerte + Modus-Flags einer Zeile (für beide Darstellungen). */
  const info = (row: MaterialRow) => {
    const erg = calcMaterialRow(row, m, bd);
    return {
      erg,
      istRiegel: !row.manual && !row.calc && row.product.startsWith("Riegelkonstruktion"),
      istDaemm: !row.manual && !row.calc && row.category === "Dämmstoffe",
      // Frei eingetippt = steht (noch) nicht im Katalog.
      katFrei: !!row.category && !findeKategorie(kategorien, row.category),
      artFrei: !!row.product && !findeArtikel(kategorien, row.category, row.product),
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

  const kategorieOptionen = kategorien.map((k) => ({ name: k.name }));
  const artikelOptionen = (row: MaterialRow) =>
    (findeKategorie(kategorien, row.category)?.artikel || []).map((a) => ({
      name: a.name,
      hinweis: a.ek === null && a.vk === null ? "Preis manuell" : undefined,
    }));

  // Bewusst Render-FUNKTIONEN statt lokaler Komponenten: eine im Render
  // definierte Komponente ist bei jedem Durchlauf ein neuer Typ — React würde
  // die Combobox samt geöffnetem Popover neu montieren, sobald sich irgendwo
  // in der Karte etwas ändert.
  /** Kategorie-Combobox einer Zeile (Höhe je Darstellung). */
  const kategorieFeld = (idx: number, row: MaterialRow, hoehe: string) => (
    <KatalogCombobox
      value={row.category}
      optionen={kategorieOptionen}
      placeholder="Kategorie wählen oder eintippen"
      ariaLabel="Kategorie"
      frei={info(row).katFrei}
      className={hoehe}
      onKatalog={(n) => selectKategorie(idx, n)}
      onFrei={(n) => freieKategorie(idx, n)}
      onLeeren={() => selectKategorie(idx, "")}
    />
  );

  const artikelFeld = (idx: number, row: MaterialRow, hoehe: string) => (
    <KatalogCombobox
      value={row.product}
      optionen={artikelOptionen(row)}
      placeholder={row.category ? "Artikel wählen oder eintippen" : "zuerst Kategorie"}
      ariaLabel="Artikel"
      frei={info(row).artFrei}
      className={hoehe}
      disabled={!row.category}
      onKatalog={(n) => selectArtikel(idx, row, n)}
      onFrei={(n) => freierArtikel(idx, n)}
      onLeeren={() => onPatchRow(idx, { product: "", actualVK: null })}
    />
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
      {row.manual && r.artFrei && (
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-800">
          <NeuBadge /> steht noch nicht im Katalog
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
                  {row.manual ? "Manuell (€-Beträge)" : row.calc ? "Holz berechnen" : "Katalog / frei"}
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
                  {kategorieFeld(idx, row, "h-11")}
                  {artikelFeld(idx, row, "h-11")}
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
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------ Desktop: Tabelle */}
      <div className="hidden overflow-x-auto sm:block">
        {/* table-fixed: sonst fressen die (jetzt breiteren) Namensspalten die
            Preisfelder auf — EK/VK waren nur noch ~30 px schmal. */}
        <table className="w-full min-w-[440px] table-fixed text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-7 py-1" title="Zeilenmodus: Datenbank / Manuell / Berechnet" />
              <th className="py-1 pr-1 font-semibold">Kategorie</th>
              <th className="py-1 pr-1 font-semibold">Artikel</th>
              <th className="w-[74px] py-1 pr-1 text-right font-semibold">EK</th>
              <th className="w-[74px] py-1 pr-1 text-right font-semibold">VK</th>
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
                        {kategorieFeld(idx, row, "h-7 text-xs")}
                      </td>
                      <td className="py-1 pr-1">
                        {artikelFeld(idx, row, "h-7 text-xs")}
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
