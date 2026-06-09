-- ============================================================
-- Cascade: profiles.is_active → employees.aktiv
-- ============================================================
-- Wenn ein User in der Admin-Maske via "Nur deaktivieren"
-- profiles.is_active = false bekommt, soll der zugehörige
-- employees-Record automatisch aktiv = false bekommen. Sonst tauchen
-- die Mitarbeiter weiterhin in allen "WHERE aktiv = true"-Dropdowns
-- (Plantafel, Bautagesbericht, Projekt-Zuordnung, …) auf, weil
-- handleActivateUser bisher nur profiles.is_active flippt.
--
-- Symmetrisch beim Reaktivieren — Trigger setzt aktiv = true zurück.
--
-- Wirkt zusätzlich als Defensive beim "Benutzer löschen"-Pfad: die
-- delete-user-Edge-Function entfernt den employees-Record selbst,
-- aber falls da etwas fehlschlägt, ist der Mitarbeiter immerhin
-- deaktiviert.

CREATE OR REPLACE FUNCTION public.sync_employee_aktiv_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE public.employees
       SET aktiv = NEW.is_active
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_aktiv ON public.profiles;
CREATE TRIGGER trg_sync_employee_aktiv
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_aktiv_from_profile();

-- Backfill: bestehende inaktive Profile auf employees.aktiv = false
-- propagieren (z. B. Jarko Ribarski). Idempotent.
UPDATE public.employees e
   SET aktiv = false
  FROM public.profiles p
 WHERE e.user_id = p.id
   AND p.is_active = false
   AND e.aktiv IS DISTINCT FROM false;
