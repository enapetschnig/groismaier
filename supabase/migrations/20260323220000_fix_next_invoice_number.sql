-- Fix next_invoice_number: Always use MAX(laufnummer) + 1, start_num only for very first invoice
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_typ TEXT, p_jahr INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prefix TEXT;
  next_num INTEGER;
  start_num INTEGER;
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

  -- Always use max + 1
  next_num := max_existing + 1;

  -- Only use start_num if NO invoices exist yet for this type/year
  IF max_existing = 0 THEN
    SELECT COALESCE(value::INTEGER, 1) INTO start_num
    FROM public.app_settings
    WHERE key = setting_key;

    IF start_num IS NOT NULL AND start_num > 1 THEN
      next_num := start_num;
    END IF;
  END IF;

  -- Safety: check if this nummer already exists (loop until free)
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
