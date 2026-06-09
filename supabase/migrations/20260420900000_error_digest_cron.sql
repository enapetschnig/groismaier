-- Tägliches Error-Digest: 07:00 UTC = 08:00/09:00 CET/CEST
DO $$ BEGIN PERFORM cron.unschedule('daily-error-digest'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'daily-error-digest',
  '0 7 * * *',
  $$
    SELECT net.http_post(
      url := 'https://zbxizeirecoipqvxymdx.supabase.co/functions/v1/daily-error-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM public.app_settings WHERE key = 'cron_webhook_secret' LIMIT 1)
      ),
      body := '{}'::jsonb
    ) AS request_id
  $$
);
