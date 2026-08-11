-- Vorschau der nächsten Belegnummer OHNE den Zähler zu verbrauchen
-- (Kundenwunsch: die Nummer soll schon in der PDF-Vorschau stehen, während
-- man die Rechnung erstellt). Identische Logik wie next_document_number,
-- aber ohne das UPDATE auf number_ranges.
CREATE OR REPLACE FUNCTION public.peek_document_number(p_typ TEXT, p_jahr INTEGER DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  nr RECORD;
  effective_typ TEXT;
  next_num INTEGER;
  year_str TEXT;
  result TEXT;
  actual_year INTEGER;
BEGIN
  actual_year := COALESCE(p_jahr, EXTRACT(YEAR FROM NOW())::INTEGER);
  IF p_typ IN ('anzahlungsrechnung', 'schlussrechnung') THEN
    effective_typ := 'rechnung';
  ELSE
    effective_typ := p_typ;
  END IF;

  SELECT * INTO nr FROM public.number_ranges WHERE typ = effective_typ;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF nr.jahr_format = 'YYYY' THEN
    year_str := actual_year::TEXT;
  ELSE
    year_str := LPAD((actual_year % 100)::TEXT, 2, '0');
  END IF;

  next_num := GREATEST(nr.aktuelle_nummer + 1, nr.start_nummer);
  LOOP
    result := nr.format_pattern;
    result := REPLACE(result, '{PREFIX}', COALESCE(nr.prefix, ''));
    result := REPLACE(result, '{SUFFIX}', COALESCE(nr.suffix, ''));
    result := REPLACE(result, '{YY}', year_str);
    result := REPLACE(result, '{YYYY}', actual_year::TEXT);
    result := REPLACE(result, '{NNN}', LPAD(next_num::TEXT, nr.stellen, '0'));
    result := REPLACE(result, '{N}', next_num::TEXT);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invoices WHERE nummer = result);
    next_num := next_num + 1;
  END LOOP;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_document_number(TEXT, INTEGER) TO authenticated;
