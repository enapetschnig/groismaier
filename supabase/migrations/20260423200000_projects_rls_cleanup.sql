-- ============================================================
-- Safety-Cleanup: Stellt sicher, dass auf projects NUR die
-- projekt-basierte SELECT-Policy greift. Alle alten
-- "authenticated darf alles sehen"-Policies werden entfernt,
-- falls sie durch frühere Migrations noch existieren.
-- ============================================================

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND cmd = 'SELECT'
      AND policyname <> 'Users can view accessible projects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.projects', pol.policyname);
    RAISE NOTICE 'Alte SELECT-Policy entfernt: %', pol.policyname;
  END LOOP;
END $$;

-- Sicherstellen, dass die korrekte Policy existiert (idempotent).
DROP POLICY IF EXISTS "Users can view accessible projects" ON public.projects;
CREATE POLICY "Users can view accessible projects" ON public.projects
  FOR SELECT
  USING (
    is_active_user(auth.uid())
    AND user_can_access_project(auth.uid(), id)
  );

-- Zusätzlich: sicherstellen, dass RLS auf projects aktiv ist.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
