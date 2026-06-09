-- Add project_id and pdf_path to disturbances
ALTER TABLE public.disturbances ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.disturbances ADD COLUMN IF NOT EXISTS pdf_path TEXT;

-- Create storage bucket for Regiebericht PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('regiebericht-pdfs', 'regiebericht-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Auth users can read regiebericht pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'regiebericht-pdfs');

CREATE POLICY "Auth users can upload regiebericht pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'regiebericht-pdfs');

CREATE POLICY "Service role can manage regiebericht pdfs"
  ON storage.objects FOR ALL
  USING (bucket_id = 'regiebericht-pdfs')
  WITH CHECK (bucket_id = 'regiebericht-pdfs');
