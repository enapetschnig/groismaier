-- =============================================
-- Plantafel Redesign: Teams, Board Projects, Einsätze
-- =============================================

-- 1. Teams
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read teams" ON public.teams
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage teams" ON public.teams
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Vorarbeiter can manage teams" ON public.teams
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vorarbeiter'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vorarbeiter'::app_role));

-- 2. Team Members
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read team_members" ON public.team_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage team_members" ON public.team_members
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Vorarbeiter can manage team_members" ON public.team_members
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vorarbeiter'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vorarbeiter'::app_role));

-- 3. Board Projects (which projects appear on the Plantafel)
CREATE TABLE IF NOT EXISTS public.board_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  board_color TEXT DEFAULT '#A7C7E7',
  color_mode TEXT DEFAULT 'custom' CHECK (color_mode IN ('status', 'custom')),
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id)
);

ALTER TABLE public.board_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read board_projects" ON public.board_projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage board_projects" ON public.board_projects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Vorarbeiter can manage board_projects" ON public.board_projects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vorarbeiter'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vorarbeiter'::app_role));

-- 4. Einsätze (replaces worker_assignments)
CREATE TABLE IF NOT EXISTS public.einsaetze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT,
  adresse TEXT,
  beschreibung TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  ganztaegig BOOLEAN DEFAULT true,
  start_time TEXT DEFAULT '07:00',
  end_time TEXT DEFAULT '16:00',
  google_event_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_einsaetze_user_dates ON public.einsaetze(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_einsaetze_project ON public.einsaetze(project_id);
CREATE INDEX IF NOT EXISTS idx_einsaetze_dates ON public.einsaetze(start_date, end_date);

ALTER TABLE public.einsaetze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read einsaetze" ON public.einsaetze
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage einsaetze" ON public.einsaetze
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "Vorarbeiter can manage einsaetze" ON public.einsaetze
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'vorarbeiter'::app_role))
  WITH CHECK (has_role(auth.uid(), 'vorarbeiter'::app_role));
CREATE POLICY "Users can read own einsaetze" ON public.einsaetze
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 5. Migrate worker_assignments → einsaetze (group consecutive days)
-- Only runs if worker_assignments has data
INSERT INTO public.einsaetze (user_id, project_id, name, start_date, end_date, ganztaegig, start_time, end_time, google_event_id, created_by, created_at)
SELECT
  user_id,
  project_id,
  NULL as name,
  MIN(datum) as start_date,
  MAX(datum) as end_date,
  true as ganztaegig,
  MIN(start_time) as start_time,
  MAX(end_time) as end_time,
  MIN(google_event_id) as google_event_id,
  (array_agg(created_by))[1] as created_by,
  MIN(created_at) as created_at
FROM (
  SELECT *,
    datum - (ROW_NUMBER() OVER (PARTITION BY user_id, project_id ORDER BY datum))::int AS grp
  FROM public.worker_assignments
) sub
GROUP BY user_id, project_id, grp;

-- 6. Rename old table (keep for safety)
ALTER TABLE IF EXISTS public.worker_assignments RENAME TO worker_assignments_legacy;
