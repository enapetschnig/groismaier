-- ============================================================
-- Projekt-Änderungen → Resync aller zugehörigen Einsätze
-- ============================================================
-- Wenn sich auf einem Projekt eine sync-relevante Eigenschaft ändert
-- (Kategorie → Kalender-Wechsel, Name → Event-Summary, Adresse →
-- Event-Location), müssen ALLE Einsätze dieses Projekts neu in Google
-- synchronisiert werden.
--
-- Implementiert via BEFORE/AFTER-UPDATE-Trigger, der pro Einsatz die
-- bestehende Edge Function "sync-assignment-to-calendar" anstößt.

CREATE OR REPLACE FUNCTION public.resync_project_einsaetze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  webhook_secret text;
  einsatz_rec RECORD;
BEGIN
  SELECT value INTO webhook_secret FROM public.app_settings WHERE key = 'cron_webhook_secret';
  IF webhook_secret IS NULL THEN
    -- Kein Secret → Resync überspringen (DB-Operation darf trotzdem durchgehen)
    RETURN NEW;
  END IF;

  FOR einsatz_rec IN
    SELECT id FROM public.einsaetze WHERE project_id = NEW.id
  LOOP
    PERFORM net.http_post(
      url := 'https://zbxizeirecoipqvxymdx.supabase.co/functions/v1/sync-assignment-to-calendar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || webhook_secret
      ),
      body := jsonb_build_object(
        'action', 'sync_einsatz',
        'einsatz_id', einsatz_rec.id
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger: reagiert auf kategorie, name, adresse — aber nur wenn sich
-- tatsächlich etwas ändert (WHEN-Clause).
DROP TRIGGER IF EXISTS tr_projects_resync_gcal ON public.projects;
CREATE TRIGGER tr_projects_resync_gcal
  AFTER UPDATE OF kategorie, name, adresse ON public.projects
  FOR EACH ROW
  WHEN (
    COALESCE(OLD.kategorie, '') IS DISTINCT FROM COALESCE(NEW.kategorie, '')
    OR OLD.name IS DISTINCT FROM NEW.name
    OR COALESCE(OLD.adresse, '') IS DISTINCT FROM COALESCE(NEW.adresse, '')
  )
  EXECUTE FUNCTION public.resync_project_einsaetze();
