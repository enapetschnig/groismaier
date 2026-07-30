-- ============================================================================
-- Mitarbeiter dürfen einem Projekt den Kunden zuordnen (Kundenwunsch:
-- „der Mitarbeiter sollte im Projekt schon den Kunden sehen und auch
-- auswählen können!!").
--
-- Projekte selbst bleiben für Mitarbeiter schreibgeschützt (RLS) — diese
-- SECURITY-DEFINER-Funktion öffnet gezielt NUR das Feld customer_id, und nur
-- für Projekte, denen der Mitarbeiter zugewiesen ist (Admins/Vorarbeiter:
-- alle Projekte). So bleibt die Härtung intakt, ohne dass der Monteur für
-- eine simple Kundenzuordnung den Chef anrufen muss.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.setze_projekt_kunde(p_project_id uuid, p_customer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_darf boolean;
BEGIN
  IF NOT is_active_user(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet oder nicht freigeschaltet.');
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RETURN json_build_object('success', false, 'error', 'Kunde nicht gefunden.');
  END IF;

  SELECT
    has_role(auth.uid(), 'administrator'::app_role)
    OR has_role(auth.uid(), 'vorarbeiter'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.employees e ON e.user_id = auth.uid()
      WHERE p.id = p_project_id
        AND p.zugewiesene_mitarbeiter ? e.id::text
    )
  INTO v_darf;

  IF NOT v_darf THEN
    RETURN json_build_object('success', false, 'error', 'Du bist diesem Projekt nicht zugewiesen.');
  END IF;

  UPDATE public.projects SET customer_id = p_customer_id WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Projekt nicht gefunden.');
  END IF;

  RETURN json_build_object('success', true);
END;
$function$;
