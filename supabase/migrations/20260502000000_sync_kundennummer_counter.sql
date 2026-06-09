-- ============================================================
-- Sync number_ranges.kundennummer.aktuelle_nummer mit customers
-- ============================================================
-- Frühere Frontend-max+1-Pre-Generation hat Kundennummern direkt in
-- public.customers geschrieben, ohne den number_ranges-Counter
-- hochzuzählen. Wenn nun der DB-Trigger
-- (assign_kundennummer_before_insert) via next_document_number() eine
-- Nummer zuweist, könnte dieselbe schon in customers existieren →
-- 23505 Unique-Violation auf customers_kundennummer_uniq.
--
-- Diese Migration zieht den Counter einmalig auf den höchsten
-- existierenden Zahlenwert hoch. Idempotent: GREATEST() lässt einen
-- bereits korrekten Counter unangetastet.

DO $$
DECLARE
  max_num INTEGER := 0;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(kundennummer, '\D', '', 'g'), '')::INTEGER),
    0
  ) INTO max_num
  FROM public.customers
  WHERE kundennummer IS NOT NULL AND kundennummer <> '';

  UPDATE public.number_ranges
     SET aktuelle_nummer = GREATEST(aktuelle_nummer, max_num),
         updated_at = NOW()
   WHERE typ = 'kundennummer';

  RAISE NOTICE 'kundennummer-Counter angeglichen — max in customers: %', max_num;
END $$;
