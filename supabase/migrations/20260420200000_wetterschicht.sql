-- ============================================================
-- Wetterschicht-Stunden auf time_entries
-- ============================================================
-- Rein informativ — wird in der Stundenauswertung angezeigt, hat
-- aber keinen Einfluss auf die gebuchten Arbeitsstunden oder
-- Soll-/Überstunden-Berechnungen.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS wetterschicht_stunden NUMERIC(4, 2);

COMMENT ON COLUMN public.time_entries.wetterschicht_stunden IS
  'Optional: Regenstunden dieser Schicht (nur Info, keine Auswirkung auf stunden)';
