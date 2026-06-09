-- ============================================================
-- Cleanup Test-Dokumente + Eingangsrechnungen-Permissions härten
-- ============================================================

-- 1) Konkrete Test-Dokumente aus der Datenbank entfernen
DO $$
DECLARE
  del_nummern TEXT[] := ARRAY['SR26001', 'AR26001', 'AN_2026_004'];
BEGIN
  -- items weg
  DELETE FROM public.invoice_items
   WHERE invoice_id IN (
     SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
   );
  -- zahlungen
  DELETE FROM public.invoice_payments
   WHERE invoice_id IN (
     SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
   );
  -- Mahnungen + Stored PDFs (sofern Tabellen existieren)
  BEGIN
    DELETE FROM public.mahnungen
     WHERE invoice_id IN (
       SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
     );
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    DELETE FROM public.invoice_pdfs
     WHERE invoice_id IN (
       SELECT id FROM public.invoices WHERE nummer = ANY(del_nummern)
     );
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Reihenfolge wegen ON DELETE RESTRICT: Kinder zuerst.
  DELETE FROM public.invoices WHERE nummer = 'SR26001';
  DELETE FROM public.invoices WHERE nummer = 'AR26001';
  DELETE FROM public.invoices WHERE nummer = 'AN_2026_004';
END $$;

-- 2) Nummernkreise auf höchste verbliebene Laufnummer zurücksetzen
--    (auch für das neue "unified numbering": AR/SR zählen jetzt in
--    denselben "rechnung"-Counter — daher beziehen wir MAX aus ALLEN
--    rechnungs-artigen Typen für typ='rechnung'.)
UPDATE public.number_ranges nr
   SET aktuelle_nummer = COALESCE((
     SELECT MAX(laufnummer) FROM public.invoices
      WHERE typ IN ('rechnung', 'anzahlungsrechnung', 'schlussrechnung')
   ), 0),
   updated_at = NOW()
 WHERE nr.typ = 'rechnung';

UPDATE public.number_ranges nr
   SET aktuelle_nummer = COALESCE((
     SELECT MAX(laufnummer) FROM public.invoices WHERE typ = nr.typ
   ), 0),
   updated_at = NOW()
 WHERE nr.typ IN ('angebot', 'auftragsbestaetigung', 'anzahlungsrechnung', 'schlussrechnung');

-- 3) Eingangsrechnungen: alle aktiven Rollen dürfen sehen
--    (vorarbeiter war hier historisch auf FALSE — jetzt wieder offen)
INSERT INTO public.role_permissions (role, feature, can_view, can_edit) VALUES
  ('administrator', 'eingangsrechnungen', TRUE, TRUE),
  ('vorarbeiter',   'eingangsrechnungen', TRUE, TRUE),
  ('mitarbeiter',   'eingangsrechnungen', TRUE, TRUE)
ON CONFLICT (role, feature) DO UPDATE
   SET can_view = EXCLUDED.can_view,
       can_edit = EXCLUDED.can_edit;

-- 4) RLS-Policy auch für Vorarbeiter: er darf (wieder) alle
--    Eingangsrechnungen managen, analog zu Admin.
DROP POLICY IF EXISTS "Vorarbeiter can manage purchase_invoices" ON public.purchase_invoices;
CREATE POLICY "Vorarbeiter can manage purchase_invoices" ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vorarbeiter'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vorarbeiter'::app_role));

-- 5) Diagnose: aktuelle Permissions + Rollenzuweisungen der User
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== role_permissions für eingangsrechnungen ===';
  FOR r IN SELECT role, feature, can_view, can_edit
             FROM public.role_permissions
            WHERE feature = 'eingangsrechnungen'
  LOOP
    RAISE NOTICE '  % → can_view=% can_edit=%', r.role, r.can_view, r.can_edit;
  END LOOP;

  RAISE NOTICE '=== user_roles-Zuweisungen ===';
  FOR r IN SELECT u.email, ur.role
             FROM public.user_roles ur
             JOIN auth.users u ON u.id = ur.user_id
            ORDER BY u.email
  LOOP
    RAISE NOTICE '  % → %', r.email, r.role;
  END LOOP;

  RAISE NOTICE '=== Nummernkreise nach Cleanup ===';
  FOR r IN SELECT typ, aktuelle_nummer FROM public.number_ranges
            WHERE typ IN ('angebot', 'auftragsbestaetigung', 'rechnung', 'anzahlungsrechnung', 'schlussrechnung')
            ORDER BY typ
  LOOP
    RAISE NOTICE '  % → aktuelle_nummer = %', r.typ, r.aktuelle_nummer;
  END LOOP;
END $$;
