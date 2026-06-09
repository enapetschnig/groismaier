-- Add betreff (subject line) to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS betreff TEXT;

-- Add produktnummer to invoice_items for internal reference
ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS produktnummer TEXT;
