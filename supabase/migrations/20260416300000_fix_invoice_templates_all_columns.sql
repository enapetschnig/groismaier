-- Add ALL missing columns to invoice_templates that the app expects
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS produktnummer TEXT;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS produktgruppe TEXT;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS kurzbezeichnung TEXT;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS langbezeichnung TEXT;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS netto_preis NUMERIC DEFAULT 0;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS brutto_preis NUMERIC DEFAULT 0;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS ust_satz NUMERIC DEFAULT 20;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS ist_lagerartikel BOOLEAN DEFAULT false;
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS ist_aktiv BOOLEAN DEFAULT true;
-- lieferant was added in previous migration, but IF NOT EXISTS is safe
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS lieferant TEXT;
