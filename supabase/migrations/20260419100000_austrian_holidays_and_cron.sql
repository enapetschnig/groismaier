-- ==============================================================
-- Österreichische Feiertage + pg_cron-basierter WhatsApp-Trigger
-- ==============================================================

-- 1. Extensions aktivieren (idempotent) --------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Österreichische Feiertage Tabelle ---------------------------
CREATE TABLE IF NOT EXISTS public.austrian_holidays (
  datum DATE PRIMARY KEY,
  bezeichnung TEXT NOT NULL
);

ALTER TABLE public.austrian_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_austrian_holidays"
  ON public.austrian_holidays FOR SELECT
  TO authenticated
  USING (true);

-- Helper-Funktion: ist ein Datum ein AT-Feiertag?
CREATE OR REPLACE FUNCTION public.is_austrian_holiday(d DATE)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.austrian_holidays WHERE datum = d);
$$;

-- 3. Seed Feiertage 2026-2029 -----------------------------------
-- Fixe Feiertage für 2026
INSERT INTO public.austrian_holidays (datum, bezeichnung) VALUES
  ('2026-01-01', 'Neujahr'),
  ('2026-01-06', 'Heilige Drei Könige'),
  ('2026-04-06', 'Ostermontag'),
  ('2026-05-01', 'Staatsfeiertag'),
  ('2026-05-14', 'Christi Himmelfahrt'),
  ('2026-05-25', 'Pfingstmontag'),
  ('2026-06-04', 'Fronleichnam'),
  ('2026-08-15', 'Mariä Himmelfahrt'),
  ('2026-10-26', 'Nationalfeiertag'),
  ('2026-11-01', 'Allerheiligen'),
  ('2026-12-08', 'Mariä Empfängnis'),
  ('2026-12-25', 'Christtag'),
  ('2026-12-26', 'Stefanitag')
ON CONFLICT (datum) DO NOTHING;

-- 2027 (Ostersonntag: 28.3.2027)
INSERT INTO public.austrian_holidays (datum, bezeichnung) VALUES
  ('2027-01-01', 'Neujahr'),
  ('2027-01-06', 'Heilige Drei Könige'),
  ('2027-03-29', 'Ostermontag'),
  ('2027-05-01', 'Staatsfeiertag'),
  ('2027-05-06', 'Christi Himmelfahrt'),
  ('2027-05-17', 'Pfingstmontag'),
  ('2027-05-27', 'Fronleichnam'),
  ('2027-08-15', 'Mariä Himmelfahrt'),
  ('2027-10-26', 'Nationalfeiertag'),
  ('2027-11-01', 'Allerheiligen'),
  ('2027-12-08', 'Mariä Empfängnis'),
  ('2027-12-25', 'Christtag'),
  ('2027-12-26', 'Stefanitag')
ON CONFLICT (datum) DO NOTHING;

-- 2028 (Ostersonntag: 16.4.2028)
INSERT INTO public.austrian_holidays (datum, bezeichnung) VALUES
  ('2028-01-01', 'Neujahr'),
  ('2028-01-06', 'Heilige Drei Könige'),
  ('2028-04-17', 'Ostermontag'),
  ('2028-05-01', 'Staatsfeiertag'),
  ('2028-05-25', 'Christi Himmelfahrt'),
  ('2028-06-05', 'Pfingstmontag'),
  ('2028-06-15', 'Fronleichnam'),
  ('2028-08-15', 'Mariä Himmelfahrt'),
  ('2028-10-26', 'Nationalfeiertag'),
  ('2028-11-01', 'Allerheiligen'),
  ('2028-12-08', 'Mariä Empfängnis'),
  ('2028-12-25', 'Christtag'),
  ('2028-12-26', 'Stefanitag')
ON CONFLICT (datum) DO NOTHING;

-- 2029 (Ostersonntag: 1.4.2029)
INSERT INTO public.austrian_holidays (datum, bezeichnung) VALUES
  ('2029-01-01', 'Neujahr'),
  ('2029-01-06', 'Heilige Drei Könige'),
  ('2029-04-02', 'Ostermontag'),
  ('2029-05-01', 'Staatsfeiertag'),
  ('2029-05-10', 'Christi Himmelfahrt'),
  ('2029-05-21', 'Pfingstmontag'),
  ('2029-05-31', 'Fronleichnam'),
  ('2029-08-15', 'Mariä Himmelfahrt'),
  ('2029-10-26', 'Nationalfeiertag'),
  ('2029-11-01', 'Allerheiligen'),
  ('2029-12-08', 'Mariä Empfängnis'),
  ('2029-12-25', 'Christtag'),
  ('2029-12-26', 'Stefanitag')
ON CONFLICT (datum) DO NOTHING;

-- 4. Send-Tracking-Spalten auf employees -------------------------
-- Damit die Edge Function weiß, ob heute schon gesendet wurde
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS whatsapp_last_morning_date DATE,
  ADD COLUMN IF NOT EXISTS whatsapp_last_evening_date DATE;

-- 5. Cron-Secret für Webhook-Authentifizierung ------------------
-- Wird beim ersten Durchlauf zufällig generiert und bleibt dann stabil.
INSERT INTO public.app_settings (key, value)
VALUES (
  'cron_webhook_secret',
  md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text)
)
ON CONFLICT (key) DO NOTHING;

-- 6. Cron-Job: alle 15 Min Mo-Fr den Daily-Reminder triggern -----
-- Die Edge Function checkt selbst gegen die konfigurierten Zeiten
-- (whatsapp_morning_time, whatsapp_reminder_time in app_settings)
-- UND gegen austrian_holidays.
-- Alten Job (falls vorhanden) entfernen
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-daily-reminder-job');
EXCEPTION WHEN OTHERS THEN
  NULL; -- noch nicht vorhanden → ignorieren
END $$;

-- Neuen Job einrichten: alle 15 Min, Montag–Freitag, 05:00–19:00 UTC
-- (entspricht 06:00–20:00 CET bzw. 07:00–21:00 CEST — deckt Morgen + Abend ab)
SELECT cron.schedule(
  'whatsapp-daily-reminder-job',
  '*/15 5-19 * * 1-5',
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
