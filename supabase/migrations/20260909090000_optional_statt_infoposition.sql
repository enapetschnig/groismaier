-- ============================================================================
--  "INFOPOSITION:" heisst am Beleg jetzt "OPTIONAL:" (Freigabe 09.09.2026)
-- ============================================================================
-- Grund: Der Schlusstext im Angebot sagt "Die Positionen mit OPTIONAL davor
-- sind nicht in der Endsumme eingerechnet" - der Beleg muss dasselbe Wort
-- verwenden, und der Kunde versteht es ohne Fachbegriff.
--
-- ES WERDEN KEINE WERTE VERAENDERT. Geaendert wird ausschliesslich der
-- Vorspann im Positionstext. Betraege, Mengen, Kennzeichen und die Kopfsummen
-- der Belege bleiben Cent-genau, wie sie sind - die Kontrolle am Ende bricht
-- ab und rollt alles zurueck, sobald sich auch nur eine Summe bewegt.

DO $$
DECLARE
  v_summen_vorher jsonb;
  v_summen_nachher jsonb;
  v_zeilen int;
BEGIN
  -- Kopfsummen ALLER Belege vorher festhalten (nicht nur der betroffenen).
  SELECT jsonb_agg(jsonb_build_array(id, netto_summe, mwst_betrag, brutto_summe) ORDER BY id)
    INTO v_summen_vorher FROM public.invoices;

  UPDATE public.invoice_items
     SET beschreibung = 'OPTIONAL:' || substring(beschreibung from length('INFOPOSITION:') + 1),
         kurztext = CASE
           WHEN kurztext IS NOT NULL AND upper(btrim(kurztext)) LIKE 'INFOPOSITION:%'
           THEN 'OPTIONAL:' || substring(kurztext from length('INFOPOSITION:') + 1)
           ELSE kurztext END
   WHERE upper(btrim(beschreibung)) LIKE 'INFOPOSITION:%';
  GET DIAGNOSTICS v_zeilen = ROW_COUNT;
  RAISE NOTICE 'Umbenannt: % Zeile(n).', v_zeilen;

  -- Kontrolle: keine einzige Kopfsumme darf sich veraendert haben.
  SELECT jsonb_agg(jsonb_build_array(id, netto_summe, mwst_betrag, brutto_summe) ORDER BY id)
    INTO v_summen_nachher FROM public.invoices;
  IF v_summen_vorher IS DISTINCT FROM v_summen_nachher THEN
    RAISE EXCEPTION 'Abbruch: Eine Belegsumme haette sich veraendert - alles zurueckgerollt.';
  END IF;
END $$;

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Optionale Positionen heissen jetzt "OPTIONAL"',
   'Statt "INFOPOSITION" steht vor einer optionalen Position jetzt "OPTIONAL" - so wie im Schlusstext des Angebots. Im PDF ist die Zeile zusaetzlich hell hinterlegt, damit die leere Summenspalte erkennbar Absicht ist. An den Betraegen aendert sich nichts.');
