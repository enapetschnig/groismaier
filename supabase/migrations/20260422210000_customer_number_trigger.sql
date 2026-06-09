-- ============================================================
-- Auto-Vergabe von customers.kundennummer beim Insert.
-- Dadurch muss kein Client-Code sich darum kümmern —
-- egal über welchen Weg ein Kunde angelegt wird.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_kundennummer_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.kundennummer IS NULL OR NEW.kundennummer = '' THEN
    NEW.kundennummer := public.next_document_number('kundennummer');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_assign_kundennummer ON public.customers;
CREATE TRIGGER customers_assign_kundennummer
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_kundennummer_before_insert();

COMMENT ON TRIGGER customers_assign_kundennummer ON public.customers IS
  'Vergibt automatisch eine Kundennummer aus number_ranges.kundennummer, falls keine gesetzt ist.';
