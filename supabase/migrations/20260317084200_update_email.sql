-- Update default disturbance report email to correct address
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('disturbance_report_email', 'info@ft-tilger.at', now())
ON CONFLICT (key) DO UPDATE SET value = 'info@ft-tilger.at', updated_at = now();
