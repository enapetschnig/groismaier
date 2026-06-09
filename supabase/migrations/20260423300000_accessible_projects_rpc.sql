-- ============================================================
-- Zentrale Quelle der Wahrheit für "welche Projekte darf User X sehen":
-- RPC list_accessible_project_ids_for_user(p_user_id)
--   → Admin + Vorarbeiter = alle aktiven Projekte
--   → Mitarbeiter = nur Projekte wo verantwortlicher / bauleiter /
--     in zugewiesene_mitarbeiter
--
-- Wird verwendet von: whatsapp-webhook, whatsapp-onboarding,
-- whatsapp-daily-reminder + jeder Edge-Function / Frontend-Check.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_accessible_project_ids_for_user(
  p_user_id UUID,
  p_only_active BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(id UUID, name TEXT, status TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_id UUID;
  is_elevated BOOLEAN;
BEGIN
  is_elevated :=
    has_role(p_user_id, 'administrator'::app_role)
    OR has_role(p_user_id, 'vorarbeiter'::app_role);

  IF is_elevated THEN
    RETURN QUERY
      SELECT p.id, p.name, p.status::TEXT
      FROM public.projects p
      WHERE (NOT p_only_active) OR (p.status IS DISTINCT FROM 'Abgeschlossen')
      ORDER BY p.name;
    RETURN;
  END IF;

  SELECT e.id INTO emp_id FROM public.employees e WHERE e.user_id = p_user_id LIMIT 1;
  IF emp_id IS NULL THEN
    -- Kein Employee-Eintrag → keine Projekte sichtbar
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.name, p.status::TEXT
    FROM public.projects p
    WHERE ((NOT p_only_active) OR (p.status IS DISTINCT FROM 'Abgeschlossen'))
      AND (
        p.verantwortlicher_id = emp_id
        OR p.bauleiter_id = emp_id
        OR (p.zugewiesene_mitarbeiter ? emp_id::text)
      )
    ORDER BY p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_accessible_project_ids_for_user(UUID, BOOLEAN)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.list_accessible_project_ids_for_user IS
  'Zentrale Quelle der Wahrheit: welche Projekte darf dieser User sehen? Admins + Vorarbeiter: alles; Mitarbeiter: nur zugewiesene.';

-- Diagnose-Hilfe: welche Rolle + welche Projektzahl hat ein User?
CREATE OR REPLACE FUNCTION public.debug_user_project_access(p_user_id UUID)
RETURNS TABLE(
  role TEXT,
  employee_id UUID,
  accessible_count INTEGER,
  total_active_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_role TEXT;
  e_id UUID;
  acc_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT r.role::TEXT INTO u_role FROM public.user_roles r WHERE r.user_id = p_user_id LIMIT 1;
  SELECT e.id INTO e_id FROM public.employees e WHERE e.user_id = p_user_id LIMIT 1;
  SELECT COUNT(*) INTO acc_count FROM public.list_accessible_project_ids_for_user(p_user_id, TRUE);
  SELECT COUNT(*) INTO total_count FROM public.projects p WHERE p.status IS DISTINCT FROM 'Abgeschlossen';
  RETURN QUERY SELECT u_role, e_id, acc_count, total_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_user_project_access(UUID)
  TO authenticated, service_role;
