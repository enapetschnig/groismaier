// ============================================================================
// EinstellungenTab — Tab "Einstellungen & Stammdaten":
//   1. Betriebsdaten-Editor (app_settings, Präfix kalk_ — globale Defaults)
//   2. Katalog-CRUD: Kategorien UND Artikel je Kategorie anlegen/ändern/löschen
//      (Material, Lohnlackierung, Aufpreise) — der Kunde pflegt beides selbst.
//
// Komfort wie im Original: wird bei einem Artikel nur der EK erfasst, wird der
// VK automatisch abgeleitet (Material: EK × 1,35; Lack: 3-seitig × 1,65).
// Hinweis: app_settings-Schreibrechte sind per RLS auf Administratoren
// beschränkt; der Katalog ist für alle Mitarbeiter editierbar.
// ============================================================================
import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { num, round4 } from "@/lib/kalkulationEngine";
import { KalkKatalog, KatalogArtikel, KatalogKategorie, artTable, katTable } from "./useKalkKatalog";

const BETRIEBSDATEN_FELDER: { key: string; label: string }[] = [
  { key: "kalk_mittellohn", label: "Mittellohn (€/h)" },
  { key: "kalk_stunden_pro_tag", label: "Tägliche Arbeitszeit (h)" },
  { key: "kalk_vk_faktor", label: "Faktor für VK-Zuschlag (Produkte)" },
  { key: "kalk_kran_stundensatz", label: "Krankosten pro Stunde (€)" },
  { key: "kalk_maut_frei_km", label: "Keine Maut bis (km)" },
  { key: "kalk_fahrt_bus", label: "Bus-Kosten pro km (€)" },
  { key: "kalk_fahrt_bus_maut", label: "Bus-Kosten pro km, Maut (€)" },
  { key: "kalk_fahrt_lkw", label: "LKW-Kosten pro km (€)" },
  { key: "kalk_fahrt_lkw_maut", label: "LKW-Kosten pro km, Maut (€)" },
  { key: "kalk_riegel_abstand", label: "Lattungsabstand Riegelkonstruktion (cm)" },
  { key: "kalk_riegel_brett_dicke", label: "Dicke der Riegelbretter (cm)" },
  { key: "kalk_lack_vierseitig_faktor", label: "Lackierung: Faktor 4-seitig" },
  { key: "kalk_lack_kunde_satz", label: "Lackierung: Farbe beigestellt (€/m²)" },
  { key: "kalk_lack_farbwechsel", label: "Lackierung: Farbwechsel (€)" },
  { key: "kalk_lack_dimension", label: "Lackierung: Dimension/Farbton >50mm (€)" },
  { key: "kalk_lack_anfahrt_km", label: "Lackierung: Anfahrt (€/km)" },
  { key: "kalk_lack_fahrzeit_h", label: "Lackierung: Fahrzeit (€/h)" },
];

const TYP_BLOCKS: { typ: KatalogKategorie["typ"]; titel: string; ekLabel: string; vkLabel: string; hinweis: string }[] = [
  { typ: "material", titel: "Produkte (Aufbau Kalkulation)", ekLabel: "EK (€)", vkLabel: "VK (€)", hinweis: "VK leer lassen → automatisch EK × VK-Faktor (1,35). Artikel ganz ohne Preis erscheinen als „Preis manuell“." },
  { typ: "lack", titel: "Produkte (Lohnlackierung)", ekLabel: "3-seitig (€/m²)", vkLabel: "4-seitig (€/m²)", hinweis: "4-seitig leer lassen → automatisch 3-seitig × 1,65. „Farbe beigestellt“ ist der globale Satz in den Betriebsdaten." },
  { typ: "aufpreis", titel: "Auf-/Minderpreise (Lohnlackierung)", ekLabel: "", vkLabel: "Betrag (€/Einheit)", hinweis: "Minderpreise als negativen Betrag erfassen (z.B. -0,1)." },
];

