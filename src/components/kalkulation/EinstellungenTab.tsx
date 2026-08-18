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
import { Plus, Save, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { round4 } from "@/lib/kalkulationEngine";
import { formatForInput, parseDecimal } from "@/lib/num";
import { KalkKatalog, KatalogArtikel, KatalogKategorie, artTable, katTable, mengenEinheit } from "./useKalkKatalog";

const ALLGEMEINE_FELDER: { key: string; label: string; hinweis?: string }[] = [
  { key: "kalk_mittellohn", label: "Mittellohn (€/h)" },
  {
    key: "kalk_selbstkosten_lohn",
    label: "Selbstkosten Lohn (€/h)",
    hinweis: "Echte Lohnkosten inkl. Nebenkosten — Basis für den Deckungsbeitrag, nicht der verrechnete Mittellohn.",
  },
  {
    key: "kalk_warn_marge_prozent",
    label: "Warnschwelle Marge (%)",
    hinweis: "Liegt die Marge einer Kalkulation darunter, warnt der Editor.",
  },
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
];

// Kundenwunsch 08/2026 („Lackierung:Fahrzeit???? Ich glaub die müssen weg"):
// Die Lack-Sätze gehören nicht zu den allgemeinen Betriebsdaten — sie wirken
// ausschließlich im Tab „Oberflächenbeschichtung". Statt sie zu löschen (der
// Lack-Tab braucht sie weiterhin) stehen sie in einem eigenen, standardmäßig
// zugeklappten Block.
const LACK_FELDER: { key: string; label: string; hinweis?: string }[] = [
  { key: "kalk_lack_vierseitig_faktor", label: "Faktor 4-seitig" },
  { key: "kalk_lack_kunde_satz", label: "Farbe beigestellt (€/m²)" },
  { key: "kalk_lack_farbwechsel", label: "Farbwechsel (€)" },
  { key: "kalk_lack_dimension", label: "Dimension/Farbton >50mm (€)" },
  { key: "kalk_lack_anfahrt_km", label: "Anfahrt (€/km)", hinweis: "Nur Oberflächenbeschichtung: Anfahrt PKW/Anhänger in km." },
  { key: "kalk_lack_fahrzeit_h", label: "Fahrzeit (€/h)", hinweis: "Nur Oberflächenbeschichtung: Fahrzeit der Mitarbeiter in Stunden." },
];

const BETRIEBSDATEN_FELDER = [...ALLGEMEINE_FELDER, ...LACK_FELDER];

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
      className={className || "kb-input h-11 min-h-0 px-2 py-1 text-sm sm:h-8"}
      inputMode={numeric ? "decimal" : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onCommit(text); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

// Edge-Case-Review 2026-07-21: Hier stand `parseFloat(s.replace(",", "."))`.
// Ein Katalogpreis "1.250" (österreichische Schreibweise mit Tausenderpunkt)
// wurde damit zu 1,25 € — Faktor 1000 daneben, ohne jede Warnung. Jetzt über
// parseDecimal() aus src/lib/num.ts (versteht "1.250", "1.250,50" und "12,50").
const parseNum = (t: string): number | null => parseDecimal(t);

/** DB-Wert (immer mit Punkt) für die Anzeige im Feld: 1250.5 → "1250,5". */
const dbZuAnzeige = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? formatForInput(n) : String(v);
};

export function EinstellungenTab({ katalog }: { katalog: KalkKatalog }) {
  const { toast } = useToast();
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [savingBd, setSavingBd] = useState(false);
  const [neueKategorie, setNeueKategorie] = useState<Record<string, string>>({});
  /** Kategorie-Filter oben (Kundenwunsch 3.2): eine Kategorie wählen statt
   *  durch alle zu scrollen. */
  const [katFilter, setKatFilter] = useState<string>("alle");
  /** Lack-Sätze standardmäßig zugeklappt — sie gehören nicht zum Alltag. */
  const [lackOffen, setLackOffen] = useState(false);

  // Die DB speichert Zahlen immer mit Punkt; im Feld steht die österreichische
  // Schreibweise mit Komma (sonst liest der Anwender "0.85" als 85 Cent falsch
  // ab und tippt beim Korrigieren "0,85" ein, was früher verlorenging).
  useEffect(() => {
    const anzeige: Record<string, string> = {};
    for (const [k, v] of Object.entries(katalog.settings)) anzeige[k] = dbZuAnzeige(v);
    setWerte(anzeige);
  }, [katalog.settings]);

  const fehler = (message: string) =>
    toast({ variant: "destructive", title: "Fehler", description: message });

  const saveBetriebsdaten = async () => {
    const befuellt = BETRIEBSDATEN_FELDER.filter(
      (f) => werte[f.key] !== undefined && String(werte[f.key]).trim() !== "",
    );
    // Unlesbare Eingaben VOR dem Speichern abfangen — sonst landet ein
    // stillschweigendes 0 (bzw. ein Postgres-Fehler) in den Stammdaten.
    const ungueltig = befuellt.filter((f) => parseDecimal(werte[f.key]) === null);
    if (ungueltig.length > 0) {
      fehler(`Bitte Zahlen eingeben — ungültig: ${ungueltig.map((f) => f.label).join(", ")}`);
      return;
    }
    const negativ = befuellt.filter((f) => (parseDecimal(werte[f.key]) as number) < 0);
    if (negativ.length > 0) {
      fehler(`Negative Werte sind hier nicht sinnvoll: ${negativ.map((f) => f.label).join(", ")}`);
      return;
    }
    // Geleerte Felder, für die ein Wert gespeichert ist: Eintrag löschen →
    // der Standardwert gilt wieder. Vorher war das Leeren ein stilles No-Op —
    // nach dem Speichern stand der alte Wert wieder im Feld ("Ich hab die
    // Zahl gelöscht und sie kam zurück", Kundenmeldung 08/2026).
    const geleert = BETRIEBSDATEN_FELDER.filter(
      (f) => String(werte[f.key] ?? "").trim() === "" && katalog.settings[f.key] !== undefined,
    );
    setSavingBd(true);
    const rows = befuellt.map((f) => ({ key: f.key, value: String(parseDecimal(werte[f.key])) }));
    const { error } = rows.length > 0
      ? await supabase.from("app_settings").upsert(rows, { onConflict: "key" })
      : { error: null };
    const { error: delError } = geleert.length > 0
      ? await supabase.from("app_settings").delete().in("key", geleert.map((f) => f.key))
      : { error: null };
    setSavingBd(false);
    if (error || delError) {
      fehler(`Betriebsdaten konnten nicht gespeichert werden (nur Administratoren): ${(error || delError)!.message}`);
      return;
    }
    toast({
      title: "Gespeichert",
      description: geleert.length > 0
        ? `Betriebsdaten aktualisiert. Geleerte Felder gelten wieder mit dem Standardwert: ${geleert.map((f) => f.label).join(", ")}.`
        : "Betriebsdaten wurden aktualisiert.",
    });
    katalog.reload();
  };

  const vkFaktor = (parseDecimal(werte["kalk_vk_faktor"]) ?? 0) || 1.35;
  const lackFaktor = (parseDecimal(werte["kalk_lack_vierseitig_faktor"]) ?? 0) || 1.65;

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
    // Registry-Eintrag (falls vorhanden) umbenennen …
    if (!kat.id.startsWith("pg:")) {
      const { error } = await katTable().update({ name: name.trim() }).eq("id", kat.id);
      if (error) { fehler(error.message); return; }
    }
    // … und bei Material auch die produktgruppe im Artikelstamm mitziehen
    // (EIN Katalog: die Gruppe der Templates IST die Kategorie). Über die
    // KONKRETEN Artikel-IDs statt eq(produktgruppe): so treffen wir auch
    // Case-Varianten ("dämmstoffe" vs "Dämmstoffe") und die "Sonstige"-
    // Gruppe (produktgruppe NULL/leer), die ein exakter Match verfehlt.
    if (kat.typ === "material") {
      const ids = kat.artikel.filter((a) => a.quelle === "template").map((a) => a.id);
      if (ids.length > 0) {
        const { error } = await supabase
          .from("invoice_templates")
          .update({ produktgruppe: name.trim(), kategorie: name.trim() })
          .in("id", ids);
        if (error) { fehler(error.message); return; }
      }
    }
    katalog.reload();
  };

  const deleteKategorie = async (kat: KatalogKategorie) => {
    const templateArtikel = kat.artikel.filter((a) => a.quelle === "template");
    if (kat.typ === "material" && templateArtikel.length > 0) {
      fehler(`Kategorie „${kat.name}“ enthält ${templateArtikel.length} Artikel aus dem Artikelstamm — bitte zuerst die Artikel löschen oder in eine andere Gruppe verschieben.`);
      return;
    }
    if (!window.confirm(`Kategorie „${kat.name}“ samt ${kat.artikel.length} Artikel(n) löschen?\nBestehende Kalkulationen behalten ihre kopierten Preise.`)) return;
    if (!kat.id.startsWith("pg:")) {
      const { error } = await katTable().delete().eq("id", kat.id);
      if (error) { fehler(error.message); return; }
    }
    katalog.reload();
  };

  /**
   * Artikel eine Position nach oben/unten (Kundenwunsch 3.1) — tauscht die
   * sort-Werte mit dem Nachbarn. Artikel aus dem Artikelstamm schreiben in
   * invoice_templates.sort, Alt-Artikel in kalkulation_artikel.sort.
   */
  const verschiebeArtikel = async (kat: KatalogKategorie, idx: number, richtung: -1 | 1) => {
    const nachbarIdx = idx + richtung;
    if (nachbarIdx < 0 || nachbarIdx >= kat.artikel.length) return;
    const a = kat.artikel[idx];
    const b = kat.artikel[nachbarIdx];
    // Gleiche sort-Werte (Altbestand) sauber auseinanderziehen.
    const sortA = a.sort === b.sort ? b.sort + (richtung === -1 ? -1 : 1) : b.sort;
    const sortB = a.sort === b.sort ? a.sort : a.sort;
    const schreibe = async (art: KatalogArtikel, sort: number) =>
      art.quelle === "template"
        ? (supabase.from("invoice_templates").update({ sort } as never).eq("id", art.id) as any)
        : artTable().update({ sort }).eq("id", art.id);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([schreibe(a, sortA), schreibe(b, sortB)]);
    if (e1 || e2) {
      fehler((e1 || e2)!.message);
      return;
    }
    katalog.reload();
  };

  const addArtikel = async (kat: KatalogKategorie) => {
    // EIN Katalog: neue MATERIAL-Artikel entstehen im Artikelstamm
    // (invoice_templates, Gruppe = produktgruppe) — lack/aufpreis wie bisher
    // im Spezial-Katalog.
    if (kat.typ === "material") {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("invoice_templates").insert({
        user_id: user?.id,
        name: "Neuer Artikel",
        beschreibung: "Neuer Artikel",
        kurzbezeichnung: "Neuer Artikel",
        produktgruppe: kat.name,
        kategorie: kat.name,
        einheit: mengenEinheit(kat.einheit) || "m²",
        ist_aktiv: true,
      } as any);
      if (error) { fehler(error.message); return; }
      katalog.reload();
      return;
    }
    const maxSort = Math.max(0, ...kat.artikel.map((a) => a.sort));
    const { error } = await artTable().insert({
      kategorie_id: kat.id, name: "Neuer Artikel", einheit: kat.einheit || "", sort: maxSort + 10,
    });
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  /**
   * kalk-Patch (name/ek/vk/einheit) in Artikelstamm-Spalten übersetzen.
   * Preise auf 2 NK gerundet: vk_netto/ek_netto sind numeric(12,2) — die
   * Spiegelfelder (netto_preis/einzelpreis) nicht. Ungerundet liefe der
   * Preis in der Kalkulation (liest vk_netto) und in Belegen auseinander.
   */
  const rund2 = (v: unknown): number | null =>
    v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100;
  const templatePatch = (patch: Record<string, unknown>): Record<string, unknown> => {
    const t: Record<string, unknown> = {};
    if ("name" in patch) {
      t.name = patch.name; t.kurzbezeichnung = patch.name; t.beschreibung = patch.name;
    }
    if ("ek" in patch) t.ek_netto = rund2(patch.ek);
    if ("vk" in patch) {
      const vk = rund2(patch.vk);
      t.vk_netto = vk; t.netto_preis = vk; t.einzelpreis = vk;
    }
    if ("einheit" in patch) t.einheit = patch.einheit;
    return t;
  };

  const updateArtikel = async (id: string, patch: Record<string, unknown>, quelle?: "template" | "kalk") => {
    const { error } = quelle === "template"
      ? await supabase.from("invoice_templates").update(templatePatch(patch) as any).eq("id", id)
      : await artTable().update(patch).eq("id", id);
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  const deleteArtikel = async (a: KatalogArtikel) => {
    if (!window.confirm(`Artikel „${a.name}“ löschen?`)) return;
    // Artikelstamm: weich deaktivieren — auf Templates können Belege/Sets
    // verweisen; ist_aktiv=false blendet sie überall aus.
    const { error } = a.quelle === "template"
      ? await supabase.from("invoice_templates").update({ ist_aktiv: false } as any).eq("id", a.id)
      : await artTable().delete().eq("id", a.id);
    if (error) { fehler(error.message); return; }
    katalog.reload();
  };

  /**
   * Preiseingabe prüfen: leer = "kein Preis" (null), unlesbar wird abgelehnt
   * (früher wurde daraus stillschweigend NaN/0). Negative Preise sind nur bei
   * Auf-/Minderpreisen sinnvoll.
   */
  const preisEingabe = (text: string, typ: KatalogKategorie["typ"]): number | null | undefined => {
    if (text.trim() === "") return null;
    const n = parseNum(text);
    if (n === null) {
      fehler(`„${text}“ ist keine Zahl. Beispiel: 1.250,50 oder 12,5`);
      return undefined;
    }
    if (n < 0 && typ !== "aufpreis") {
      fehler("Negative Preise sind hier nicht zulässig (nur bei Auf-/Minderpreisen).");
      return undefined;
    }
    return n;
  };

  /**
   * Aktuellen VK frisch aus der DB lesen. Der Snapshot `a` stammt vom letzten
   * reload() und kann beim Blur-Wechsel VK-Feld → EK-Feld veraltet sein — die
   * VK-Ableitung entschied dann auf altem Stand und überschrieb einen gerade
   * eingetippten VK stillschweigend mit EK × Faktor (Kundenmeldung 08/2026:
   * "Zahl gelöscht und neu eingegeben — die Verbindung war gelöst").
   */
  const leseAktuellenVk = async (a: KatalogArtikel): Promise<number | null | "unbekannt"> => {
    if (a.quelle === "template") {
      const { data, error } = (await supabase
        .from("invoice_templates")
        .select("vk_netto, netto_preis, einzelpreis")
        .eq("id", a.id)
        .maybeSingle()) as { data: Record<string, unknown> | null; error: unknown };
      // Lesefehler (Netz/RLS) heißt NICHT "kein VK" — sonst würde ein
      // gepflegter VK bei einem WLAN-Aussetzer mit EK × Faktor überschrieben.
      if (error || !data) return "unbekannt";
      const vk = data.vk_netto ?? data.netto_preis ?? data.einzelpreis;
      if (vk === null || vk === undefined) return null;
      // netto_preis/einzelpreis haben DB-Default 0: Ist vk_netto leer und die
      // Spiegel stehen auf 0, wurde nie ein VK gepflegt (frischer Artikel) —
      // dann darf abgeleitet werden. Ein BEWUSST gesetzter VK 0 schreibt
      // alle drei Spalten und behält vk_netto = 0.
      if (Number(vk) === 0 && (data.vk_netto === null || data.vk_netto === undefined)) return null;
      return Number(vk);
    }
    const { data, error } = await artTable().select("vk").eq("id", a.id).maybeSingle();
    if (error) return "unbekannt";
    const vk = (data as Record<string, unknown> | null)?.vk;
    return vk === null || vk === undefined ? null : Number(vk);
  };

  /** EK committen; VK automatisch ableiten, wenn er noch leer ist — mit Meldung. */
  const commitEk = async (a: KatalogArtikel, typ: KatalogKategorie["typ"], text: string) => {
    const ek = preisEingabe(text, typ);
    if (ek === undefined) return;
    const patch: Record<string, unknown> = { ek };
    // Nur bei WIRKLICH leerem VK (null, frisch gelesen) ableiten. Ein VK von
    // 0 bleibt stehen (kann Absicht sein), "unbekannt" (Lesefehler) leitet
    // sicherheitshalber NICHT ab, und die Ableitung wird gemeldet statt
    // still zu passieren.
    if (ek !== null && (await leseAktuellenVk(a)) === null) {
      const faktor = typ === "lack" ? lackFaktor : vkFaktor;
      const vk = round4(ek * faktor);
      patch.vk = vk;
      toast({
        title: "VK automatisch abgeleitet",
        description: `${a.name}: VK ${formatForInput(vk)} € = EK × ${formatForInput(faktor)} (Feld leer gelassen).`,
      });
    }
    updateArtikel(a.id, patch, a.quelle);
  };

  const commitVk = (a: KatalogArtikel, typ: KatalogKategorie["typ"], text: string) => {
    const vk = preisEingabe(text, typ);
    if (vk === undefined) return;
    updateArtikel(a.id, { vk }, a.quelle);
  };

  return (
    <div className="space-y-6">
      {/* Betriebsdaten */}
      <div className="kb-panel">
        <div className="border-b px-4 py-2.5 text-sm font-bold">Allgemeine Betriebsdaten (globale Standardwerte)</div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALLGEMEINE_FELDER.map((f) => (
            <label key={f.key} className="block text-xs" title={f.hinweis}>
              <span className="mb-0.5 block text-muted-foreground">{f.label}</span>
              <BlurInput
                numeric
                value={werte[f.key] ?? ""}
                onCommit={(v) => setWerte((p) => ({ ...p, [f.key]: v }))}
              />
              {f.hinweis && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{f.hinweis}</span>}
            </label>
          ))}
        </div>
        {/* Lack-Sätze ausgelagert (Kundenwunsch 08/2026): wirken NUR im Tab
            Oberflächenbeschichtung und standen zwischen den allgemeinen
            Betriebsdaten — "Lackierung: Fahrzeit????" war dort nicht
            erklärbar. Zugeklappt bleiben sie auffindbar, ohne zu stören. */}
        <div className="border-t">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
            onClick={() => setLackOffen((o) => !o)}
          >
            {lackOffen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Lackierung / Oberflächenbeschichtung — Sätze für den Tab „Oberflächenbeschichtung"
          </button>
          {lackOffen && (
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              {LACK_FELDER.map((f) => (
                <label key={f.key} className="block text-xs" title={f.hinweis}>
                  <span className="mb-0.5 block text-muted-foreground">{f.label}</span>
                  <BlurInput
                    numeric
                    value={werte[f.key] ?? ""}
                    onCommit={(v) => setWerte((p) => ({ ...p, [f.key]: v }))}
                  />
                  {f.hinweis && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{f.hinweis}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t px-4 py-2.5">
          <button type="button" className="kb-btn kb-btn-primary-green" onClick={saveBetriebsdaten} disabled={savingBd}>
            <Save className="h-4 w-4 text-white" /> {savingBd ? "Wird gespeichert …" : "Änderungen speichern"}
          </button>
        </div>
      </div>

      {/* Kategorie-Filter (Kundenwunsch 3.2): direkt zur gesuchten Kategorie
          springen statt durch alle Blöcke zu scrollen. */}
      <div className="kb-panel flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm font-semibold">Kategorie anzeigen:</span>
        <select
          className="kb-input h-9 min-h-0 max-w-xs px-2 text-sm"
          value={katFilter}
          onChange={(e) => setKatFilter(e.target.value)}
        >
          <option value="alle">Alle Kategorien</option>
          {katalog.kategorien.map((k) => (
            <option key={k.id} value={k.id}>{k.name} ({k.artikel.length})</option>
          ))}
        </select>
        {katFilter !== "alle" && (
          <button type="button" className="kb-btn h-9 min-h-0 px-2 text-xs" onClick={() => setKatFilter("alle")}>
            Filter aufheben
          </button>
        )}
      </div>

      {/* Katalog je Typ */}
      {TYP_BLOCKS.map((block) => {
        const kats = katalog.kategorien.filter((k) => k.typ === block.typ && (katFilter === "alle" || k.id === katFilter));
        if (kats.length === 0 && katFilter !== "alle") return null;
        return (
          <div key={block.typ} className="kb-panel">
            <div className="border-b px-4 py-2.5 text-sm font-bold">{block.titel}</div>
            <div className="space-y-4 p-4">
              <p className="text-xs text-muted-foreground">{block.hinweis}</p>
              {kats.map((kat) => (
                <div key={kat.id} className="min-w-0 rounded border">
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
                    <BlurInput
                      value={kat.name}
                      onCommit={(v) => renameKategorie(kat, v)}
                      className="kb-input h-11 min-h-0 min-w-0 max-w-xs px-2 py-1 text-sm font-semibold sm:h-7"
                    />
                    <span className="flex-1" />
                    <button type="button" className="kb-btn h-11 min-h-0 shrink-0 px-3 py-1 text-xs sm:h-7 sm:px-2" onClick={() => addArtikel(kat)}>
                      <Plus className="h-3.5 w-3.5 text-kb-green" /> Artikel
                    </button>
                    <button
                      type="button"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7"
                      onClick={() => deleteKategorie(kat)}
                      title="Kategorie löschen"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="w-14 px-1 py-1" />
                        <th className="px-2 py-1 font-semibold">Bezeichnung</th>
                        {block.typ !== "aufpreis" && <th className="w-28 px-2 py-1 text-right font-semibold">{block.ekLabel}</th>}
                        <th className="w-28 px-2 py-1 text-right font-semibold">{block.vkLabel}</th>
                        <th className="w-24 px-2 py-1 font-semibold">Einheit</th>
                        <th className="w-9 px-2 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {kat.artikel.length === 0 && (
                        <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Noch keine Artikel.</td></tr>
                      )}
                      {kat.artikel.map((a, aIdx) => (
                        <tr key={a.id} className="border-b last:border-b-0">
                          <td className="w-14 px-1 py-1">
                            {/* Reihenfolge verschieben (Kundenwunsch 3.1) */}
                            <span className="flex">
                              <button type="button" aria-label="Nach oben" disabled={aIdx === 0}
                                className="flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-25"
                                onClick={() => verschiebeArtikel(kat, aIdx, -1)}>
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" aria-label="Nach unten" disabled={aIdx === kat.artikel.length - 1}
                                className="flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-25"
                                onClick={() => verschiebeArtikel(kat, aIdx, 1)}>
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <BlurInput value={a.name} onCommit={(v) => v.trim() && updateArtikel(a.id, { name: v.trim() }, a.quelle)}
                              className="kb-input h-11 min-h-0 px-2 py-1 text-xs sm:h-7" />
                          </td>
                          {block.typ !== "aufpreis" && (
                            <td className="px-2 py-1">
                              <BlurInput numeric value={dbZuAnzeige(a.ek)}
                                onCommit={(v) => commitEk(a, block.typ, v)}
                                className="kb-input h-11 min-h-0 px-2 py-1 text-right text-xs tabular-nums sm:h-7" />
                            </td>
                          )}
                          <td className="px-2 py-1">
                            <BlurInput numeric value={dbZuAnzeige(a.vk)}
                              onCommit={(v) => commitVk(a, block.typ, v)}
                              className="kb-input h-11 min-h-0 px-2 py-1 text-right text-xs tabular-nums sm:h-7" />
                          </td>
                          <td className="px-2 py-1">
                            <BlurInput value={a.einheit || ""} onCommit={(v) => updateArtikel(a.id, { einheit: v }, a.quelle)}
                              className="kb-input h-11 min-h-0 px-2 py-1 text-xs sm:h-7" />
                          </td>
                          <td className="px-2 py-1">
                            <button
                              type="button"
                              className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7"
                              onClick={() => deleteArtikel(a)}
                              title="Artikel löschen"
                            ><Trash2 className="h-3.5 w-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="kb-input h-11 min-h-0 min-w-0 max-w-xs px-2 py-1 text-sm sm:h-8"
                  placeholder="Neue Kategorie …"
                  value={neueKategorie[block.typ] || ""}
                  onChange={(e) => setNeueKategorie((p) => ({ ...p, [block.typ]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addKategorie(block.typ); }}
                />
                <button type="button" className="kb-btn h-11 min-h-0 shrink-0 px-3 py-1 text-xs sm:h-8 sm:px-2" onClick={() => addKategorie(block.typ)}>
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
