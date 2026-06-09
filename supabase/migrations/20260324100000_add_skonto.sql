-- Add Skonto fields to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS skonto_prozent DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS skonto_tage INTEGER DEFAULT 0;
