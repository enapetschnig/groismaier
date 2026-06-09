-- ============================================================
-- Sicherstellen, dass Admin + Vorarbeiter projects UPDATEN dürfen.
-- Bisher war nur "Admins can update projects" gesetzt.
-- Das syncEmployeeProjectAccess läuft mit dem JWT des Admins — also
-- braucht der UPDATE-Policy-Check has_role(admin) ODER has_role(vorarbeiter).
-- ============================================================

DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins or Vorarbeiter can update projects" ON public.projects;
CREATE POLICY "Admins or Vorarbeiter can update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (
    is_active_user(auth.uid())
    AND (
      has_role(auth.uid(), 'administrator'::app_role)
      OR has_role(auth.uid(), 'vorarbeiter'::app_role)
    )
  )
  WITH CHECK (
    is_active_user(auth.uid())
    AND (
      has_role(auth.uid(), 'administrator'::app_role)
      OR has_role(auth.uid(), 'vorarbeiter'::app_role)
    )
  );

-- Sicherheits-Helper: Wenn ein Update irgendwie blockiert wird, kann
-- der Admin die syncEmployeeProjectAccess stattdessen über das RPC
-- ausführen, das SECURITY DEFINER läuft und RLS umgeht.
CREATE OR REPLACE FUNCTION public.set_employee_project_access(
  p_employee_id UUID,
  p_project_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_added INTEGER := 0;
  v_removed INTEGER := 0;
  rec RECORD;
BEGIN
  v_caller := auth.uid();
  -- Caller muss Admin oder Vorarbeiter sein
  IF NOT (has_role(v_caller, 'administrator'::app_role) OR has_role(v_caller, 'vorarbeiter'::app_role)) THEN
    RAISE EXCEPTION 'Nur Administrator/Vorarbeiter dürfen Projekt-Zugänge ändern.';
  END IF;

  -- Entfernen, wo employee drin ist, Projekt aber NICHT in p_project_ids
  FOR rec IN
    SELECT p.id, p.zugewiesene_mitarbeiter
    FROM public.projects p
    WHERE p.zugewiesene_mitarbeiter ? p_employee_id::text
      AND p.id <> ALL(p_project_ids)
  LOOP
    UPDATE public.projects
    SET zugewiesene_mitarbeiter = COALESCE(
      (SELECT jsonb_agg(val) FROM jsonb_array_elements_text(rec.zugewiesene_mitarbeiter) AS val WHERE val <> p_employee_id::text),
      '[]'::jsonb
    )
    WHERE id = rec.id;
    v_removed := v_removed + 1;
  END LOOP;

  -- Hinzufügen, wo Projekt in p_project_ids aber employee NICHT drin ist
  FOR rec IN
    SELECT p.id, p.zugewiesene_mitarbeiter
    FROM public.projects p
    WHERE p.id = ANY(p_project_ids)
      AND NOT (p.zugewiesene_mitarbeiter ? p_employee_id::text)
  LOOP
    UPDATE public.projects
    SET zugewiesene_mitarbeiter = COALESCE(rec.zugewiesene_mitarbeiter, '[]'::jsonb) || jsonb_build_array(p_employee_id::text)
    WHERE id = rec.id;
    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'removed', v_removed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_employee_project_access(UUID, UUID[]) TO authenticated;
