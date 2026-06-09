-- Zweiter Versuch: Christoph-Zeiteintrag löschen mit flexiblerer Suche.

DO $$
DECLARE
  v_user_id UUID;
  v_project_id UUID;
  v_count INTEGER;
  rec RECORD;
BEGIN
  -- Flexibel: Vorname ILIKE christoph% oder chris%
  RAISE NOTICE 'Suche Mitarbeiter mit Vorname christoph oder chris...';
  FOR rec IN
    SELECT e.id, e.user_id, e.vorname, e.nachname
    FROM public.employees e
    WHERE e.vorname ILIKE 'chris%' OR e.nachname ILIKE 'napetsch%'
    LIMIT 10
  LOOP
    RAISE NOTICE '  employee: % (user_id=%, vorname=%, nachname=%)', rec.id, rec.user_id, rec.vorname, rec.nachname;
    IF rec.user_id IS NOT NULL AND v_user_id IS NULL THEN
      v_user_id := rec.user_id;
    END IF;
  END LOOP;

  -- Alternative: über profiles suchen
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE vorname ILIKE 'chris%' OR nachname ILIKE 'napetsch%'
    LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      RAISE NOTICE '  profile-user_id: %', v_user_id;
    END IF;
  END IF;

  -- Alternative: über auth.users (email)
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email ILIKE '%napetschnig%' OR email = 'hallo@epowergmbh.at'
    LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      RAISE NOTICE '  auth-user_id: %', v_user_id;
    END IF;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Kein passender User gefunden. Abbruch.';
    RETURN;
  END IF;

  -- Projekt: Sabine&Colin
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE name ILIKE '%sabine%colin%' OR name ILIKE '%sabine%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Kein Sabine-Projekt gefunden.';
    RETURN;
  END IF;
  RAISE NOTICE 'Projekt gefunden: %', v_project_id;

  SELECT COUNT(*) INTO v_count
  FROM public.time_entries
  WHERE user_id = v_user_id
    AND project_id = v_project_id
    AND datum = CURRENT_DATE;

  IF v_count = 0 THEN
    RAISE NOTICE 'Kein Zeiteintrag für heute (%) auf project=% für user=%', CURRENT_DATE, v_project_id, v_user_id;
    -- Als Diagnose: zeige alle heutigen Einträge des Users
    FOR rec IN
      SELECT te.id, te.datum, te.stunden, te.taetigkeit, p.name AS projekt
      FROM public.time_entries te
      LEFT JOIN public.projects p ON p.id = te.project_id
      WHERE te.user_id = v_user_id AND te.datum = CURRENT_DATE
    LOOP
      RAISE NOTICE '  heutiger Eintrag: % % h "%" auf "%"', rec.id, rec.stunden, rec.taetigkeit, rec.projekt;
    END LOOP;
    RETURN;
  END IF;

  DELETE FROM public.time_entries
  WHERE user_id = v_user_id
    AND project_id = v_project_id
    AND datum = CURRENT_DATE;

  RAISE NOTICE '✓ Gelöscht: % Zeiteintrag/e (user=%, project=%, datum=%)', v_count, v_user_id, v_project_id, CURRENT_DATE;
END $$;
