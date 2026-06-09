-- Add "offen" to allowed status values and update existing "gesendet" entries
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['entwurf', 'offen', 'gesendet', 'bezahlt', 'teilbezahlt', 'storniert', 'abgelehnt', 'angenommen', 'verrechnet']));

-- Migrate existing "gesendet" to "offen"
UPDATE public.invoices SET status = 'offen' WHERE status = 'gesendet';
