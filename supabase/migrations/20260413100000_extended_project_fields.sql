-- Extended project fields from Formular_Projekterfassung

-- Projektnummer (auto-generated from number_ranges)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS projektnummer TEXT;

-- Projekt-Typ (Hauptprojekt, Unterprojekt, Einzelprojekt)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS projekt_typ TEXT DEFAULT 'einzelprojekt';

-- Zusatzinfos (additional info, directions, key location etc.)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zusatzinfos TEXT;

-- Wegbeschreibung (route description / Google Maps)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wegbeschreibung TEXT;

-- Art der Leistung (service types - stored as JSONB array of strings)
-- e.g. ["beratung", "montage", "reparatur"]
ALTER TABLE projects ADD COLUMN IF NOT EXISTS leistungsarten JSONB DEFAULT '[]';

-- Zugewiesene Mitarbeiter (assigned team members - JSONB array of employee IDs)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zugewiesene_mitarbeiter JSONB DEFAULT '[]';

-- Projektverantwortlicher (project responsible, separate from bauleiter)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS verantwortlicher_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Erfasst durch (recorded by)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS erfasst_von UUID REFERENCES auth.users(id);

-- Erfassungsdatum
ALTER TABLE projects ADD COLUMN IF NOT EXISTS erfasst_am DATE;

-- Land (country for project location)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS land TEXT;

-- Seed: Leistungsarten config options
INSERT INTO admin_config_options (kategorie, wert, label, sort_order) VALUES
  ('leistungsart', 'beratung', 'Beratung', 1),
  ('leistungsart', 'planung', 'Planung', 2),
  ('leistungsart', 'lieferung', 'Lieferung', 3),
  ('leistungsart', 'montage', 'Montage', 4),
  ('leistungsart', 'reparatur', 'Reparatur', 5),
  ('leistungsart', 'wartung', 'Wartung', 6),
  ('leistungsart', 'sanierung', 'Sanierung', 7),
  ('leistungsart', 'sonstiges', 'Sonstiges', 8)
ON CONFLICT (kategorie, wert) DO NOTHING;

-- Seed: Projekt-Typ config options
INSERT INTO admin_config_options (kategorie, wert, label, sort_order) VALUES
  ('projekt_typ', 'hauptprojekt', 'Hauptprojekt', 1),
  ('projekt_typ', 'unterprojekt', 'Unterprojekt', 2),
  ('projekt_typ', 'einzelprojekt', 'Einzelprojekt', 3)
ON CONFLICT (kategorie, wert) DO NOTHING;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
