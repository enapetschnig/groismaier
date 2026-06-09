-- ============================================================
-- Einmalige Bereinigung: Test-Dokumente löschen + Nummernkreise
-- zurücksetzen, damit die Laufnummern wieder frei sind.
-- ============================================================
-- Zu löschen (User-Anforderung):
--   Angebote:  AN_2026_004, AN_2026_005
--   ABs:       AB26001, AB26002
--   ARs:       AR26001, AR26002

-- 1) IDs der betroffenen Dokumente als Temp-Liste
DO $$
DECLARE
  del_nummern TEXT[] := ARRAY['AR26001', 'AR26002', 'AB26001', 'AB26002', 'AN_2026_004', 'AN_2026_005'];
BEGIN
  -- 2) invoice_items aller betroffenen Rechnungen weg
  DELETE FROM public.invoice_items
   WHERE invoice_id IN (
     SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
   );

  -- 3) Zahlungen weg (falls vorhanden)
  DELETE FROM public.invoice_payments
   WHERE invoice_id IN (
     SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
   );

  -- 4) Mahnungen weg (falls Tabelle existiert)
  BEGIN
    DELETE FROM public.mahnungen
     WHERE invoice_id IN (
       SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
     );
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 5) Stored PDFs weg (falls Tabelle existiert)
  BEGIN
    DELETE FROM public.invoice_pdfs
     WHERE invoice_id IN (
       SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
     );
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 6) Reihenfolge: zuerst AR (Kinder), dann AB, dann AN — wegen
  --    ON DELETE RESTRICT auf parent_invoice_id.
  DELETE FROM public.invoices WHERE nummer IN ('AR26001', 'AR26002');
  DELETE FROM public.invoices WHERE nummer IN ('AB26001', 'AB26002');
  DELETE FROM public.invoices WHERE nummer IN ('AN_2026_004', 'AN_2026_005');
END $$;

-- 7) Nummernkreise auf Max der verbleibenden Laufnummern setzen
UPDATE public.number_ranges nr
   SET aktuelle_nummer = COALESCE((
     SELECT MAX(laufnummer) FROM public.invoices WHERE typ = nr.typ
   ), 0),
   updated_at = NOW()
 WHERE nr.typ IN ('angebot', 'auftragsbestaetigung', 'anzahlungsrechnung');

-- Diagnose: aktueller Stand der betroffenen Ranges
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT typ, prefix, aktuelle_nummer
      FROM public.number_ranges
     WHERE typ IN ('angebot', 'auftragsbestaetigung', 'anzahlungsrechnung')
  LOOP
    RAISE NOTICE 'number_ranges % (prefix %) → aktuelle_nummer = %', r.typ, r.prefix, r.aktuelle_nummer;
  END LOOP;
END $$;