/** Unkontrolliertes Eingabefeld, committet erst bei Blur (kein DB-Spam). */
function BlurInput({ value, onCommit, className, numeric }: {
  value: string; onCommit: (v: string) => void; className?: string; numeric?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      className={className || "kb-input h-8 min-h-0 px-2 py-1 text-sm"}
      inputMode={numeric ? "decimal" : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onCommit(text); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

const parseNum = (t: string): number | null => {
  const s = t.trim();
  if (s === "") return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function EinstellungenTab({ katalog }: { katalog: KalkKatalog }) {
  const { toast } = useToast();
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [savingBd, setSavingBd] = useState(false);
  const [neueKategorie, setNeueKategorie] = useState<Record<string, string>>({});

  useEffect(() => { setWerte(katalog.settings); }, [katalog.settings]);

  const fehler = (message: string) =>
    toast({ variant: "destructive", title: "Fehler", description: message });

  const saveBetriebsdaten = async () => {
    setSavingBd(true);
    const rows = BETRIEBSDATEN_FELDER
      .filter((f) => werte[f.key] !== undefined && werte[f.key] !== "")
      .map((f) => ({ key: f.key, value: String(werte[f.key]).replace(",", ".") }));
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setSavingBd(false);
    if (error) {
      fehler(`Betriebsdaten konnten nicht gespeichert werden (nur Administratoren): ${error.message}`);
      return;
    }
    toast({ title: "Gespeichert", description: "Betriebsdaten wurden aktualisiert." });
    katalog.reload();
  };

  const vkFaktor = num(werte["kalk_vk_faktor"]) || 1.35;
  const lackFaktor = num(werte["kalk_lack_vierseitig_faktor"]) || 1.65;

  const addKategorie = async (typ: KatalogKategorie["typ"]) => {
    const name = (neueKategorie[typ] || "").trim();
    if (!name) return;
    if (katalog.kategorien.some((k) => k.typ === typ && k.name.toLowerCase() === name.toLowerCase())) {
      fehler(`Kategorie „${name}“ existiert bereits.`);
      return;
    }
    const maxSort = Math.max(0, ...katalog.kategorien.map((k) => k.sort));
    const { error } = await katTable().insert({ name, typ, einheit: "", sort: maxSort + 10 });
    if (error) { fehler(error.message); return; }
    setNeueKategorie((p) => ({ ...p, [typ]: "" }));
    katalog.reload();
  };

  const renameKategorie = async (kat: KatalogKategorie, name: string) => {
    if (!name.trim()) return;
    const { error } = await katTable().update({ name: name.trim() }).eq("id", kat.id);
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  const deleteKategorie = async (kat: KatalogKategorie) => {
    if (!window.confirm(`Kategorie „${kat.name}“ samt ${kat.artikel.length} Artikel(n) löschen?\nBestehende Kalkulationen behalten ihre kopierten Preise.`)) return;
    const { error } = await katTable().delete().eq("id", kat.id);
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  const addArtikel = async (kat: KatalogKategorie) => {
    const maxSort = Math.max(0, ...kat.artikel.map((a) => a.sort));
    const { error } = await artTable().insert({
      kategorie_id: kat.id, name: "Neuer Artikel", einheit: kat.einheit || "", sort: maxSort + 10,
    });
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  const updateArtikel = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await artTable().update(patch).eq("id", id);
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  const deleteArtikel = async (a: KatalogArtikel) => {
    if (!window.confirm(`Artikel „${a.name}“ löschen?`)) return;
    const { error } = await artTable().delete().eq("id", a.id);
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  /** EK committen; VK automatisch ableiten, wenn er noch leer ist. */
  const commitEk = (a: KatalogArtikel, typ: KatalogKategorie["typ"], text: string) => {
    const ek = parseNum(text);
    const patch: Record<string, unknown> = { ek };
    if (ek !== null && (a.vk === null || a.vk === 0)) {
      patch.vk = round4(ek * (typ === "lack" ? lackFaktor : vkFaktor));
    }
    updateArtikel(a.id, patch);
  };

  return (
    <div className="space-y-6">
      {/* Betriebsdaten */}
      <div className="kb-panel">
        <div className="border-b px-4 py-2.5 text-sm font-bold">Allgemeine Betriebsdaten (globale Standardwerte)</div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {BETRIEBSDATEN_FELDER.map((f) => (
            <label key={f.key} className="block text-xs">
              <span className="mb-0.5 block text-muted-foreground">{f.label}</span>
              <BlurInput
                numeric
                value={werte[f.key] ?? ""}
                onCommit={(v) => setWerte((p) => ({ ...p, [f.key]: v }))}
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end border-t px-4 py-2.5">
          <button type="button" className="kb-btn kb-btn-primary-green" onClick={saveBetriebsdaten} disabled={savingBd}>
            <Save className="h-4 w-4 text-white" /> {savingBd ? "Wird gespeichert …" : "Änderungen speichern"}
          </button>
        </div>
      </div>

      {/* Katalog je Typ */}
      {TYP_BLOCKS.map((block) => {
        const kats = katalog.kategorien.filter((k) => k.typ === block.typ);
        return (
          <div key={block.typ} className="kb-panel">
            <div className="border-b px-4 py-2.5 text-sm font-bold">{block.titel}</div>
            <div className="space-y-4 p-4">
              <p className="text-xs text-muted-foreground">{block.hinweis}</p>
              {kats.map((kat) => (
                <div key={kat.id} className="rounded border">
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
                    <BlurInput
                      value={kat.name}
                      onCommit={(v) => renameKategorie(kat, v)}
                      className="kb-input h-7 min-h-0 max-w-xs px-2 py-1 text-sm font-semibold"
                    />
                    <span className="flex-1" />
                    <button type="button" className="kb-btn h-7 min-h-0 px-2 py-1 text-xs" onClick={() => addArtikel(kat)}>
                      <Plus className="h-3.5 w-3.5 text-kb-green" /> Artikel
                    </button>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteKategorie(kat)}
                      title="Kategorie löschen"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-1 font-semibold">Bezeichnung</th>
                        {block.typ !== "aufpreis" && <th className="w-28 px-2 py-1 text-right font-semibold">{block.ekLabel}</th>}
                        <th className="w-28 px-2 py-1 text-right font-semibold">{block.vkLabel}</th>
                        <th className="w-24 px-2 py-1 font-semibold">Einheit</th>
                        <th className="w-9 px-2 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {kat.artikel.length === 0 && (
                        <tr><td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">Noch keine Artikel.</td></tr>
                      )}
                      {kat.artikel.map((a) => (
                        <tr key={a.id} className="border-b last:border-b-0">
                          <td className="px-2 py-1">
                            <BlurInput value={a.name} onCommit={(v) => v.trim() && updateArtikel(a.id, { name: v.trim() })}
                              className="kb-input h-7 min-h-0 px-2 py-1 text-xs" />
                          </td>
                          {block.typ !== "aufpreis" && (
                            <td className="px-2 py-1">
                              <BlurInput numeric value={a.ek === null ? "" : String(a.ek).replace(".", ",")}
                                onCommit={(v) => commitEk(a, block.typ, v)}
                                className="kb-input h-7 min-h-0 px-2 py-1 text-right text-xs tabular-nums" />
                            </td>
                          )}
                          <td className="px-2 py-1">
                            <BlurInput numeric value={a.vk === null ? "" : String(a.vk).replace(".", ",")}
                              onCommit={(v) => updateArtikel(a.id, { vk: parseNum(v) })}
                              className="kb-input h-7 min-h-0 px-2 py-1 text-right text-xs tabular-nums" />
                          </td>
                          <td className="px-2 py-1">
                            <BlurInput value={a.einheit || ""} onCommit={(v) => updateArtikel(a.id, { einheit: v })}
                              className="kb-input h-7 min-h-0 px-2 py-1 text-xs" />
                          </td>
                          <td className="px-2 py-1">
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => deleteArtikel(a)}
                              title="Artikel löschen"
                            ><Trash2 className="h-3.5 w-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="kb-input h-8 min-h-0 max-w-xs px-2 py-1 text-sm"
                  placeholder="Neue Kategorie …"
                  value={neueKategorie[block.typ] || ""}
                  onChange={(e) => setNeueKategorie((p) => ({ ...p, [block.typ]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addKategorie(block.typ); }}
                />
                <button type="button" className="kb-btn h-8 min-h-0 px-2 py-1 text-xs" onClick={() => addKategorie(block.typ)}>
                  <Plus className="h-3.5 w-3.5 text-kb-green" /> Neue Kategorie
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
