-- Payment tracking for invoices
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  betrag NUMERIC(10,2) NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  notizen TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage payments"
  ON public.invoice_payments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
