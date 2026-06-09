
-- 1. Create invoice_templates table
CREATE TABLE public.invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  beschreibung text NOT NULL,
  einheit text DEFAULT 'Stk.',
  einzelpreis numeric DEFAULT 0,
  kategorie text DEFAULT 'Allgemein',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoice templates" ON public.invoice_templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'administrator'::app_role)) WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "Authenticated users can view invoice templates" ON public.invoice_templates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 2. Add bezahlt_betrag column to invoices
ALTER TABLE public.invoices ADD COLUMN bezahlt_betrag numeric DEFAULT 0;

-- 3. Create invoice-pdfs storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-pdfs', 'invoice-pdfs', false);

CREATE POLICY "Admins can upload invoice pdfs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoice-pdfs' AND has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "Admins can read invoice pdfs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoice-pdfs' AND has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "Users can read own invoice pdfs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own invoice pdfs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
