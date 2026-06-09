
-- Create customers table
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  ansprechpartner text,
  uid_nummer text,
  adresse text,
  plz text,
  ort text,
  land text DEFAULT 'Österreich',
  email text,
  telefon text,
  notizen text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Owner can CRUD own customers
CREATE POLICY "Users can view own customers" ON public.customers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customers" ON public.customers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customers" ON public.customers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own customers" ON public.customers FOR DELETE USING (auth.uid() = user_id);

-- Admins full access
CREATE POLICY "Admins can view all customers" ON public.customers FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Admins can insert customers" ON public.customers FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Admins can update all customers" ON public.customers FOR UPDATE USING (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Admins can delete all customers" ON public.customers FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role));

-- Add customer_id to invoices
ALTER TABLE public.invoices ADD COLUMN customer_id uuid REFERENCES public.customers(id);

-- Updated_at trigger for customers
CREATE TRIGGER touch_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
