-- Add missing lieferant column to invoice_templates
ALTER TABLE public.invoice_templates ADD COLUMN IF NOT EXISTS lieferant text;
