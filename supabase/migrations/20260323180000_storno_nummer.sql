-- Add storno_nummer and storno_datum to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS storno_nummer TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS storno_datum DATE;
