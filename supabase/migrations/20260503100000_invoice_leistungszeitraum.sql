-- ============================================================
-- Leistungsdatum → Leistungszeitraum (Anfangs- + Enddatum)
-- ============================================================
-- Bisher hatte invoices nur ein einzelnes leistungsdatum (DATE). Für
-- Bauprojekte ist es üblich, einen Zeitraum (z. B. 01.04. – 30.04.)
-- anzugeben. Wir fügen leistungsdatum_bis hinzu — leistungsdatum
-- bleibt das ANFANGSDATUM und behält damit die bestehende Semantik
-- für alle Altdokumente (kein Backfill nötig).
--
-- Wenn leistungsdatum_bis NULL ist, rendert das PDF/HTML weiterhin
-- nur das einzelne leistungsdatum — rückwärtskompatibel.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS leistungsdatum_bis DATE;

COMMENT ON COLUMN public.invoices.leistungsdatum IS
  'Leistungszeitraum-Anfangsdatum (vormals Leistungsdatum, kein Rename um Altdaten zu schonen).';
COMMENT ON COLUMN public.invoices.leistungsdatum_bis IS
  'Leistungszeitraum-Enddatum (optional). Wenn gesetzt, wird "von – bis" gerendert.';
