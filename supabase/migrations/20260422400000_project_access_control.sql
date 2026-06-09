-- ============================================================
-- Projekt-basierte Berechtigungen (Zeilen-Ebene, RLS)
--
-- Regel:
--   - Administrator + Vorarbeiter sehen alle Projekte und alle
--     projekt-gebundenen Daten.
--   - Mitarbeiter sehen nur Projekte, in denen sie
--     * als Projektverantwortlicher oder Bauleiter hinterlegt sind
--       ODER
--     * in der JSONB-Liste projects.zugewiesene_mitarbeiter stehen.
--   - Zusätzlich: Mitarbeiter dürfen Eingangsrechnungen hochladen
--     (INSERT), sehen aber nur ihre eigenen (SELECT). Keine fremden.
--   - Plantafel-Menüpunkt wird für Mitarbeiter abgeschaltet.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Zentrale Zugriffsfunktion
-- ------------------------------------------------------------
-- zugewiesene_mitarbeiter enthält employee.id als JSON-Strings.
-- Wir mappen auth.users.id → employees.id über employees.user_id.

CREATE OR REPLACE FUNCTION public.user_can_access_project(
  p_user_id UUID,
  p_project_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_id UUID;
BEGIN
  -- NULL-Projekt → immer sichtbar (z.B. globale Einträge ohne Projekt)
  IF p_project_id IS NULL THEN
    RETURN TRUE;
  END IF;
  -- Admins + Vorarbeiter sehen alles
  IF has_role(p_user_id, 'administrator'::app_role) OR has_role(p_user_id, 'vorarbeiter'::app_role) THEN
    RETURN TRUE;
  END IF;
  -- employee.id für den auth-User suchen
  SELECT id INTO emp_id FROM public.employees WHERE user_id = p_user_id LIMIT 1;
  IF emp_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND (
        p.verantwortlicher_id = emp_id
        OR p.bauleiter_id = emp_id
        OR (p.zugewiesene_mitarbeiter ? emp_id::text)
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_project(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2) RLS auf projects: Mitarbeiter sehen nur eigene
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;
CREATE POLICY "Users can view accessible projects" ON public.projects
  FOR SELECT
  USING (
    is_active_user(auth.uid())
    AND user_can_access_project(auth.uid(), id)
  );

-- ------------------------------------------------------------
-- 3) RLS auf bautagesberichte
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_read_btb" ON public.bautagesberichte;
CREATE POLICY "auth_read_btb" ON public.bautagesberichte
  FOR SELECT
  USING (user_can_access_project(auth.uid(), project_id));

-- ------------------------------------------------------------
-- 4) RLS auf einsaetze (Plantafel-Einträge)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users can read einsaetze" ON public.einsaetze;
DROP POLICY IF EXISTS "Users can read own einsaetze" ON public.einsaetze;
CREATE POLICY "Einsaetze: auf zugängliche Projekte" ON public.einsaetze
  FOR SELECT
  USING (
    -- Admin/Vorarbeiter sehen alles; sonst nur Einsätze des eigenen
    -- Users ODER Einsätze auf zugänglichen Projekten.
    has_role(auth.uid(), 'administrator'::app_role)
    OR has_role(auth.uid(), 'vorarbeiter'::app_role)
    OR user_id = auth.uid()
    OR user_can_access_project(auth.uid(), project_id)
  );

-- ------------------------------------------------------------
-- 5) RLS auf assignment_resources
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_read_assignment_resources" ON public.assignment_resources;
CREATE POLICY "Assignment Resources: auf zugängliche Projekte" ON public.assignment_resources
  FOR SELECT
  USING (user_can_access_project(auth.uid(), project_id));

-- ------------------------------------------------------------
-- 6) RLS auf project_daily_targets
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_read_project_daily_targets" ON public.project_daily_targets;
CREATE POLICY "Project Daily Targets: auf zugängliche Projekte" ON public.project_daily_targets
  FOR SELECT
  USING (user_can_access_project(auth.uid(), project_id));

-- ------------------------------------------------------------
-- 7) RLS auf board_projects
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users can read board_projects" ON public.board_projects;
CREATE POLICY "Board Projects: auf zugängliche Projekte" ON public.board_projects
  FOR SELECT
  USING (user_can_access_project(auth.uid(), project_id));

-- ------------------------------------------------------------
-- 8) RLS auf contact_history
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_read_contact_history" ON public.contact_history;
CREATE POLICY "Contact History: auf zugängliche Projekte" ON public.contact_history
  FOR SELECT
  USING (
    -- Kundenspezifische Einträge ohne project_id → sichtbar
    -- wenn authenticated (Kunden-Sicht steuert das Feature "kunden").
    -- Mit project_id: nur wenn zugänglich.
    project_id IS NULL
    OR user_can_access_project(auth.uid(), project_id)
  );

-- ------------------------------------------------------------
-- 9) RLS auf purchase_invoices (Eingangsrechnungen)
--    - Admin + Vorarbeiter: volle Kontrolle (bestehend)
--    - Mitarbeiter: INSERT + SELECT nur eigene
-- ------------------------------------------------------------
CREATE POLICY "Mitarbeiter can insert purchase_invoices" ON public.purchase_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active_user(auth.uid())
    AND auth.uid() = created_by
  );

CREATE POLICY "Mitarbeiter can view own purchase_invoices" ON public.purchase_invoices
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
  );

-- ------------------------------------------------------------
-- 10) role_permissions: Mitarbeiter dürfen Eingangsrechnungen
--     sehen (Menüpunkt sichtbar machen), Plantafel-Menü wird aus.
-- ------------------------------------------------------------

-- Plantafel für Mitarbeiter ausblenden
UPDATE public.role_permissions
SET can_view = FALSE, can_edit = FALSE
WHERE role = 'mitarbeiter' AND feature = 'plantafel';

-- Eingangsrechnungen für Mitarbeiter sichtbar (Upload-Funktion)
UPDATE public.role_permissions
SET can_view = TRUE, can_edit = TRUE
WHERE role = 'mitarbeiter' AND feature = 'eingangsrechnungen';

-- Falls kein Eintrag existiert: anlegen
INSERT INTO public.role_permissions (role, feature, can_view, can_edit)
VALUES ('mitarbeiter', 'eingangsrechnungen', TRUE, TRUE)
ON CONFLICT (role, feature) DO UPDATE
SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit;
