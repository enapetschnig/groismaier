-- ============================================================
-- einsaetze-Sync-Trigger erweitern: google_calendar_id-Writeback
-- ============================================================
-- Der bestehende Trigger (20260420300000) hat einen Rekursions-Schutz,
-- der reine google_event_id-Writebacks ignoriert. Mit der neuen
-- google_calendar_id-Spalte muss der Skip-Check erweitert werden,
-- sonst feuert jeder Edge-Function-Writeback eine neue Sync-Runde
-- und es entsteht eine Schleife.
--
-- Zusätzlich: DELETE-Payload transportiert die Calendar-ID mit, damit
-- die Edge Function weiß, aus welchem Kalender zu löschen ist.

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
  -- Rekursions-Schutz: reiner Writeback (nur google_event_id ODER
  -- google_calendar_id geändert, alle anderen Syncfelder gleich).
  IF TG_OP = 'UPDATE'
     AND (
       OLD.google_event_id IS DISTINCT FROM NEW.google_event_id
       OR COALESCE(OLD.google_calendar_id, '') IS DISTINCT FROM COALESCE(NEW.google_calendar_id, '')
     )
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
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    action_type := 'delete_einsatz';
    payload := jsonb_build_object(
      'action', action_type,
      'einsatz_id', OLD.id,
      'google_event_id', OLD.google_event_id,
      'google_calendar_id', OLD.google_calendar_id
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

-- Trigger bleibt bestehen (wurde in 20260420300000 angelegt), nur die
-- Funktion wurde oben via CREATE OR REPLACE aktualisiert.
