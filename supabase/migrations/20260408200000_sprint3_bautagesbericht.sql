-- SPRINT 3: Bautagesbericht (Construction Daily Report)

CREATE TABLE IF NOT EXISTS bautagesberichte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nummer TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  wetter TEXT,
  temperatur_min NUMERIC(4,1),
  temperatur_max NUMERIC(4,1),
  ausgefuehrte_arbeiten TEXT,
  besondere_vorkommnisse TEXT,
  arbeitszeit_von TEXT,
  arbeitszeit_bis TEXT,
  pause_minuten INTEGER DEFAULT 0,
  bauleiter TEXT,
  auftraggeber_vertreter TEXT,
  status TEXT DEFAULT 'entwurf',
  unterschrift_bauleiter TEXT,
  unterschrift_kunde TEXT,
  unterschrift_am TIMESTAMPTZ,
  erstellt_von UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bautagesberichte_project ON bautagesberichte(project_id);
CREATE INDEX idx_bautagesberichte_datum ON bautagesberichte(datum DESC);

ALTER TABLE bautagesberichte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_btb" ON bautagesberichte FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_btb" ON bautagesberichte FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_btb" ON bautagesberichte FOR UPDATE USING (erstellt_von = auth.uid() OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "admin_delete_btb" ON bautagesberichte FOR DELETE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));

-- Workers
CREATE TABLE IF NOT EXISTS bautagesbericht_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bautagesbericht_id UUID NOT NULL REFERENCES bautagesberichte(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  name TEXT,
  stunden NUMERIC(5,2),
  taetigkeit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_btb_workers ON bautagesbericht_workers(bautagesbericht_id);
ALTER TABLE bautagesbericht_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_btb_workers" ON bautagesbericht_workers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Photos
CREATE TABLE IF NOT EXISTS bautagesbericht_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bautagesbericht_id UUID NOT NULL REFERENCES bautagesberichte(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  beschreibung TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_btb_photos ON bautagesbericht_photos(bautagesbericht_id);
ALTER TABLE bautagesbericht_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_btb_photos" ON bautagesbericht_photos FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('bautagesbericht-photos', 'bautagesbericht-photos', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "auth_upload_btb_photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bautagesbericht-photos' AND auth.role() = 'authenticated');
CREATE POLICY "public_read_btb_photos" ON storage.objects FOR SELECT USING (bucket_id = 'bautagesbericht-photos');
CREATE POLICY "auth_delete_btb_photos" ON storage.objects FOR DELETE USING (bucket_id = 'bautagesbericht-photos' AND auth.role() = 'authenticated');

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticator;
