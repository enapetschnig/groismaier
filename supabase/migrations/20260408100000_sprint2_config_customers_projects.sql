-- SPRINT 2: Config-Framework + Extended Customers + Extended Projects

-- 1) Configurable dropdown options
CREATE TABLE IF NOT EXISTS admin_config_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kategorie TEXT NOT NULL,
  wert TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  farbe TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(kategorie, wert)
);
CREATE INDEX idx_config_options_kategorie ON admin_config_options(kategorie);
ALTER TABLE admin_config_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_config_options" ON admin_config_options FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "auth_read_config_options" ON admin_config_options FOR SELECT USING (auth.role() = 'authenticated');

-- Seed wetter
INSERT INTO admin_config_options (kategorie, wert, label, sort_order, farbe) VALUES
  ('wetter', 'sonnig', 'Sonnig', 1, '#f59e0b'),
  ('wetter', 'bewoelkt', 'Bewölkt', 2, '#9ca3af'),
  ('wetter', 'regen', 'Regen', 3, '#3b82f6'),
  ('wetter', 'schnee', 'Schnee', 4, '#e5e7eb'),
  ('wetter', 'nebel', 'Nebel', 5, '#d1d5db'),
  ('wetter', 'sturm', 'Sturm/Wind', 6, '#6b7280'),
  ('wetter', 'frost', 'Frost', 7, '#93c5fd');

-- Seed projektart
INSERT INTO admin_config_options (kategorie, wert, label, sort_order) VALUES
  ('projektart', 'neubau', 'Neubau', 1),
  ('projektart', 'sanierung', 'Sanierung', 2),
  ('projektart', 'umbau', 'Umbau', 3),
  ('projektart', 'reparatur', 'Reparatur', 4),
  ('projektart', 'wartung', 'Wartung', 5),
  ('projektart', 'montage', 'Montage', 6),
  ('projektart', 'beratung', 'Beratung', 7);

-- Seed prioritaet
INSERT INTO admin_config_options (kategorie, wert, label, sort_order, farbe) VALUES
  ('prioritaet', 'niedrig', 'Niedrig', 1, '#22c55e'),
  ('prioritaet', 'normal', 'Normal', 2, '#3b82f6'),
  ('prioritaet', 'hoch', 'Hoch', 3, '#f59e0b'),
  ('prioritaet', 'kritisch', 'Kritisch', 4, '#ef4444');

-- 2) Extended customer fields
ALTER TABLE customers ADD COLUMN IF NOT EXISTS kundentyp TEXT DEFAULT 'geschaeftskunde';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS firmenname TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branche TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rechnungs_adresse TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rechnungs_plz TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rechnungs_ort TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rechnungs_land TEXT;

-- 3) Customer contacts
CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  anrede TEXT,
  titel TEXT,
  vorname TEXT,
  nachname TEXT,
  position TEXT,
  email TEXT,
  telefon TEXT,
  telefon2 TEXT,
  ist_hauptkontakt BOOLEAN DEFAULT FALSE,
  notizen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_customer_contacts_customer ON customer_contacts(customer_id);
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_customer_contacts" ON customer_contacts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_customer_contacts" ON customer_contacts FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "auth_manage_customer_contacts" ON customer_contacts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_customer_contacts" ON customer_contacts FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_customer_contacts" ON customer_contacts FOR DELETE USING (auth.role() = 'authenticated');

-- 4) Extended project fields
ALTER TABLE projects ADD COLUMN IF NOT EXISTS projektart TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS prioritaet TEXT DEFAULT 'normal';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geplanter_start DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geplantes_ende DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget NUMERIC(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS auftragsvolumen NUMERIC(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bauleiter_id UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ort TEXT;

-- 5) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticator;
