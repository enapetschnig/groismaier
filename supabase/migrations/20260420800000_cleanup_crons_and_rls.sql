-- ============================================================
-- 1) Cleanup-Cron-Jobs für WhatsApp-Temp-Daten
-- 2) RLS-Review für photo_prompt_locks
-- ============================================================

-- --- pg_cron Job: alle 15 Min pending_photo + photo_prompt_locks aufräumen
DO $$ BEGIN PERFORM cron.unschedule('whatsapp-pending-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'whatsapp-pending-cleanup',
  '*/15 * * * *',
  $$
    -- pending_photo-Rows älter als 45 Min löschen (30 Min TTL + 15 Min Puffer)
    DELETE FROM public.whatsapp_messages
    WHERE message_type = 'pending_photo'
      AND processed = false
      AND created_at < NOW() - INTERVAL '45 minutes';

    -- Photo-Prompt-Locks älter als 10 Min löschen (90s TTL + reichlich Puffer)
    DELETE FROM public.photo_prompt_locks
    WHERE acquired_at < NOW() - INTERVAL '10 minutes';
  $$
);

-- --- pg_cron Job: täglich um 03:00 UTC temp-Bilder aus Storage löschen
-- project-photos/whatsapp-temp/** die älter als 24h sind.
-- Nutzt die Service-Role via app_settings cron_webhook_secret → Edge Function.
DO $$ BEGIN PERFORM cron.unschedule('whatsapp-temp-storage-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'whatsapp-temp-storage-cleanup',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url := 'https://zbxizeirecoipqvxymdx.supabase.co/functions/v1/whatsapp-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM public.app_settings WHERE key = 'cron_webhook_secret' LIMIT 1)
      ),
      body := '{"task":"temp_storage"}'::jsonb
    ) AS request_id
  $$
);

-- ============================================================
-- RLS-Review für photo_prompt_locks: kein Zugriff für normale User
-- ============================================================

-- Die bestehende Policy "service_role_photo_prompt_locks" FOR ALL USING (true)
-- ist zu offen — sie erlaubt auch authenticated-Rolle den Zugriff. Der
-- Service-Role-Key bypasst RLS ohnehin, also können wir die Policy
-- einschränken auf ausschließlich has_role(auth.uid(), 'administrator').

DROP POLICY IF EXISTS "service_role_photo_prompt_locks" ON public.photo_prompt_locks;

CREATE POLICY "admin_read_photo_prompt_locks" ON public.photo_prompt_locks
  FOR SELECT
  USING (has_role(auth.uid(), 'administrator'::app_role));

-- Insert/Update/Delete nur via Service-Role (der bypasst RLS automatisch).
-- Keine expliziten INSERT/UPDATE/DELETE-Policies für andere Rollen.
