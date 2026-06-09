-- ============================================================
-- Diagnose: Warum sieht "Test teeeest" im Bot zu viele Projekte?
-- Gibt alle relevanten Werte in den Migration-Output.
-- Kein Daten-Eingriff — reine NOTICE-Ausgabe.
-- ============================================================

DO $$
DECLARE
  v_user_id UUID;
  v_employee_id UUID;
  v_roles TEXT;
  rec RECORD;
  cnt_verant INTEGER;
  cnt_bauleiter INTEGER;
  cnt_assigned INTEGER;
  cnt_rpc INTEGER;
BEGIN
  -- employee per Name
  SELECT id, user_id INTO v_employee_id, v_user_id
  FROM public.employees
  WHERE lower(vorname) LIKE 'test%' AND lower(nachname) LIKE 'test%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    -- Fallback: exakt Vorname=Test
    SELECT id, user_id INTO v_employee_id, v_user_id
    FROM public.employees
    WHERE lower(vorname) = 'test'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL THEN
    RAISE NOTICE 'Kein Mitarbeiter gefunden, der auf Test passt.';
    RETURN;
  END IF;

  RAISE NOTICE '====== DIAGNOSE ======';
  RAISE NOTICE 'employee_id = %', v_employee_id;
  RAISE NOTICE 'user_id     = %', v_user_id;

  -- Rollen
  SELECT string_agg(role::text, ', ') INTO v_roles
  FROM public.user_roles WHERE user_id = v_user_id;
  RAISE NOTICE 'Rollen:       %', COALESCE(v_roles, '(keine)');

  -- Zähl-Queries
  SELECT COUNT(*) INTO cnt_verant
  FROM public.projects WHERE verantwortlicher_id = v_employee_id;
  SELECT COUNT(*) INTO cnt_bauleiter
  FROM public.projects WHERE bauleiter_id = v_employee_id;
  SELECT COUNT(*) INTO cnt_assigned
  FROM public.projects WHERE zugewiesene_mitarbeiter ? v_employee_id::text;

  RAISE NOTICE 'Projekte als Verantwortlicher: %', cnt_verant;
  RAISE NOTICE 'Projekte als Bauleiter:        %', cnt_bauleiter;
  RAISE NOTICE 'Projekte in zugewiesene_mit.:  %', cnt_assigned;

  -- Liste
  FOR rec IN
    SELECT p.id, p.name, p.status,
           (p.verantwortlicher_id = v_employee_id) AS is_verant,
           (p.bauleiter_id = v_employee_id) AS is_bauleiter,
           (p.zugewiesene_mitarbeiter ? v_employee_id::text) AS is_assigned
    FROM public.projects p
    WHERE p.verantwortlicher_id = v_employee_id
       OR p.bauleiter_id = v_employee_id
       OR p.zugewiesene_mitarbeiter ? v_employee_id::text
    ORDER BY p.name
  LOOP
    RAISE NOTICE '  [%] % — status=% v=% b=% a=%',
      rec.id, rec.name, rec.status,
      rec.is_verant, rec.is_bauleiter, rec.is_assigned;
  END LOOP;

  -- RPC aufrufen (aktive Projekte nur)
  SELECT COUNT(*) INTO cnt_rpc
  FROM public.list_accessible_project_ids_for_user(v_user_id, TRUE);
  RAISE NOTICE 'RPC-Ergebnis (active only):   % Projekte', cnt_rpc;

  FOR rec IN
    SELECT id, name, status
    FROM public.list_accessible_project_ids_for_user(v_user_id, TRUE)
    ORDER BY name
  LOOP
    RAISE NOTICE '  RPC: [%] % — status=%', rec.id, rec.name, rec.status;
  END LOOP;

  RAISE NOTICE '====== ENDE ======';
END $$;
