-- Update branding from ePower/Brodnig to Fliesentilger
-- Update handle_new_user function with correct admin emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, vorname, nachname)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'vorname', ''),
    COALESCE(NEW.raw_user_meta_data->>'nachname', '')
  );

  IF NEW.email = 'napetschnig.chris@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'mitarbeiter')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Update ensure_user_profile function
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_meta jsonb;
  assigned_role app_role;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    RETURN json_build_object('success', true, 'action', 'existing');
  END IF;

  SELECT email, raw_user_meta_data
  INTO user_email, user_meta
  FROM auth.users
  WHERE id = current_user_id;

  IF user_email IN ('napetschnig.chris@gmail.com') THEN
    assigned_role := 'administrator';
  ELSE
    assigned_role := 'mitarbeiter';
  END IF;

  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  VALUES (
    current_user_id,
    COALESCE(user_meta->>'vorname', ''),
    COALESCE(user_meta->>'nachname', ''),
    true
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (current_user_id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'action', 'created',
    'role', assigned_role
  );
END;
$$;

-- Update default disturbance report email
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('disturbance_report_email', 'info@ft-tilger.at', now())
ON CONFLICT (key) DO UPDATE SET value = 'info@ft-tilger.at', updated_at = now();
