-- ============================================================================
-- EIN Katalog, Abschluss (Kundenwunsch 2026-07-24): Die in den Artikelstamm
-- kopierten Material-Artikel des Alt-Katalogs deaktivieren.
--
-- Sicherheits-Reihenfolge eingehalten: Der Dual-Source-Code (liest
-- invoice_templates + Alt-Katalog) ist deployed und im Live-Bundle
-- verifiziert — erst DANACH läuft diese Migration. Ein Vollaudit hat
-- gezeigt, dass die aktiven Alt-Zwillinge sonst bei Löschen/Umbenennen/
-- Gruppenwechsel eines Stamm-Artikels mit veralteten Preisen wieder
-- auftauchen.
--
-- Deaktiviert wird NUR, was nachweislich (Signatur Gruppe+Name, aktiv) im
-- Artikelstamm existiert — lack/aufpreis und alles Unmigrierte bleibt.
-- ============================================================================
UPDATE public.kalkulation_artikel a
SET aktiv = false
FROM public.kalkulation_kategorien k
WHERE k.id = a.kategorie_id
  AND k.typ = 'material'
  AND a.aktiv IS NOT FALSE
  AND EXISTS (
    SELECT 1 FROM public.invoice_templates t
    WHERE t.ist_aktiv IS NOT FALSE
      AND lower(btrim(t.kurzbezeichnung)) = lower(btrim(a.name))
      AND lower(btrim(COALESCE(t.produktgruppe, ''))) = lower(btrim(k.name))
  );

-- VK-Spiegelfelder angleichen: vk_netto ist numeric(12,2), netto_preis/
-- einzelpreis nicht — die Migration 20260724110000 hatte bei Preisen mit
-- 3 Nachkommastellen (z.B. 33,075) auseinanderlaufende Werte erzeugt.
-- vk_netto (2 NK) ist der kanonische Belegpreis.
UPDATE public.invoice_templates
SET netto_preis = vk_netto, einzelpreis = vk_netto
WHERE vk_netto IS NOT NULL
  AND (netto_preis IS DISTINCT FROM vk_netto OR einzelpreis IS DISTINCT FROM vk_netto);

-- Einheit m³ in die Standard-Einheitenliste aufnehmen (18 migrierte
-- Artikel tragen sie; das Einheiten-Select der Artikelmaske speist sich
-- aus diesem Setting).
UPDATE public.app_settings
SET value = replace(value, 'm²,', 'm²,m³,')
WHERE key = 'einheiten'
  AND value LIKE '%m²,%'
  AND value NOT LIKE '%m³%';
