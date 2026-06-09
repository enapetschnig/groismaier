-- ============================================================================
-- Holzbau Lutz: Entfernung der nicht benötigten Module
--   Kalender (inkl. Google Calendar), Bautagesberichte, Besprechungsprotokolle,
--   Ersttermine, WhatsApp.
-- Frontend, Routen, Menüpunkte und Edge Functions wurden bereits entfernt.
-- Diese Migration räumt die Datenbank auf (läuft als letzte Migration).
-- ============================================================================

-- 1) Google-Calendar-Sync-Wiring (Trigger + Funktionen) auf den BEHALTENEN
--    Tabellen einsaetze / projects — die Ziel-Edge-Function wurde gelöscht.
DROP TRIGGER IF EXISTS einsatz_google_sync_trigger ON public.einsaetze;
DROP TRIGGER IF EXISTS tr_projects_resync_gcal ON public.projects;
DROP FUNCTION IF EXISTS public.sync_einsatz_to_google() CASCADE;
DROP FUNCTION IF EXISTS public.resync_project_einsaetze() CASCADE;

-- 2) Cron-Jobs der gelöschten WhatsApp-/Error-Digest-Funktionen abbestellen
--    (tolerant — pg_cron oder Job kann fehlen).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
     WHERE jobname IN (
       'daily-error-digest',
       'whatsapp-temp-storage-cleanup',
       'whatsapp-pending-cleanup',
       'whatsapp-daily-reminder',
       'whatsapp-daily-reminder-morning',
       'whatsapp-daily-reminder-evening'
     );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cron-Cleanup übersprungen: %', SQLERRM;
END $$;

-- 3) Permissions der entfernten Features löschen
DELETE FROM public.role_permissions
 WHERE feature IN ('kalender', 'bautagesberichte', 'ersttermine', 'protokolle');

-- 4) Tabellen der entfernten Module löschen (CASCADE entfernt FKs/Policies/Trigger)
DROP TABLE IF EXISTS public.calendar_events           CASCADE;
DROP TABLE IF EXISTS public.calendar_integrations     CASCADE;
DROP TABLE IF EXISTS public.bautagesbericht_photos    CASCADE;
DROP TABLE IF EXISTS public.bautagesbericht_workers   CASCADE;
DROP TABLE IF EXISTS public.bautagesberichte          CASCADE;
DROP TABLE IF EXISTS public.besprechungsprotokoll_massnahmen CASCADE;
DROP TABLE IF EXISTS public.besprechungsprotokoll_photos     CASCADE;
DROP TABLE IF EXISTS public.besprechungsprotokolle    CASCADE;
DROP TABLE IF EXISTS public.ersttermin_interessent_photos CASCADE;
DROP TABLE IF EXISTS public.ersttermin_interessent    CASCADE;
DROP TABLE IF EXISTS public.ersttermin_projekt        CASCADE;
DROP TABLE IF EXISTS public.whatsapp_messages         CASCADE;
DROP TABLE IF EXISTS public.photo_prompt_locks        CASCADE;
