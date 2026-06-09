-- ============================================================
-- Automatischer Google-Kalender-Sync bei Änderungen an einsaetze
-- ============================================================
-- Bei INSERT/UPDATE/DELETE auf einsaetze wird asynchron die Edge
-- Function sync-assignment-to-calendar aufgerufen, damit der
-- Google Kalender immer 1:1 zur Plantafel synchron ist — ohne
-- dass das Frontend den Sync selbst triggern muss.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------
-- Trigger-Funktion
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_einsatz_to_google()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  webhook_secret text;
  payload jsonb;
  action_type text;
BEGIN
  -- Rekursions-Schutz: wenn der einzige Unterschied die google_event_id ist
  -- (passiert beim Writeback durch die Edge Function selbst), keinen Sync
  -- auslösen. Alle anderen syncrelevanten Felder müssen gleich sein.
  IF TG_OP = 'UPDATE'
     AND OLD.google_event_id IS DISTINCT FROM NEW.google_event_id
     AND OLD.start_date = NEW.start_date
     AND OLD.end_date = NEW.end_date
     AND COALESCE(OLD.start_time, '') = COALESCE(NEW.start_time, '')
     AND COALESCE(OLD.end_time, '') = COALESCE(NEW.end_time, '')
     AND COALESCE(OLD.ganztaegig, false) = COALESCE(NEW.ganztaegig, false)
     AND OLD.user_id = NEW.user_id
     AND COALESCE(OLD.project_id::text, '') = COALESCE(NEW.project_id::text, '')
     AND COALESCE(OLD.name, '') = COALESCE(NEW.name, '')
     AND COALESCE(OLD.adresse, '') = COALESCE(NEW.adresse, '')
     AND COALESCE(OLD.beschreibung, '') = COALESCE(NEW.beschreibung, '')
  THEN
    RETURN NEW;
  END IF;

  SELECT value INTO webhook_secret FROM public.app_settings WHERE key = 'cron_webhook_secret';
  IF webhook_secret IS NULL THEN
    -- Kein Secret konfiguriert → Sync überspringen, damit die DB-Operation nicht fehlschlägt
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    action_type := 'delete_einsatz';
    payload := jsonb_build_object(
      'action', action_type,
      'einsatz_id', OLD.id,
      'google_event_id', OLD.google_event_id
    );
  ELSE
    action_type := 'sync_einsatz';
    payload := jsonb_build_object(
      'action', action_type,
      'einsatz_id', NEW.id
    );
  END IF;

  PERFORM net.http_post(
    url := 'https://zbxizeirecoipqvxymdx.supabase.co/functions/v1/sync-assignment-to-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    body := payload
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ------------------------------------------------------------
-- Trigger
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS einsatz_google_sync_trigger ON public.einsaetze;
CREATE TRIGGER einsatz_google_sync_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.einsaetze
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_einsatz_to_google();
