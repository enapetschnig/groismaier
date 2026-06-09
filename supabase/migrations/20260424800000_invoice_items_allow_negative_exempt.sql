-- ============================================================
-- invoice_items: negative einzelpreis für mwst_exempt-Zeilen erlauben
-- ============================================================
-- Hintergrund: Mit der MwSt-Abzugs-Logik in Schlussrechnungen werden
-- Anzahlungen als BRUTTO-negative Zeilen (mwst_exempt=TRUE) eingefügt.
-- Die alte Constraint invoice_items_preis_nonneg blockierte aber jedes
-- negative einzelpreis/gesamtpreis → Save schlug fehl.
--
-- Neu: einzelpreis darf negativ sein, wenn die Zeile als mwst_exempt
-- markiert ist. Für alle anderen Zeilen (Positionen) bleibt >= 0.

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_preis_nonneg;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_preis_nonneg
  CHECK (
    einzelpreis >= 0
    OR mwst_exempt = TRUE
  );
