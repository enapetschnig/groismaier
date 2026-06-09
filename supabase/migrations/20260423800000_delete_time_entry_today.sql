-- ============================================================
-- Einmaliger Cleanup: Zeiteintrag von Christoph Napetschnig auf das
-- Sabine&Colin-Projekt für den heutigen Tag löschen.
-- ============================================================

DO $$
DECLARE
  v_user_id UUID;
  v_project_id UUID;
  v_count INTEGER;
BEGIN
  -- User finden
  SELECT e.user_id INTO v_user_id
  FROM public.employees e
  WHERE lower(e.vorname) = 'christoph' AND lower(e.nachname) = 'napetschnig'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Kein Mitarbeiter Christoph Napetschnig gefunden.';
    RETURN;
  END IF;

  -- Projekt finden (Name beginnt mit Sabine&Colin)
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE name ILIKE 'Sabine&Colin%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Kein Projekt "Sabine&Colin..." gefunden.';
    RETURN;
  END IF;

  -- Wie viele Einträge betroffen?
  SELECT COUNT(*) INTO v_count
  FROM public.time_entries
  WHERE user_id = v_user_id
    AND project_id = v_project_id
    AND datum = CURRENT_DATE;

  IF v_count = 0 THEN
    RAISE NOTICE 'Kein Zeiteintrag für heute gefunden. user=%, project=%, datum=%', v_user_id, v_project_id, CURRENT_DATE;
    RETURN;
  END IF;

  DELETE FROM public.time_entries
  WHERE user_id = v_user_id
    AND project_id = v_project_id
    AND datum = CURRENT_DATE;

  RAISE NOTICE 'Gelöscht: % Zeiteintrag/e für user=%, project=%, datum=%', v_count, v_user_id, v_project_id, CURRENT_DATE;
END $$;
