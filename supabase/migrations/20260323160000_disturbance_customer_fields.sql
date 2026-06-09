-- Add missing customer fields to disturbances
ALTER TABLE public.disturbances ADD COLUMN IF NOT EXISTS kunde_plz TEXT;
ALTER TABLE public.disturbances ADD COLUMN IF NOT EXISTS kunde_ort TEXT;
ALTER TABLE public.disturbances ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Add einheit to disturbance_materials (if not exists already)
ALTER TABLE public.disturbance_materials ADD COLUMN IF NOT EXISTS einheit TEXT DEFAULT 'Stk.';
