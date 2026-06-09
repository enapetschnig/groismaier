-- ============================================================
-- Selbstregistrierung blockieren
-- ============================================================
-- Neue Benutzer dürfen ausschließlich vom Administrator über
-- die create-user Edge Function angelegt werden. Der Admin-Pfad
-- setzt ein spezifisches User-Metadata-Feld "username" — darüber
-- erkennen wir legitime Anlage vs. Selbstregistrierung.

CREATE OR REPLACE FUNCTION public.block_self_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_whitelisted BOOLEAN;
  has_admin_marker BOOLEAN;
BEGIN
  -- Whitelist-Admins dürfen immer (Bootstrap für allerersten Admin)
  is_whitelisted := NEW.email IN ('napetschnig.chris@gmail.com', 'hallo@epowergmbh.at');

  -- Admin-Pfad setzt "username" in user_metadata
  has_admin_marker :=
    NEW.raw_user_meta_data IS NOT NULL
    AND NEW.raw_user_meta_data ? 'username'
    AND length(NEW.raw_user_meta_data->>'username') > 0;

  IF NOT is_whitelisted AND NOT has_admin_marker THEN
    RAISE EXCEPTION 'Selbstregistrierung ist deaktiviert. Bitte wenden Sie sich an den Administrator.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE-Trigger vor handle_new_user aufhängen, damit handle_new_user
-- nur für legitime Inserts läuft.
DROP TRIGGER IF EXISTS block_self_signup_trigger ON auth.users;
CREATE TRIGGER block_self_signup_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.block_self_signup();
