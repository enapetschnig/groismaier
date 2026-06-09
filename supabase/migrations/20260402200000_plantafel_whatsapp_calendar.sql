-- ============================================================
-- MONTI.PRO: Plantafel, WhatsApp, Calendar, Employee Colors
-- ============================================================

-- ============================
-- 1) PLANTAFEL / WORKER ASSIGNMENTS
-- ============================

CREATE TABLE IF NOT EXISTS worker_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  notizen TEXT,
  start_time TEXT DEFAULT '07:00',
  end_time TEXT DEFAULT '16:00',
  google_event_id TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE worker_assignments ADD CONSTRAINT worker_assignments_unique
  UNIQUE (user_id, project_id, datum, start_time);

CREATE INDEX idx_worker_assignments_user_datum ON worker_assignments(user_id, datum);
CREATE INDEX idx_worker_assignments_project ON worker_assignments(project_id);
CREATE INDEX idx_worker_assignments_datum ON worker_assignments(datum);

ALTER TABLE worker_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_worker_assignments" ON worker_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

CREATE POLICY "user_read_own_assignments" ON worker_assignments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "vorarbeiter_manage_assignments" ON worker_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND position = 'vorarbeiter')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND position = 'vorarbeiter')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE worker_assignments;

-- ============================
-- 2) ASSIGNMENT RESOURCES
-- ============================

CREATE TABLE IF NOT EXISTS assignment_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  resource_name TEXT NOT NULL,
  menge NUMERIC(10,2),
  einheit TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, datum, resource_name)
);

CREATE INDEX idx_assignment_resources_project_datum ON assignment_resources(project_id, datum);

ALTER TABLE assignment_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_assignment_resources" ON assignment_resources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

CREATE POLICY "auth_read_assignment_resources" ON assignment_resources
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "vorarbeiter_manage_resources" ON assignment_resources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND position = 'vorarbeiter')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND position = 'vorarbeiter')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE assignment_resources;

-- ============================
-- 3) PROJECT DAILY TARGETS
-- ============================

CREATE TABLE IF NOT EXISTS project_daily_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  tagesziel TEXT,
  nachkalkulation_stunden NUMERIC(6,2),
  notizen TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, datum)
);

CREATE INDEX idx_project_daily_targets_project_datum ON project_daily_targets(project_id, datum);

ALTER TABLE project_daily_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_project_daily_targets" ON project_daily_targets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

CREATE POLICY "auth_read_project_daily_targets" ON project_daily_targets
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "vorarbeiter_manage_daily_targets" ON project_daily_targets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND position = 'vorarbeiter')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND position = 'vorarbeiter')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE project_daily_targets;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_daily_targets_updated_at
  BEFORE UPDATE ON project_daily_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================
-- 4) COMPANY HOLIDAYS
-- ============================

CREATE TABLE IF NOT EXISTS company_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datum DATE NOT NULL UNIQUE,
  bezeichnung TEXT DEFAULT 'Betriebsurlaub',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE company_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_company_holidays" ON company_holidays
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

CREATE POLICY "auth_read_company_holidays" ON company_holidays
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_company_holidays_datum ON company_holidays(datum);

-- ============================
-- 5) EMPLOYEE SCHEDULE COLORS (NEU - Admin konfigurierbar)
-- ============================

CREATE TABLE IF NOT EXISTS employee_schedule_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
  bg_color TEXT NOT NULL DEFAULT '#3b82f6',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE employee_schedule_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_employee_colors" ON employee_schedule_colors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

CREATE POLICY "auth_read_employee_colors" ON employee_schedule_colors
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================
-- 6) WHATSAPP MESSAGES
-- ============================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_body TEXT,
  message_type TEXT DEFAULT 'text',
  employee_id UUID REFERENCES employees(id),
  user_id UUID REFERENCES auth.users(id),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_whatsapp" ON whatsapp_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

CREATE POLICY "service_role_whatsapp" ON whatsapp_messages
  FOR ALL USING (true) WITH CHECK (true);

-- WhatsApp flag on employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp_aktiv BOOLEAN DEFAULT false;

-- ============================
-- 7) CALENDAR EVENTS (Google Calendar Sync)
-- ============================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  google_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  all_day BOOLEAN DEFAULT true,
  start_time TEXT,
  end_time TEXT,
  description TEXT,
  mitarbeiter TEXT[],
  calendar_type TEXT,
  project_type TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_calendar" ON calendar_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_manage_calendar" ON calendar_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

-- ============================
-- 8) APP SETTINGS DEFAULTS
-- ============================

INSERT INTO app_settings (key, value) VALUES
  ('whatsapp_enabled', 'true'),
  ('whatsapp_reminder_enabled', 'true'),
  ('whatsapp_reminder_time', '17:00'),
  ('whatsapp_reminder_days', 'mo,di,mi,do,fr'),
  ('whatsapp_morning_enabled', 'true'),
  ('whatsapp_morning_time', '07:00'),
  ('whatsapp_bot_name', 'MONTI.PRO Assistent')
ON CONFLICT (key) DO NOTHING;
