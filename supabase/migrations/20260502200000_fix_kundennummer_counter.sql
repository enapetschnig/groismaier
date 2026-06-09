-- ============================================================
-- Fix: kundennummer-Counter auf TRAILING-Ziffern (nicht Gesamt-Regex)
-- ============================================================
-- Vorgänger-Migration 20260502000000 hat alle Ziffern aus
-- kundennummer extrahiert ("K_2026_00010" → 202600010), was zu einem
-- viel zu hohen Counter geführt hat. Korrekt ist nur das Suffix
-- (laufende Nummer nach dem letzten Trennzeichen): aus "K_2026_00010"
-- soll 10 werden, nicht 202600010.
--
-- Diese Migration setzt den Counter auf den korrekten Wert.

DO $$
DECLARE
  max_num INTEGER := 0;
BEGIN
  -- Trailing-Digits matchen: alles nach dem letzten Nicht-Ziffern-Block
  SELECT COALESCE(
    MAX(NULLIF(SUBSTRING(kundennummer FROM '\d+$'), '')::INTEGER),
    0
  ) INTO max_num
  FROM public.customers
  WHERE kundennummer ~ '\d+$';

  -- Setze Counter EXAKT auf max_num (kein GREATEST — wir wollen den
  -- vorherigen falschen Wert hier OVERRIDEN).
  UPDATE public.number_ranges
     SET aktuelle_nummer = max_num,
         updated_at = NOW()
   WHERE typ = 'kundennummer';

  RAISE NOTICE 'kundennummer-Counter korrigiert auf laufende Nr.: %', max_num;
END $$;
