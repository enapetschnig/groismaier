-- ============================================================
-- Projekte für ALLE sichtbar (Holzbau Lutz)
--
-- Entscheidung: jeder aktive Benutzer sieht ALLE Projekte und alle
-- projekt-gebundenen Daten ("überall synchron"). Bearbeiten bleibt
-- Administrator + Vorarbeiter vorbehalten (UPDATE-Policy unverändert).
--
-- Umsetzung: die beiden zentralen Zugriffs-Funktionen geben jetzt für
-- jeden aktiven User TRUE bzw. ALLE Projekte zurück. Die frühere
-- Zuweisungs-Logik (zugewiesene_mitarbeiter / bauleiter_id /
-- verantwortlicher_id) wird NICHT mehr als Sichtbarkeits-Gate genutzt.
-- Die Spalten bleiben bestehen (Altbestand), werden aber nicht mehr
-- gepflegt oder ausgewertet.
-- ============================================================

-- 1) RLS-Gate für projects + alle projekt-gebundenen Tabellen
--    (einsaetze, assignment_resources, project_daily_targets,
--     board_projects, contact_history, …). Gibt für jeden aktiven
--    User TRUE zurück → alle sehen alles, konsistent überall.
CREATE OR REPLACE FUNCTION public.user_can_access_project(
  p_user_id UUID,
  p_project_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_user(p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_project(UUID, UUID) TO authenticated, service_role;

-- 2) Zentrale Projektliste (Frontend, Plantafel, Zeiterfassung):
--    jeder aktive User bekommt ALLE Projekte (optional ohne
--    abgeschlossene). Keine Rollen-/Zuweisungs-Verzweigung mehr.
CREATE OR REPLACE FUNCTION public.list_accessible_project_ids_for_user(
  p_user_id UUID,
  p_only_active BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(id UUID, name TEXT, status TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inaktive/nicht freigeschaltete User sehen nichts.
  IF NOT public.is_active_user(p_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.name, p.status::TEXT
    FROM public.projects p
    WHERE (NOT p_only_active) OR (p.status IS DISTINCT FROM 'Abgeschlossen')
    ORDER BY p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_accessible_project_ids_for_user(UUID, BOOLEAN)
  TO authenticated, service_role;
