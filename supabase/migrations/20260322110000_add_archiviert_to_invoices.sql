-- Add archiviert flag to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS archiviert BOOLEAN DEFAULT false;
