-- ============================================================================
-- Holzbau Lutz: E-Mail-Selbstregistrierung mit Admin-Freigabe
-- ----------------------------------------------------------------------------
-- Bisher war Selbstregistrierung blockiert (block_self_signup). Ab jetzt darf
-- sich jeder per E-Mail + Passwort registrieren — das Konto ist aber INAKTIV
-- (is_active=false) und muss vom Administrator im Admin-Bereich
-- ("Wartende Aktivierungen" → Freischalten, RPC activate_user) freigegeben
-- werden. Es gibt keinen anderen Registrierungsweg. RLS (is_active_user)
-- verhindert jeden Datenzugriff vor der Freischaltung.
-- ============================================================================

-- 1) Selbstregistrierungs-Blockade entfernen
DROP TRIGGER IF EXISTS block_self_signup_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.block_self_signup() CASCADE;

-- 2) handle_new_user: neue Konten inaktiv anlegen (außer Bootstrap-Admin),
--    zusätzlich E-Mail im Profil speichern, damit der Admin die
--    Freigabeanfrage eindeutig zuordnen kann.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_whitelisted BOOLEAN;
BEGIN
  is_whitelisted := NEW.email IN ('napetschnig.chris@gmail.com', 'hallo@epowergmbh.at');

  INSERT INTO public.profiles (id, vorname, nachname, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'vorname', ''),
    COALESCE(NEW.raw_user_meta_data->>'nachname', ''),
    NEW.email,
    is_whitelisted
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE public.profiles.email IS NULL;

  -- Nur Bootstrap-Admins bekommen sofort eine Rolle. Alle anderen erst
  -- nach Freischaltung durch den Administrator (activate_user).
  IF is_whitelisted THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
