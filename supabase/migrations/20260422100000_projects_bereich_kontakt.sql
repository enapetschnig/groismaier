-- ============================================================
-- Projekte: Bereich/Mandant (für Kalender-Zuordnung später),
-- Leistungsort-Kontaktname und -Telefon, erweiterbare Bereich-Liste.
-- ============================================================

-- 1) Neue Spalten (nullable → existing rows bleiben unverändert)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS bereich TEXT,
  ADD COLUMN IF NOT EXISTS projekt_kontakt_name TEXT,
  ADD COLUMN IF NOT EXISTS projekt_kontakt_telefon TEXT;

COMMENT ON COLUMN public.projects.bereich IS
  'Firmen-Mandant: monti/gartenmacher/fensterwerk/portas/ladenbau. Erweiterbar über admin_config_options(projekt_bereich). Für spätere Kalender-Zuordnung.';
COMMENT ON COLUMN public.projects.projekt_kontakt_name IS
  'Ansprechpartner vor Ort am Leistungsort (separat von Rechnungs-/Kundenkontakt).';
COMMENT ON COLUMN public.projects.projekt_kontakt_telefon IS
  'Telefonnummer des Ansprechpartners am Leistungsort.';

-- 2) Seed für Dropdown-Liste (erweiterbar durch Admin-Config-UI)
INSERT INTO public.admin_config_options (kategorie, wert, label, sort_order)
VALUES
  ('projekt_bereich', 'monti',         'Monti.pro',     10),
  ('projekt_bereich', 'gartenmacher',  'Gartenmacher',  20),
  ('projekt_bereich', 'fensterwerk',   'Fensterwerk',   30),
  ('projekt_bereich', 'portas',        'Portas',        40),
  ('projekt_bereich', 'ladenbau',      'Ladenbau',      50)
ON CONFLICT (kategorie, wert) DO NOTHING;

-- 3) Vorbereitung Multi-Kalender (noch nicht aktiv, reines Schema)
-- Pro Bereich kann später eine Google-Calendar-ID hinterlegt werden.
CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bereich TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  calendar_id TEXT,
  display_name TEXT,
  sync_direction TEXT DEFAULT 'push', -- push | pull | both
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bereich, provider)
);

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_calendar_integrations" ON public.calendar_integrations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "auth_read_calendar_integrations" ON public.calendar_integrations
  FOR SELECT TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_projects_bereich ON public.projects(bereich);
