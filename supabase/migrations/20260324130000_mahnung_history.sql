-- Track when each Mahnung was created
CREATE TABLE IF NOT EXISTS public.mahnung_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  mahnstufe INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mahnung_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage mahnung_history"
  ON public.mahnung_history FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
