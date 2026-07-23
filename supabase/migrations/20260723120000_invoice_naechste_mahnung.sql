-- ============================================================================
-- Offene Posten (KingBill 1:1): „Nächste Mahnung am" je Rechnung
--
-- Der Eingang-buchen-Dialog führt je offener Rechnung das Datum der nächsten
-- Mahnung (Spalte „Nächste Mahnung am" der Offene-Posten-Liste) zusätzlich
-- zum bestehenden Mahnstatus (invoices.mahnstufe).
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS naechste_mahnung_am DATE;

COMMENT ON COLUMN public.invoices.naechste_mahnung_am IS
  'Offene Posten: Datum der nächsten geplanten Mahnung (KingBill „Nächste Mahnung am").';
