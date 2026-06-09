-- ============================================================
-- Cascade: profiles DELETE → employees.aktiv = false
-- ============================================================
-- Vorgeschichte: der "delete-user"-Edge-Function-Pfad räumt zuerst
-- employees auf (DELETE WHERE user_id = …), dann profiles und
-- auth.users. Wenn der Function-Call mittendrin abbricht (z. B.
-- Auth-Delete schlägt fehl) oder ein Mitarbeiter halbmanuell
-- aufgeräumt wird, kann ein employees-Datensatz mit user_id
-- übrigbleiben, dessen referenziertes profile bereits gelöscht ist.
-- Der bestehende Cascade-Trigger (Migration 20260503000000) reagiert
-- nur auf profiles UPDATE und greift dann nicht mehr.
--
-- Diese Migration:
--  1) setzt für ALL solche Waisen aktiv = false (one-shot Backfill)
--  2) installiert einen BEFORE DELETE-Trigger auf profiles, der bei
--     jedem künftigen profile-Delete die zugehörigen employees-
--     Zeilen automatisch auf aktiv = false setzt — zusätzlich zum
--     bestehenden delete-user-Pfad, robust auch bei manuellen oder
--     CASCADE-getriggerten profile-Deletes.

-- 1. Backfill (idempotent: nur Datensätze, die noch aktiv=true sind)
UPDATE public.employees e
   SET aktiv = false
  FROM (
    SELECT e2.id
    FROM public.employees e2
    LEFT JOIN public.profiles p ON p.id = e2.user_id
    WHERE e2.user_id IS NOT NULL
      AND p.id IS NULL
      AND e2.aktiv = true
  ) waisen
 WHERE e.id = waisen.id;

-- 2. Trigger-Funktion + Trigger
CREATE OR REPLACE FUNCTION public.deactivate_employee_on_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.employees
     SET aktiv = false
   WHERE user_id = OLD.id
     AND aktiv = true;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_deactivate_employee_on_profile_delete ON public.profiles;
CREATE TRIGGER trg_deactivate_employee_on_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.deactivate_employee_on_profile_delete();
