-- ============================================================
-- Projekt-Kategorien (Geschäftsbereiche) + Google-Calendar-Seed
-- ============================================================
-- Jedes Projekt gehört zu genau einem Geschäftsbereich. Einsätze auf
-- der Plantafel wandern in den zum Bereich gehörenden Google-Kalender.
-- Kein Bereich → Default-Kalender (admin-konfigurierbar).

-- 1) Kategorien-Spalte auf projects (NULLABLE — NULL ist zulässig
--    und führt zum Default-Kalender).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS kategorie TEXT;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_kategorie_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_kategorie_check
  CHECK (kategorie IS NULL OR kategorie IN (
    'montipro', 'bks', 'gartenmacher', 'fensterwerk',
    'ladenbau', 'portas', 'chef'
  ));

CREATE INDEX IF NOT EXISTS idx_projects_kategorie
  ON public.projects(kategorie);

-- 2) Calendar-Id-Tracking auf einsaetze. Wir merken uns, in welchem
--    Kalender der aktuelle Google-Event liegt — damit wir beim
--    Kategorie-/Projekt-Wechsel wissen, WO das alte Event entfernt
--    werden muss.
ALTER TABLE public.einsaetze
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

CREATE INDEX IF NOT EXISTS idx_einsaetze_gcal
  ON public.einsaetze(google_calendar_id)
  WHERE google_event_id IS NOT NULL;

-- 3) Seed der 7 Kategorie-Kalender + Default-Fallback (Monti.pro).
--    ON CONFLICT aktualisiert → auch bei erneutem Spielen bleiben die
--    IDs konsistent.
INSERT INTO public.app_settings (key, value) VALUES
  ('google_calendar_id_montipro',     'ekn56rsojndcbr53j4afc1jqr4@group.calendar.google.com'),
  ('google_calendar_id_bks',          'd35165f59b76eee7de0da2e2bc42cc0f9651779031055459c227404c5d6216be@group.calendar.google.com'),
  ('google_calendar_id_gartenmacher', '77b47d6868b0cf4c0073ad6f3b95a8f366b3ead5ffdcf08088d0db0aad6d01af@group.calendar.google.com'),
  ('google_calendar_id_fensterwerk',  '5b1af0bc2f3ea6cdff66dc5b0576f5ec96ba367fe9a6614ede89877fffb73b12@group.calendar.google.com'),
  ('google_calendar_id_ladenbau',     '21d09289b4a269ab9cbad6437746238d5345a771fda400feb0945f1bff97395a@group.calendar.google.com'),
  ('google_calendar_id_portas',       'i0kbiis0710sscvvjcva4m37vg@group.calendar.google.com'),
  ('google_calendar_id_chef',         'g.zerzawy@gmail.com'),
  ('google_calendar_id_default',      'ekn56rsojndcbr53j4afc1jqr4@group.calendar.google.com')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMENT ON COLUMN public.projects.kategorie IS
  'Geschäftsbereich (montipro/bks/gartenmacher/fensterwerk/ladenbau/portas/chef). NULL → Einsatz landet im Default-Kalender. Steuert, in welchen Google Calendar Plantafel-Einsätze dieses Projekts geschrieben werden.';
COMMENT ON COLUMN public.einsaetze.google_calendar_id IS
  'Calendar-ID des aktuell gesyncten Events. Nötig, um beim Kategorie- oder Projekt-Wechsel das alte Event im richtigen Kalender zu entfernen.';
