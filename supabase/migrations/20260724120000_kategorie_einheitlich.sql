-- ============================================================================
-- Einheitlichkeit Kategorie/Produktgruppe (Kundenwunsch 2026-07-24):
-- invoice_templates fuehrt historisch ZWEI Gruppierungsfelder — kategorie
-- (Artikel-Auswahldialog im Beleg-Editor) und produktgruppe (KingBill-
-- Artikelmaske + Aufbau-Kalkulation). Die Artikelmaske spiegelt beim
-- Speichern bereits kategorie = produktgruppe; Alt-/Migrationsdaten werden
-- hier angeglichen, damit ein Artikel UEBERALL unter derselben Gruppe steht.
-- ============================================================================
UPDATE public.invoice_templates
SET kategorie = produktgruppe
WHERE produktgruppe IS NOT NULL
  AND btrim(produktgruppe) <> ''
  AND kategorie IS DISTINCT FROM produktgruppe;
