-- SPRINT 5: Besprechungsprotokoll + Extended Employee Data

-- A) Besprechungsprotokolle
CREATE TABLE IF NOT EXISTS besprechungsprotokolle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nummer TEXT,
  typ TEXT DEFAULT 'persoenlich',
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  zeit_von TEXT, zeit_bis TEXT, ort TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  teilnehmer TEXT,
  inhalt TEXT, vereinbarungen TEXT, offene_fragen TEXT,
  protokollant TEXT,
  status TEXT DEFAULT 'entwurf',
  erstellt_von UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_bp_customer ON besprechungsprotokolle(customer_id);
CREATE INDEX idx_bp_project ON besprechungsprotokolle(project_id);
CREATE INDEX idx_bp_datum ON besprechungsprotokolle(datum DESC);
ALTER TABLE besprechungsprotokolle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_bp" ON besprechungsprotokolle FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_bp" ON besprechungsprotokolle FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_bp" ON besprechungsprotokolle FOR UPDATE USING (erstellt_von = auth.uid() OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "admin_delete_bp" ON besprechungsprotokolle FOR DELETE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));

-- Action items
CREATE TABLE IF NOT EXISTS besprechungsprotokoll_massnahmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protokoll_id UUID NOT NULL REFERENCES besprechungsprotokolle(id) ON DELETE CASCADE,
  aufgabe TEXT NOT NULL,
  verantwortlich TEXT,
  frist DATE,
  erledigt BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE besprechungsprotokoll_massnahmen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_bp_m" ON besprechungsprotokoll_massnahmen FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Config seeds
INSERT INTO admin_config_options (kategorie, wert, label, sort_order) VALUES
  ('besprechungstyp', 'persoenlich', 'Persönlich', 1),
  ('besprechungstyp', 'telefonisch', 'Telefonisch', 2),
  ('besprechungstyp', 'video', 'Videokonferenz', 3)
ON CONFLICT (kategorie, wert) DO NOTHING;

INSERT INTO admin_config_options (kategorie, wert, label, sort_order) VALUES
  ('familienstand', 'ledig', 'Ledig', 1),
  ('familienstand', 'verheiratet', 'Verheiratet', 2),
  ('familienstand', 'geschieden', 'Geschieden', 3),
  ('familienstand', 'verwitwet', 'Verwitwet', 4)
ON CONFLICT (kategorie, wert) DO NOTHING;

-- B) Extended Employee Data
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationalitaet TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS familienstand TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fuehrerschein TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notfallkontakt_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notfallkontakt_telefon TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notfallkontakt_beziehung TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS abteilung TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticator;
