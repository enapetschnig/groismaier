-- Sprint 1 Migration: Project Status System, Contact History, Number Ranges
-- ==========================================================================

-- ============================================
-- 1. PROJECT STATUS SYSTEM + COLOR CODING
-- ============================================

-- Configurable project statuses with colors
CREATE TABLE IF NOT EXISTS project_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  farbe_bg TEXT NOT NULL DEFAULT '#3b82f6',
  farbe_text TEXT NOT NULL DEFAULT '#ffffff',
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: admin can manage, all authenticated can read
ALTER TABLE project_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_project_statuses" ON project_statuses FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "auth_read_project_statuses" ON project_statuses FOR SELECT USING (auth.role() = 'authenticated');

-- Seed default statuses
INSERT INTO project_statuses (name, farbe_bg, farbe_text, sort_order, is_default) VALUES
  ('Anfrage', '#f59e0b', '#ffffff', 1, FALSE),
  ('Angebot', '#3b82f6', '#ffffff', 2, FALSE),
  ('Auftrag', '#8b5cf6', '#ffffff', 3, FALSE),
  ('In Arbeit', '#10b981', '#ffffff', 4, TRUE),
  ('Pause', '#f97316', '#ffffff', 5, FALSE),
  ('Abnahme', '#06b6d4', '#ffffff', 6, FALSE),
  ('Abgeschlossen', '#6b7280', '#ffffff', 7, FALSE);

-- Add color fields to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS farbe_bg TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS farbe_text TEXT;

-- Migrate existing project statuses
UPDATE projects SET status = 'In Arbeit' WHERE status = 'aktiv';
UPDATE projects SET status = 'Abgeschlossen' WHERE status = 'geschlossen';

-- ============================================
-- 2. CONTACT HISTORY
-- ============================================

CREATE TABLE IF NOT EXISTS contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  typ TEXT NOT NULL DEFAULT 'notiz',
  betreff TEXT,
  beschreibung TEXT,
  datum TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dauer_minuten INTEGER,
  kontaktperson TEXT,
  erstellt_von UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contact_history_customer ON contact_history(customer_id);
CREATE INDEX idx_contact_history_project ON contact_history(project_id);
CREATE INDEX idx_contact_history_datum ON contact_history(datum DESC);

ALTER TABLE contact_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_contact_history" ON contact_history FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_contact_history" ON contact_history FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "user_insert_contact_history" ON contact_history FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "user_update_own_contact_history" ON contact_history FOR UPDATE USING (erstellt_von = auth.uid());
CREATE POLICY "user_delete_own_contact_history" ON contact_history FOR DELETE USING (erstellt_von = auth.uid());

-- ============================================
-- 3. NUMBER RANGES
-- ============================================

CREATE TABLE IF NOT EXISTS number_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  prefix TEXT DEFAULT '',
  suffix TEXT DEFAULT '',
  format_pattern TEXT DEFAULT '{PREFIX}{YY}{NNN}',
  start_nummer INTEGER DEFAULT 1,
  aktuelle_nummer INTEGER DEFAULT 0,
  stellen INTEGER DEFAULT 3,
  jahr_format TEXT DEFAULT 'YY',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE number_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_number_ranges" ON number_ranges FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));
CREATE POLICY "auth_read_number_ranges" ON number_ranges FOR SELECT USING (auth.role() = 'authenticated');

-- Seed default number ranges (migrate from app_settings)
INSERT INTO number_ranges (typ, label, prefix, stellen, start_nummer) VALUES
  ('rechnung', 'Rechnungen', '', 3, 1),
  ('angebot', 'Angebote', 'AN', 3, 1),
  ('regiebericht', 'Regieberichte', 'RB', 3, 1),
  ('bautagesbericht', 'Bautagesberichte', 'BTB', 3, 1),
  ('besprechungsprotokoll', 'Besprechungsprotokolle', 'BP', 3, 1),
  ('ersttermin', 'Ersttermine', 'ET', 3, 1)
ON CONFLICT (typ) DO NOTHING;

-- Create a generic next_document_number function
CREATE OR REPLACE FUNCTION public.next_document_number(p_typ TEXT, p_jahr INTEGER DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  nr RECORD;
  next_num INTEGER;
  year_str TEXT;
  result TEXT;
  actual_year INTEGER;
BEGIN
  actual_year := COALESCE(p_jahr, EXTRACT(YEAR FROM NOW())::INTEGER);

  SELECT * INTO nr FROM number_ranges WHERE typ = p_typ;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', p_typ;
  END IF;

  -- Calculate year string
  IF nr.jahr_format = 'YYYY' THEN
    year_str := actual_year::TEXT;
  ELSE
    year_str := LPAD((actual_year % 100)::TEXT, 2, '0');
  END IF;

  -- Get next number (max of aktuelle_nummer+1 and start_nummer)
  next_num := GREATEST(nr.aktuelle_nummer + 1, nr.start_nummer);

  -- Build the result string from format_pattern
  result := nr.format_pattern;
  result := REPLACE(result, '{PREFIX}', COALESCE(nr.prefix, ''));
  result := REPLACE(result, '{SUFFIX}', COALESCE(nr.suffix, ''));
  result := REPLACE(result, '{YY}', year_str);
  result := REPLACE(result, '{YYYY}', actual_year::TEXT);
  result := REPLACE(result, '{NNN}', LPAD(next_num::TEXT, nr.stellen, '0'));
  result := REPLACE(result, '{N}', next_num::TEXT);

  -- Update the counter
  UPDATE number_ranges SET aktuelle_nummer = next_num, updated_at = NOW() WHERE typ = p_typ;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.next_document_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number TO service_role;

-- ============================================
-- GRANTS FOR AUTHENTICATOR ROLE
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticator;
