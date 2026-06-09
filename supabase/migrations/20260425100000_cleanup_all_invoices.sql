-- ============================================================
-- Cleanup: ALLE Rechnungs-artigen Dokumente + AB26001 + AN_2026_004
-- löschen und Nummernkreise freigeben.
-- ============================================================

DO $$
BEGIN
  -- 1) invoice_items für alle zu löschenden Dokumente entfernen
  DELETE FROM public.invoice_items WHERE invoice_id IN (
    SELECT id FROM public.invoices
     WHERE typ IN ('rechnung', 'anzahlungsrechnung', 'schlussrechnung', 'gutschrift')
        OR nummer IN ('AB26001', 'AN_2026_004')
  );

  -- 2) Zahlungen
  DELETE FROM public.invoice_payments WHERE invoice_id IN (
    SELECT id FROM public.invoices
     WHERE typ IN ('rechnung', 'anzahlungsrechnung', 'schlussrechnung', 'gutschrift')
        OR nummer IN ('AB26001', 'AN_2026_004')
  );

  -- 3) Mahnungen + gespeicherte PDFs (falls Tabellen existieren)
  BEGIN
    DELETE FROM public.mahnungen WHERE invoice_id IN (
      SELECT id FROM public.invoices
       WHERE typ IN ('rechnung', 'anzahlungsrechnung', 'schlussrechnung', 'gutschrift')
          OR nummer IN ('AB26001', 'AN_2026_004')
    );
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM public.invoice_pdfs WHERE invoice_id IN (
      SELECT id FROM public.invoices
       WHERE typ IN ('rechnung', 'anzahlungsrechnung', 'schlussrechnung', 'gutschrift')
          OR nummer IN ('AB26001', 'AN_2026_004')
    );
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 4) Rechnungen in richtiger Reihenfolge löschen
  --    (Kinder → Eltern, wegen ON DELETE RESTRICT auf parent_invoice_id):
  --    Schlussrechnung → Anzahlungsrechnung → Rechnung → Gutschrift → AB → AN
  DELETE FROM public.invoices WHERE typ = 'schlussrechnung';
  DELETE FROM public.invoices WHERE typ = 'anzahlungsrechnung';
  DELETE FROM public.invoices WHERE typ = 'rechnung';
  DELETE FROM public.invoices WHERE typ = 'gutschrift';
  DELETE FROM public.invoices WHERE nummer = 'AB26001';
  DELETE FROM public.invoices WHERE nummer = 'AN_2026_004';
END $$;

-- 5) Nummernkreise zurücksetzen:
--    - rechnung: Max aus allen rechnungs-artigen Typen (unified numbering)
--    - gutschrift / AB / Angebot: eigene Max der verbleibenden Dokumente
UPDATE public.number_ranges
   SET aktuelle_nummer = COALESCE((
     SELECT MAX(laufnummer) FROM public.invoices
      WHERE typ IN ('rechnung', 'anzahlungsrechnung', 'schlussrechnung')
   ), 0),
       updated_at = NOW()
 WHERE typ = 'rechnung';

UPDATE public.number_ranges nr
   SET aktuelle_nummer = COALESCE((
     SELECT MAX(laufnummer) FROM public.invoices WHERE typ = nr.typ
   ), 0),
   updated_at = NOW()
 WHERE nr.typ IN ('gutschrift', 'auftragsbestaetigung', 'angebot',
                  'anzahlungsrechnung', 'schlussrechnung');

-- Diagnose
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== Verbleibende Dokumente pro Typ ===';
  FOR r IN
    SELECT typ, COUNT(*) AS anzahl
      FROM public.invoices
     GROUP BY typ ORDER BY typ
  LOOP
    RAISE NOTICE '  % → % Dokumente', r.typ, r.anzahl;
  END LOOP;

  RAISE NOTICE '=== Nummernkreise ===';
  FOR r IN
    SELECT typ, prefix, aktuelle_nummer FROM public.number_ranges
     WHERE typ IN ('angebot', 'auftragsbestaetigung', 'rechnung',
                   'anzahlungsrechnung', 'schlussrechnung', 'gutschrift')
     ORDER BY typ
  LOOP
    RAISE NOTICE '  % (prefix=%) → aktuelle_nummer = %', r.typ, r.prefix, r.aktuelle_nummer;
  END LOOP;
END $$;
