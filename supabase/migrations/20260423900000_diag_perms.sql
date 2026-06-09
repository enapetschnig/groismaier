-- Diagnose: Welche role_permissions gibt es für mitarbeiter?
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '=== role_permissions für mitarbeiter ===';
  FOR rec IN
    SELECT role, feature, can_view, can_edit
    FROM public.role_permissions
    WHERE role = 'mitarbeiter'
    ORDER BY feature
  LOOP
    RAISE NOTICE '  % / % → view=% edit=%', rec.role, rec.feature, rec.can_view, rec.can_edit;
  END LOOP;

  -- Sicherstellen dass Eingangsrechnungen für mitarbeiter freigeschaltet sind
  INSERT INTO public.role_permissions (role, feature, can_view, can_edit)
  VALUES ('mitarbeiter', 'eingangsrechnungen', TRUE, TRUE)
  ON CONFLICT (role, feature) DO UPDATE
    SET can_view = TRUE, can_edit = TRUE;

  RAISE NOTICE '=== Nach Upsert ===';
  FOR rec IN
    SELECT role, feature, can_view, can_edit
    FROM public.role_permissions
    WHERE role = 'mitarbeiter' AND feature = 'eingangsrechnungen'
  LOOP
    RAISE NOTICE '  % / % → view=% edit=%', rec.role, rec.feature, rec.can_view, rec.can_edit;
  END LOOP;
END $$;
