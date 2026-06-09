-- ============================================================
-- Pro-Dokument-Ansprechpartner: überschreibt den Layout-Default,
-- kann aus Projekt-Kontakt oder manuell befüllt werden.
-- Plus: Auto-Übernahme von customers.kundennummer in invoices.kundennummer
-- beim Insert/Update, falls leer.
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ansprechpartner_name TEXT,
  ADD COLUMN IF NOT EXISTS ansprechpartner_telefon TEXT,
  ADD COLUMN IF NOT EXISTS ansprechpartner_email TEXT;

COMMENT ON COLUMN public.invoices.ansprechpartner_name IS
  'Ansprechpartner-Name für dieses Dokument. Überschreibt den Layout-Default, fällt auf projekt_kontakt_name zurück, wenn leer.';
COMMENT ON COLUMN public.invoices.ansprechpartner_telefon IS
  'Telefon des Ansprechpartners für dieses Dokument.';
COMMENT ON COLUMN public.invoices.ansprechpartner_email IS
  'E-Mail des Ansprechpartners für dieses Dokument.';

-- Auto-Kundennummer: beim Insert/Update in invoices die kundennummer
-- aus customers übernehmen, falls leer und customer_id gesetzt.
CREATE OR REPLACE FUNCTION public.sync_invoice_kundennummer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (NEW.kundennummer IS NULL OR NEW.kundennummer = '') AND NEW.customer_id IS NOT NULL THEN
    SELECT kundennummer INTO NEW.kundennummer
    FROM public.customers
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_sync_kundennummer ON public.invoices;
CREATE TRIGGER invoices_sync_kundennummer
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_kundennummer();
