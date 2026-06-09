-- Add customer_id to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
