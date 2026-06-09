-- ============================================================
-- next_document_number(): Row-Lock gegen Race-Conditions
-- ============================================================
-- Bisherige Implementierung las und schrieb number_ranges ohne Lock —
-- zwei gleichzeitige Aufrufe konnten denselben aktuelle_nummer-Wert
-- lesen und beide denselben "next_num" zurückgeben → Insert mit
-- Unique-Index-Violation. Mit SELECT … FOR UPDATE wird der Row-Lock
-- pro Nummernkreis genommen, parallele Aufrufe werden serialisiert.
--
-- Wirkt für ALLE Nummernkreise (Rechnung, Angebot, Projekt,
-- Kundennummer, Ersttermin, Bautagesbericht, …) — sauber globalisiert.

CREATE OR REPLACE FUNCTION public.next_document_number(p_typ TEXT, p_jahr INTEGER DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Rechnungsähnliche Typen teilen sich den "rechnung"-Nummernkreis
  IF p_typ IN ('anzahlungsrechnung', 'schlussrechnung') THEN
    effective_typ := 'rechnung';
  ELSE
    effective_typ := p_typ;
  END IF;

  -- Row-Lock: serialisiert parallele Aufrufe pro Nummernkreis
  SELECT * INTO nr FROM public.number_ranges
   WHERE typ = effective_typ
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', effective_typ;
  END IF;

  IF nr.jahr_format = 'YYYY' THEN
    year_str := actual_year::TEXT;
  ELSE
    year_str := LPAD((actual_year % 100)::TEXT, 2, '0');
  END IF;

  next_num := GREATEST(nr.aktuelle_nummer + 1, nr.start_nummer);

  result := nr.format_pattern;
  result := REPLACE(result, '{PREFIX}', COALESCE(nr.prefix, ''));
  result := REPLACE(result, '{SUFFIX}', COALESCE(nr.suffix, ''));
  result := REPLACE(result, '{YY}', year_str);
  result := REPLACE(result, '{YYYY}', actual_year::TEXT);
  result := REPLACE(result, '{NNN}', LPAD(next_num::TEXT, nr.stellen, '0'));
  result := REPLACE(result, '{N}', next_num::TEXT);

  UPDATE public.number_ranges
     SET aktuelle_nummer = next_num,
         updated_at = NOW()
   WHERE typ = effective_typ;

  RETURN result;
END;
$$;
