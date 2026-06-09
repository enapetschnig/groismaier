-- Vereinheitlichung der Nummernkreise für Rechnungen/Angebote.
-- next_document_number ist die EINZIGE Quelle (zählergestützt über
-- number_ranges + zeilengesperrt via FOR UPDATE). QuickOfferDialog nutzte
-- bisher das getrennte, MAX-basierte next_invoice_number → die beiden Kreise
-- konnten auseinanderlaufen und doppelte invoices.nummer erzeugen (UNIQUE 23505).
--
-- Zusätzlich eine Eindeutigkeits-Schleife: falls eine berechnete Nummer schon
-- in invoices.nummer existiert (Import/Legacy/manuelle Korrektur), wird die
-- nächste freie genommen — robust gegen Zähler-Drift.

CREATE OR REPLACE FUNCTION public.next_document_number(p_typ text, p_jahr integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- Eindeutigkeit garantieren: existierende Nummern überspringen
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

  UPDATE public.number_ranges
     SET aktuelle_nummer = next_num,
         updated_at = NOW()
   WHERE typ = effective_typ;

  RETURN result;
END;
$function$;

-- Frischer Start nach dem Löschen aller Test-Rechnungen/-Angebote:
-- die nächsten Nummern beginnen wieder bei AN26001 bzw. 26001.
UPDATE public.number_ranges SET aktuelle_nummer = 0 WHERE typ IN ('angebot', 'rechnung');
