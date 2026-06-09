-- Default invoice layout settings
INSERT INTO app_settings (key, value, updated_at)
VALUES ('invoice_layout', '{}', now())
ON CONFLICT (key) DO NOTHING;

-- Storage bucket for custom logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read logos
CREATE POLICY "Public read logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

-- Allow admins to upload/manage logos
CREATE POLICY "Admin manage logos" ON storage.objects
  FOR ALL USING (
    bucket_id = 'logos'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );
