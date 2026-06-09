-- Atomare Storno-Nummer-Generierung (race-safe)
-- Sperrt die invoices-Tabelle kurz um parallele Aufrufe zu serialisieren.
CREATE OR REPLACE FUNCTION public.next_storno_nummer(p_jahr INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num INTEGER;
  max_existing INTEGER;
  result TEXT;
  jahr_text TEXT;
BEGIN
  jahr_text := p_jahr::TEXT;

  -- Höchste existierende Nummer finden (mit lock auf der Zeile)
  LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(storno_nummer FROM 'ST-' || jahr_text || '-(\d+)') AS INTEGER)), 0)
    INTO max_existing
    FROM public.invoices
    WHERE storno_nummer LIKE 'ST-' || jahr_text || '-%';

    next_num := max_existing + 1;
    result := 'ST-' || jahr_text || '-' || LPAD(next_num::TEXT, 3, '0');

    -- Eindeutigkeit prüfen (falls zwischenzeitlich Kollision)
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE storno_nummer = result) THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- Index für schnelle Storno-Nummer-Abfragen
CREATE INDEX IF NOT EXISTS idx_invoices_storno_nummer ON public.invoices (storno_nummer) WHERE storno_nummer IS NOT NULL;
