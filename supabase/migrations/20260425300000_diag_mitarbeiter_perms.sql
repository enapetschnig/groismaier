-- Diagnose: welche User existieren, welche Rolle haben sie, welche
-- Permissions für Eingangsrechnungen sind wirksam?

DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== Alle auth.users + Rolle + Name ===';
  FOR r IN
    SELECT
      u.email,
      COALESCE(ur.role::TEXT, '— keine Rolle —') AS role,
      p.vorname,
      p.nachname
    FROM auth.users u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.email
  LOOP
    RAISE NOTICE '  % [%] → %  (role: %)', r.email, r.vorname, r.nachname, r.role;
  END LOOP;

  RAISE NOTICE '=== role_permissions für eingangsrechnungen ===';
  FOR r IN
    SELECT role, can_view, can_edit
      FROM public.role_permissions
     WHERE feature = 'eingangsrechnungen'
     ORDER BY role
  LOOP
    RAISE NOTICE '  % → can_view=% can_edit=%', r.role, r.can_view, r.can_edit;
  END LOOP;

  -- User ohne user_roles-Eintrag: für die würde die App "mitarbeiter" als
  -- Fallback verwenden — also relevant für uns.
  RAISE NOTICE '=== User OHNE user_roles-Eintrag (Fallback = mitarbeiter) ===';
  FOR r IN
    SELECT u.email
      FROM auth.users u
      LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     WHERE ur.role IS NULL
     ORDER BY u.email
  LOOP
    RAISE NOTICE '  %', r.email;
  END LOOP;
END $$;
