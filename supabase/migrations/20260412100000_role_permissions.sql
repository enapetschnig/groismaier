-- Add vorarbeiter role
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vorarbeiter';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Permission table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, feature)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_perms" ON public.role_permissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_perms" ON public.role_permissions FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));

-- Seed: Administrator (everything true)
INSERT INTO public.role_permissions (role, feature, can_view, can_edit) VALUES
  ('administrator','zeiterfassung',true,true),('administrator','projekte',true,true),
  ('administrator','meine_stunden',true,true),('administrator','regieberichte',true,true),
  ('administrator','rechnungen',true,true),('administrator','kalender',true,true),
  ('administrator','plantafel',true,true),('administrator','bautagesberichte',true,true),
  ('administrator','ersttermine',true,true),('administrator','protokolle',true,true),
  ('administrator','kunden',true,true),('administrator','materialien',true,true),
  ('administrator','admin',true,true),('administrator','stundenauswertung',true,true),
  -- Vorarbeiter
  ('vorarbeiter','zeiterfassung',true,true),('vorarbeiter','projekte',true,true),
  ('vorarbeiter','meine_stunden',true,true),('vorarbeiter','regieberichte',true,true),
  ('vorarbeiter','rechnungen',false,false),('vorarbeiter','kalender',true,true),
  ('vorarbeiter','plantafel',true,false),('vorarbeiter','bautagesberichte',true,true),
  ('vorarbeiter','ersttermine',false,false),('vorarbeiter','protokolle',true,true),
  ('vorarbeiter','kunden',false,false),('vorarbeiter','materialien',false,false),
  ('vorarbeiter','admin',false,false),('vorarbeiter','stundenauswertung',false,false),
  -- Mitarbeiter (basic only)
  ('mitarbeiter','zeiterfassung',true,true),('mitarbeiter','projekte',true,true),
  ('mitarbeiter','meine_stunden',true,true),('mitarbeiter','regieberichte',true,true),
  ('mitarbeiter','rechnungen',false,false),('mitarbeiter','kalender',false,false),
  ('mitarbeiter','plantafel',false,false),('mitarbeiter','bautagesberichte',false,false),
  ('mitarbeiter','ersttermine',false,false),('mitarbeiter','protokolle',false,false),
  ('mitarbeiter','kunden',false,false),('mitarbeiter','materialien',false,false),
  ('mitarbeiter','admin',false,false),('mitarbeiter','stundenauswertung',false,false)
ON CONFLICT (role, feature) DO NOTHING;

-- Realtime for live permission updates
ALTER PUBLICATION supabase_realtime ADD TABLE role_permissions;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticator;
