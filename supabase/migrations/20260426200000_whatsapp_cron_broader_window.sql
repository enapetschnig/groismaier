-- ============================================================
-- WhatsApp-Cron: breiteres UTC-Fenster für TZ-Robustheit
-- ============================================================
-- Altes Fenster war 5-19 UTC (= 06:00-20:00 CET / 07:00-21:00 CEST).
-- Wenn der User whatsapp_morning_time auf z. B. 06:00 Vienna gesetzt
-- hat, feuerte der Cron im Sommer frühestens um 07:00 Vienna — das
-- ±15-Min-Sendefenster in der Edge Function wurde nie getroffen.
--
-- Neuer Schedule 3-22 UTC:
--   Winter (CET): 04:00-23:00 Vienna
--   Sommer (CEST): 05:00-24:00 Vienna
-- Damit sind alle realistischen User-Zeiten abgedeckt. Die Function
-- selbst entscheidet weiter per ±15-Min-Fenster um die konfigurierte
-- Zeit, ob ein Send fällig ist — mehr Ticks heißen also nur mehr
-- schnelle "Kein Sende-Fenster"-Rückmeldungen, nicht mehr Sendungen.
-- Die konfigurierten Zeiten (whatsapp_morning_time / _reminder_time)
-- in app_settings bleiben unverändert.

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-daily-reminder-job');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'whatsapp-daily-reminder-job',
  '*/15 3-22 * * 1-5',
  $$
    SELECT net.http_post(
      url := 'https://zbxizeirecoipqvxymdx.supabase.co/functions/v1/whatsapp-daily-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM public.app_settings WHERE key = 'cron_webhook_secret' LIMIT 1)
      ),
      body := '{"source":"cron","mode":"auto"}'::jsonb
    ) AS request_id
  $$
);
