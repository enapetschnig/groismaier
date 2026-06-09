-- Fix: next_invoice_number always respects start_nummer setting
DROP FUNCTION IF EXISTS public.next_invoice_number(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_typ TEXT, p_jahr INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prefix TEXT;
  next_num INTEGER;
  start_num INTEGER := 1;
  setting_key TEXT;
  max_existing INTEGER;
  result TEXT;
BEGIN
  IF p_typ = 'rechnung' THEN
    prefix := 'RE';
    setting_key := 'rechnung_start_nummer';
  ELSIF p_typ = 'angebot' THEN
    prefix := 'AN';
    setting_key := 'angebot_start_nummer';
  ELSE
    RAISE EXCEPTION 'Ungültiger Typ: %', p_typ;
  END IF;

  -- Get max existing number for this type and year
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
    result := prefix || '-' || p_jahr || '-' || LPAD(next_num::TEXT, 4, '0');
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE nummer = result) THEN
      EXIT;
    END IF;
    next_num := next_num + 1;
  END LOOP;

  RETURN result;
END;
$$;
