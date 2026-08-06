-- ============================================================================
-- Kundenwunsch 3.1: „Die Reihenfolge der Artikel muss einfach verschiebbar
-- sein." Die Katalog-Artikel aus dem Artikelstamm (invoice_templates) hatten
-- keine Sortierspalte — ihre Reihenfolge in den Kalkulations-Einstellungen
-- war zufällig und nicht beeinflussbar.
-- ============================================================================
ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS sort integer;

-- Bestand: stabile Startreihenfolge nach Name je Gruppe.
WITH nummeriert AS (
  SELECT id, row_number() OVER (PARTITION BY produktgruppe ORDER BY kurzbezeichnung, name) * 10 AS neu
  FROM public.invoice_templates
)
UPDATE public.invoice_templates t SET sort = n.neu
FROM nummeriert n WHERE n.id = t.id AND t.sort IS NULL;
