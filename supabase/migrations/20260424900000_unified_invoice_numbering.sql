-- ============================================================
-- Einheitliche Rechnungsnummerierung für Rechnung + Anzahlungs- +
-- Schlussrechnung: alle ziehen aus demselben Nummernkreis ("rechnung").
-- ============================================================
-- Ziel: egal ob der User eine normale Rechnung, eine Anzahlungsrechnung
-- oder eine Schlussrechnung erstellt — die Nummer folgt dem gleichen
-- Format wie im Admin bei "Rechnung" konfiguriert (z.B. leerer Prefix
-- → "26001", Prefix "A" → "A26001"). So muss der User nicht mehr drei
-- getrennte Nummernkreise pflegen und die Nummern bleiben lückenlos
-- fortlaufend über alle Rechnungstypen hinweg.

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
  -- (gemeinsamer fortlaufender Zähler, einheitliches Format).
  IF p_typ IN ('anzahlungsrechnung', 'schlussrechnung') THEN
    effective_typ := 'rechnung';
  ELSE
    effective_typ := p_typ;
  END IF;

  SELECT * INTO nr FROM number_ranges WHERE typ = effective_typ;
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

  -- Wir erhöhen IMMER den effektiv verwendeten Counter ("rechnung" bei
  -- AR/SR), damit die Folgenummer auch dort sichtbar weiterzählt.
  UPDATE number_ranges SET aktuelle_nummer = next_num, updated_at = NOW()
   WHERE typ = effective_typ;

  RETURN result;
END;
$$;
