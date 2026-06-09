-- SPRINT 4: Ersttermin-Formulare

-- A) Ersttermin Interessent (Customer First Meeting)
CREATE TABLE IF NOT EXISTS ersttermin_interessent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nummer TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES customer_contacts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  projektname TEXT, telefon TEXT, standort TEXT, email TEXT,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  berater TEXT,
  gewerke TEXT, projektart TEXT, umfang TEXT, entscheidungsstatus TEXT,
  zeitrahmen TEXT, budget NUMERIC(12,2), quelle TEXT, prioritaeten TEXT,
  checkliste JSONB DEFAULT '{}',
  zufahrt_parkplatz TEXT, infrastruktur TEXT, materialien TEXT,
  sicherheit TEXT, hindernisse TEXT, entsorgung TEXT,
  leistungsbeschreibung TEXT, firmen_intern TEXT, firmen_extern TEXT, aufmasse TEXT,
  status TEXT DEFAULT 'entwurf',
  notizen TEXT,
  erstellt_von UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_eti_customer ON ersttermin_interessent(customer_id);
CREATE INDEX idx_eti_datum ON ersttermin_interessent(datum DESC);
ALTER TABLE ersttermin_interessent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_eti" ON ersttermin_interessent FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_eti" ON ersttermin_interessent FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_eti" ON ersttermin_interessent FOR UPDATE USING (erstellt_von = auth.uid() OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "admin_delete_eti" ON ersttermin_interessent FOR DELETE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));

-- Photos
CREATE TABLE IF NOT EXISTS ersttermin_interessent_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ersttermin_interessent_id UUID NOT NULL REFERENCES ersttermin_interessent(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, file_name TEXT NOT NULL, beschreibung TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ersttermin_interessent_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_eti_photos" ON ersttermin_interessent_photos FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

INSERT INTO storage.buckets (id, name, public) VALUES ('ersttermin-photos', 'ersttermin-photos', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "auth_upload_eti_photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ersttermin-photos' AND auth.role() = 'authenticated');
CREATE POLICY "public_read_eti_photos" ON storage.objects FOR SELECT USING (bucket_id = 'ersttermin-photos');
CREATE POLICY "auth_delete_eti_photos" ON storage.objects FOR DELETE USING (bucket_id = 'ersttermin-photos' AND auth.role() = 'authenticated');

-- B) Ersttermin Projekt (Project Kickoff)
CREATE TABLE IF NOT EXISTS ersttermin_projekt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nummer TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ersttermin_interessent_id UUID REFERENCES ersttermin_interessent(id) ON DELETE SET NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  bauleiter TEXT, beteiligte TEXT, benoetigte_materialien TEXT,
  stunden_schaetzung NUMERIC(8,2), materialkosten NUMERIC(12,2),
  fremdkosten NUMERIC(12,2), gesamtkosten NUMERIC(12,2),
  freigabe_intern BOOLEAN DEFAULT FALSE,
  freigabe_kunde BOOLEAN DEFAULT FALSE,
  freigabe_behoerde BOOLEAN DEFAULT FALSE,
  freigabe_bemerkung TEXT,
  bekannte_risiken TEXT, besondere_anforderungen TEXT,
  freigabe_datum DATE, freigabe_unterschrift TEXT,
  status TEXT DEFAULT 'entwurf',
  notizen TEXT,
  erstellt_von UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_etp_project ON ersttermin_projekt(project_id);
ALTER TABLE ersttermin_projekt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_etp" ON ersttermin_projekt FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_etp" ON ersttermin_projekt FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_etp" ON ersttermin_projekt FOR UPDATE USING (erstellt_von = auth.uid() OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "admin_delete_etp" ON ersttermin_projekt FOR DELETE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));

-- Config seeds
INSERT INTO admin_config_options (kategorie, wert, label, sort_order) VALUES
  ('entscheidungsstatus', 'offen', 'Offen', 1),
  ('entscheidungsstatus', 'interessiert', 'Interessiert', 2),
  ('entscheidungsstatus', 'angebot_gewuenscht', 'Angebot gewünscht', 3),
  ('entscheidungsstatus', 'zugesagt', 'Zugesagt', 4),
  ('entscheidungsstatus', 'abgesagt', 'Abgesagt', 5)
ON CONFLICT (kategorie, wert) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticator;
