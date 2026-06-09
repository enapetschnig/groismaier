-- Number format: Rechnungen = YYXXX (26001), Angebote = ANYYXXX (AN26001)
-- 3-digit sequential number (001-999), then wraps to 4 digits if needed
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
  prefix TEXT := '';
BEGIN
  IF p_typ = 'rechnung' THEN
    setting_key := 'rechnung_start_nummer';
  ELSIF p_typ = 'angebot' THEN
    setting_key := 'angebot_start_nummer';
    prefix := 'AN';
  ELSE
    RAISE EXCEPTION 'Ungültiger Typ: %', p_typ;
  END IF;

  year_prefix := LPAD((p_jahr % 100)::TEXT, 2, '0');

  SELECT COALESCE(MAX(laufnummer), 0) INTO max_existing
  FROM public.invoices
  WHERE typ = p_typ AND jahr = p_jahr;

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

  next_num := GREATEST(max_existing + 1, start_num);

  LOOP
    result := prefix || year_prefix || LPAD(next_num::TEXT, 3, '0');
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE nummer = result) THEN
      EXIT;
    END IF;
    next_num := next_num + 1;
  END LOOP;

  RETURN result;
END;
$$;
