-- ============================================================================
-- Mitarbeiter entstehen künftig durch Selbstregistrierung (Kundenwunsch:
-- „die Mitarbeiter sollten sich selbst registrieren — es soll nicht unbedingt
-- möglich sein, dass man Mitarbeiter anlegen kann").
--
-- Damit fällt die Handanlage im Admin-Bereich weg. Ohne diese Migration
-- entstünde dadurch eine Lücke: Die Registrierung legt nur ein `profiles`-
-- Konto an, den Stammdatensatz in `employees` (Stundenlohn, Standard-Fahrzeug,
-- Kleidergrößen, Urlaubsanspruch) gab es bisher NUR über den entfernten
-- Knopf. Ein freigeschalteter Mitarbeiter hätte also keine Stammdaten.
--
-- Deshalb legt die Freischaltung den Stammdatensatz jetzt selbst an:
--   • ist bereits einer mit dieser user_id da → unverändert lassen
--   • gibt es einen unverknüpften mit derselben E-Mail → damit verknüpfen
--     (verhindert Doppelanlagen bei bereits von Hand erfassten Mitarbeitern)
--   • sonst neu anlegen aus Vor-/Nachname des Kontos
--
-- Administratoren bekommen bewusst KEINEN Mitarbeiterdatensatz — der Chef
-- steht nicht in der Lohnliste. Wird er doch gebraucht, kann er in der
-- Mitarbeiterverwaltung wie bisher bearbeitet werden.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.activate_user(_user_id uuid, _role app_role)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profil   RECORD;
  v_employee UUID;
BEGIN
  -- Verify caller is an active administrator
  IF NOT (
    is_active_user(auth.uid())
    AND has_role(auth.uid(), 'administrator')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Activate user
  UPDATE public.profiles SET is_active = true WHERE id = _user_id;

  -- Remove existing roles and assign the chosen one
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);

  -- ---- Stammdatensatz sicherstellen -------------------------------------
  IF _role <> 'administrator' THEN
    SELECT * INTO v_profil FROM public.profiles WHERE id = _user_id;

    SELECT id INTO v_employee FROM public.employees WHERE user_id = _user_id LIMIT 1;

    IF v_employee IS NULL AND COALESCE(v_profil.email, '') <> '' THEN
      -- Bereits von Hand erfasster Mitarbeiter mit derselben E-Mail:
      -- verknüpfen statt doppelt anlegen.
      UPDATE public.employees
         SET user_id = _user_id
       WHERE user_id IS NULL
         AND lower(email) = lower(v_profil.email)
      RETURNING id INTO v_employee;
    END IF;

    IF v_employee IS NULL THEN
      INSERT INTO public.employees (vorname, nachname, email, user_id, aktiv)
      VALUES (
        COALESCE(NULLIF(v_profil.vorname, ''), 'Unbekannt'),
        COALESCE(NULLIF(v_profil.nachname, ''), split_part(COALESCE(v_profil.email, 'Mitarbeiter'), '@', 1)),
        v_profil.email,
        _user_id,
        true
      );
    END IF;
  END IF;

  RETURN json_build_object('success', true);
END;
$function$;

-- Bestandslücke schließen: freigeschaltete Nicht-Administratoren ohne
-- Stammdatensatz nachträglich anlegen.
INSERT INTO public.employees (vorname, nachname, email, user_id, aktiv)
SELECT
  COALESCE(NULLIF(p.vorname, ''), 'Unbekannt'),
  COALESCE(NULLIF(p.nachname, ''), split_part(COALESCE(p.email, 'Mitarbeiter'), '@', 1)),
  p.email,
  p.id,
  true
FROM public.profiles p
JOIN public.user_roles r ON r.user_id = p.id AND r.role <> 'administrator'
WHERE p.is_active
  AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = p.id);
