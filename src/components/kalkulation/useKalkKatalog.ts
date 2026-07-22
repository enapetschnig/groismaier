// ============================================================================
// useKalkKatalog — lädt den Kalkulations-Katalog (Kategorien + Artikel aus
// kalkulation_kategorien / kalkulation_artikel) und die kalk_*-Betriebsdaten
// aus app_settings. Ersetzt die hartkodierten Seeds des alten iframe-Tools.
//
// Hinweis Typen: Die beiden Katalog-Tabellen (Migration
// 20260718110000_kalkulation_katalog.sql) fehlen — wie `kalkulationen` — in
// den generierten Supabase-Typen; daher wie im restlichen Modul mit
// `from("…" as never) as any` gecastet und lokal getippt.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KalkModule, num } from "@/lib/kalkulationEngine";

export interface KatalogArtikel {
  id: string;
  kategorie_id: string;
  name: string;
  ek: number | null;
  vk: number | null;
  einheit: string | null;
  sort: number;
  aktiv: boolean;
}

export interface KatalogKategorie {
  id: string;
  name: string;
  typ: "material" | "lack" | "aufpreis";
  einheit: string | null;
  sort: number;
  aktiv: boolean;
  artikel: KatalogArtikel[];
}

export const katTable = () => (supabase.from("kalkulation_kategorien" as never) as any);
export const artTable = () => (supabase.from("kalkulation_artikel" as never) as any);

export interface KalkKatalog {
  kategorien: KatalogKategorie[];
  materialKategorien: KatalogKategorie[];
  lackKategorien: KatalogKategorie[];
  /** Alle Auf-/Minderpreis-Artikel (über alle 'aufpreis'-Kategorien). */
  aufpreise: KatalogArtikel[];
  /** app_settings-Werte mit Präfix kalk_ (key → value als String). */
  settings: Record<string, string>;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useKalkKatalog(): KalkKatalog {
  const [kategorien, setKategorien] = useState<KatalogKategorie[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [katRes, artRes, setRes] = await Promise.all([
      katTable().select("id, name, typ, einheit, sort, aktiv").order("sort"),
      artTable().select("id, kategorie_id, name, ek, vk, einheit, sort, aktiv").order("sort"),
      supabase.from("app_settings").select("key, value").like("key", "kalk\\_%"),
    ]);
    const kats: KatalogKategorie[] = ((katRes.data as any[]) || [])
      .filter((k) => k.aktiv !== false)
      .map((k) => ({ ...k, artikel: [] as KatalogArtikel[] }));
    const byId = new Map(kats.map((k) => [k.id, k]));
    for (const a of ((artRes.data as any[]) || [])) {
      if (a.aktiv === false) continue;
      const kat = byId.get(a.kategorie_id);
      if (kat) kat.artikel.push({ ...a, ek: a.ek === null ? null : Number(a.ek), vk: a.vk === null ? null : Number(a.vk) });
    }
    const s: Record<string, string> = {};
    for (const row of setRes.data || []) s[row.key] = row.value;
    setKategorien(kats);
    setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const materialKategorien = useMemo(() => kategorien.filter((k) => k.typ === "material"), [kategorien]);
  const lackKategorien = useMemo(() => kategorien.filter((k) => k.typ === "lack"), [kategorien]);
  const aufpreise = useMemo(
    () => kategorien.filter((k) => k.typ === "aufpreis").flatMap((k) => k.artikel),
    [kategorien],
  );

  return { kategorien, materialKategorien, lackKategorien, aufpreise, settings, loading, reload };
}

// ============================================================================
// Freie (handgeschriebene) Positionen — Grundlage für die Katalog-Übernahme
// ----------------------------------------------------------------------------
// In der Materialzeile darf die Kategorie/der Artikel frei eingetippt werden.
// Solche Zeilen existieren zunächst NUR in dieser Kalkulation. Beim Speichern
// bzw. über „In Katalog übernehmen" werden sie eingesammelt und dem Anwender
// zur Übernahme in die Stammdaten angeboten.
// ============================================================================

/** Namensvergleich im Katalog: ohne Randleerzeichen und Groß-/Kleinschreibung. */
export const normName = (s: string | null | undefined): string => (s || "").trim().toLowerCase();

export const findeKategorie = (kategorien: KatalogKategorie[], name: string): KatalogKategorie | undefined =>
  normName(name) ? kategorien.find((k) => normName(k.name) === normName(name)) : undefined;

export const findeArtikel = (
  kategorien: KatalogKategorie[], kategorie: string, name: string,
): KatalogArtikel | undefined =>
  normName(name)
    ? findeKategorie(kategorien, kategorie)?.artikel.find((a) => normName(a.name) === normName(name))
    : undefined;

/** Eine frei eingetippte Position, die (noch) nicht im Katalog steht. */
export interface FreiePosition {
  /** Kategorie + Name normalisiert — identische Zeilen mehrerer Aufbauten fallen zusammen. */
  key: string;
  /** Eingetippte Kategorie ("" = gar keine erfasst). */
  kategorie: string;
  /** true: die Kategorie selbst steht auch noch nicht im Katalog. */
  kategorieFrei: boolean;
  name: string;
  ek: number | null;
  vk: number | null;
  einheit: string;
  /** Aufbauten, in denen die Position vorkommt (Anzeige im Dialog). */
  aufbauten: string[];
}

/**
 * Sammelt alle Materialzeilen, deren Artikel nicht im Katalog steht.
 *
 * Bewusst NICHT enthalten: Zeilen im Modus „Holz berechnen" (dort gibt es
 * keinen Artikelnamen, sondern Querschnitte) und Zeilen ohne Bezeichnung.
 * Ein Artikel gilt als neu, wenn er in SEINER Kategorie fehlt — derselbe Name
 * in einer anderen Kategorie ist ein anderer Artikel.
 */
export function sammleFreiePositionen(
  modules: Pick<KalkModule, "name" | "materialRows">[],
  kategorien: KatalogKategorie[],
): FreiePosition[] {
  const gefunden = new Map<string, FreiePosition>();
  (modules || []).forEach((m, i) => {
    const aufbau = (m.name || "").trim() || `Aufbau ${i + 1}`;
    for (const row of m.materialRows || []) {
      if (row.calc) continue;
      const name = (row.product || "").trim();
      if (!name) continue;
      const kategorie = (row.category || "").trim();
      if (findeArtikel(kategorien, kategorie, name)) continue; // steht schon im Katalog
      const key = `${normName(kategorie)}|${normName(name)}`;
      const vorhanden = gefunden.get(key);
      if (vorhanden) {
        if (!vorhanden.aufbauten.includes(aufbau)) vorhanden.aufbauten.push(aufbau);
        // Preise der ersten befüllten Zeile gewinnen (leere Zeilen ergänzen nichts).
        if (vorhanden.ek === null) vorhanden.ek = num(row.ekPrice) || null;
        if (vorhanden.vk === null) vorhanden.vk = num(row.vkPrice) || null;
        continue;
      }
      const kat = findeKategorie(kategorien, kategorie);
      gefunden.set(key, {
        key,
        kategorie,
        kategorieFrei: kategorie !== "" && !kat,
        name,
        ek: num(row.ekPrice) || null,
        vk: num(row.vkPrice) || null,
        einheit: kat?.einheit || "",
        aufbauten: [aufbau],
      });
    }
  });
  return [...gefunden.values()];
}
