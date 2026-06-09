-- Starting numbers for invoices and offers
INSERT INTO public.app_settings (key, value)
VALUES ('rechnung_start_nummer', '1')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES ('angebot_start_nummer', '1')
ON CONFLICT (key) DO NOTHING;

-- Update next_invoice_number function to respect start numbers from settings
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

  -- Get start number from settings
  SELECT COALESCE(value::INTEGER, 1) INTO start_num
  FROM public.app_settings
  WHERE key = setting_key;

  IF start_num IS NULL THEN
    start_num := 1;
  END IF;

  -- Get max existing number
  SELECT COALESCE(MAX(laufnummer), 0) + 1 INTO next_num
  FROM public.invoices
  WHERE typ = p_typ AND jahr = p_jahr;

  -- Use whichever is higher: start_num or next sequential
  IF next_num < start_num THEN
    next_num := start_num;
  END IF;

  result := prefix || '-' || p_jahr || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN result;
END;
$$;
