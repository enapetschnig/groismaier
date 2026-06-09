-- Eingangsrechnungen (purchase invoices / received invoices & receipts)
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Core fields
  lieferant TEXT NOT NULL,
  rechnungsnummer TEXT,
  rechnungsdatum DATE,
  faellig_am DATE,
  bezahlt_am DATE,
  betrag_netto NUMERIC(12,2),
  betrag_brutto NUMERIC(12,2) NOT NULL,
  ust_satz NUMERIC(5,2) DEFAULT 20,

  -- Categorization
  kategorie TEXT DEFAULT 'material', -- material, fremdleistung, werkzeug, miete, treibstoff, buero, sonstiges
  zahlungsart TEXT,                   -- ueberweisung, bar, karte, lastschrift
  status TEXT DEFAULT 'offen',        -- offen, bezahlt, abgelehnt

  -- File
  pdf_path TEXT,
  mime_type TEXT,
  file_name TEXT,

  notizen TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_project ON public.purchase_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_datum ON public.purchase_invoices(rechnungsdatum DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON public.purchase_invoices(status);

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage purchase_invoices" ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "Vorarbeiter can manage purchase_invoices" ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vorarbeiter'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vorarbeiter'::app_role));

-- Storage bucket for scanned invoices/receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-invoices', 'purchase-invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth users can read purchase-invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'purchase-invoices');

CREATE POLICY "Auth users can upload purchase-invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'purchase-invoices');

CREATE POLICY "Auth users can delete purchase-invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'purchase-invoices');

-- Permission entry in role_permissions
INSERT INTO role_permissions (role, feature, can_view, can_edit)
VALUES
  ('administrator', 'eingangsrechnungen', true, true),
  ('vorarbeiter',   'eingangsrechnungen', true, true),
  ('mitarbeiter',   'eingangsrechnungen', false, false)
ON CONFLICT (role, feature) DO NOTHING;
