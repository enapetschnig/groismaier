-- Extended invoice number settings
INSERT INTO app_settings (key, value) VALUES ('rechnung_prefix', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('rechnung_format', '{PREFIX}{YY}{NNN}') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('rechnung_stellen', '3') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('angebot_prefix', 'AN') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('angebot_format', '{PREFIX}{YY}{NNN}') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('angebot_stellen', '3') ON CONFLICT (key) DO NOTHING;

-- Update the function to use all settings
DROP FUNCTION IF EXISTS public.next_invoice_number(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_typ TEXT, p_jahr INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num INTEGER;
  start_num INTEGER := 1;
  stellen INTEGER := 3;
  prefix TEXT := '';
  fmt TEXT := '{PREFIX}{YY}{NNN}';
  max_existing INTEGER;
  year_short TEXT;
  year_long TEXT;
  padded_num TEXT;
  result TEXT;
  typ_key TEXT;
BEGIN
  IF p_typ = 'rechnung' THEN
    typ_key := 'rechnung';
  ELSIF p_typ = 'angebot' THEN
    typ_key := 'angebot';
  ELSE
    RAISE EXCEPTION 'Ungültiger Typ: %', p_typ;
  END IF;

  -- Load settings
  BEGIN
    SELECT value INTO prefix FROM app_settings WHERE key = typ_key || '_prefix';
    SELECT value::INTEGER INTO start_num FROM app_settings WHERE key = typ_key || '_start_nummer';
    SELECT value::INTEGER INTO stellen FROM app_settings WHERE key = typ_key || '_stellen';
    SELECT value INTO fmt FROM app_settings WHERE key = typ_key || '_format';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- use defaults
  END;

  IF prefix IS NULL THEN prefix := ''; END IF;
  IF start_num IS NULL OR start_num < 1 THEN start_num := 1; END IF;
  IF stellen IS NULL OR stellen < 1 THEN stellen := 3; END IF;
  IF fmt IS NULL OR fmt = '' THEN fmt := '{PREFIX}{YY}{NNN}'; END IF;

  year_short := LPAD((p_jahr % 100)::TEXT, 2, '0');
  year_long := p_jahr::TEXT;

  -- Get max existing laufnummer for this type+year
  SELECT COALESCE(MAX(laufnummer), 0) INTO max_existing
  FROM public.invoices
  WHERE typ = p_typ AND jahr = p_jahr;

  next_num := GREATEST(max_existing + 1, start_num);

  -- Generate number from format, check uniqueness
  LOOP
    padded_num := LPAD(next_num::TEXT, stellen, '0');

    result := fmt;
    result := REPLACE(result, '{PREFIX}', prefix);
    result := REPLACE(result, '{YYYY}', year_long);
    result := REPLACE(result, '{YY}', year_short);
    result := REPLACE(result, '{NNN}', padded_num);
    result := REPLACE(result, '{N}', next_num::TEXT);

    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE nummer = result) THEN
      EXIT;
    END IF;
    next_num := next_num + 1;
  END LOOP;

  RETURN result;
END;
$$;
