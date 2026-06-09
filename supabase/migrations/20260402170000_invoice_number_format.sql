-- New invoice number format: YYXXX (e.g. 26001, 26002, 27001)
-- Year as 2 digits + sequential 3-digit number
DROP FUNCTION IF EXISTS public.next_invoice_number(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_typ TEXT, p_jahr INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num INTEGER;
  start_num INTEGER := 1;
  setting_key TEXT;
  max_existing INTEGER;
  year_prefix TEXT;
  result TEXT;
BEGIN
  IF p_typ = 'rechnung' THEN
    setting_key := 'rechnung_start_nummer';
  ELSIF p_typ = 'angebot' THEN
    setting_key := 'angebot_start_nummer';
  ELSE
    RAISE EXCEPTION 'Ungültiger Typ: %', p_typ;
  END IF;

  -- 2-digit year prefix (2026 -> 26, 2027 -> 27)
  year_prefix := LPAD((p_jahr % 100)::TEXT, 2, '0');

  -- Get max existing laufnummer for this type and year
  SELECT COALESCE(MAX(laufnummer), 0) INTO max_existing
  FROM public.invoices
  WHERE typ = p_typ AND jahr = p_jahr;

  -- Get start number from settings
  BEGIN
    SELECT value::INTEGER INTO start_num
    FROM public.app_settings
    WHERE key = setting_key;
  EXCEPTION WHEN OTHERS THEN
    start_num := 1;
  END;

  IF start_num IS NULL OR start_num < 1 THEN
    start_num := 1;
  END IF;

  -- Use whichever is higher: max existing + 1, or start number
  next_num := GREATEST(max_existing + 1, start_num);

  -- Safety: loop until we find a free number
  LOOP
    result := year_prefix || LPAD(next_num::TEXT, 3, '0');
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE nummer = result) THEN
      EXIT;
    END IF;
    next_num := next_num + 1;
  END LOOP;

  RETURN result;
END;
$$;
