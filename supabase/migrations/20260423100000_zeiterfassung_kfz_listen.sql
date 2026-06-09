-- ============================================================
-- Zeiterfassung: KFZ-Verwaltung + Kilometerstände
-- Erweiterbare Listen: Tätigkeit, Firma intern, Firma extern
-- ============================================================

-- 1) Fahrzeug-Verwaltung ---------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bezeichnung TEXT NOT NULL,         -- z.B. "VW T6 Werkstatt", "Anhänger Klein"
  kennzeichen TEXT,                  -- z.B. "ZT-1234F"
  typ TEXT,                          -- z.B. "bus", "pkw", "lkw", "anhaenger", "stapler"
  aktiv BOOLEAN DEFAULT TRUE,
  notizen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_aktiv ON public.vehicles(aktiv);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_vehicles" ON public.vehicles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_vehicles" ON public.vehicles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

-- Ein paar typische Fahrzeuge seeden (Admin kann später ändern)
INSERT INTO public.vehicles (bezeichnung, typ, aktiv) VALUES
  ('Firmenbus', 'bus', true),
  ('PKW Chef', 'pkw', true),
  ('Anhänger', 'anhaenger', true)
ON CONFLICT DO NOTHING;

-- 2) Kilometer-Felder in time_entries --------------------------
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS kfz_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS km_start INTEGER,
  ADD COLUMN IF NOT EXISTS km_ende INTEGER;

COMMENT ON COLUMN public.time_entries.kfz_id IS
  'Benutztes Fahrzeug für diese Arbeitszeit (optional).';
COMMENT ON COLUMN public.time_entries.km_start IS
  'Kilometerstand bei Arbeitsbeginn (optional).';
COMMENT ON COLUMN public.time_entries.km_ende IS
  'Kilometerstand bei Arbeitsende (optional). Differenz = gefahrene km.';

-- 3) Erweiterbare Auswahllisten --------------------------------
-- Kategorien: taetigkeit, firma_intern, firma_extern
-- Seed-Werte; Admin kann über ConfigOptionsManager erweitern.

INSERT INTO public.admin_config_options (kategorie, wert, label, sort_order)
VALUES
  -- Tätigkeiten (Zeiterfassung)
  ('taetigkeit', 'montage',         'Montage',                  10),
  ('taetigkeit', 'demontage',       'Demontage / Abbau',        20),
  ('taetigkeit', 'reparatur',       'Reparatur',                30),
  ('taetigkeit', 'wartung',         'Wartung',                  40),
  ('taetigkeit', 'reinigung',       'Reinigung / Aufräumen',    50),
  ('taetigkeit', 'vermessung',      'Vermessung / Aufmaß',      60),
  ('taetigkeit', 'planung',         'Planung / Besprechung',    70),
  ('taetigkeit', 'fahrzeit',        'Fahrzeit',                 80),
  ('taetigkeit', 'materialhandling','Material laden/entladen',  90),
  ('taetigkeit', 'werkstatt',       'Werkstatt',               100),
  ('taetigkeit', 'buero',           'Büro / Verwaltung',       110),
  ('taetigkeit', 'sonstiges',       'Sonstiges',               999),
  -- Firma intern (z.B. Mandanten / Bereiche / Abteilungen)
  ('firma_intern', 'monti',         'Monti.pro',                10),
  ('firma_intern', 'gartenmacher',  'Gartenmacher',             20),
  ('firma_intern', 'fensterwerk',   'Fensterwerk',              30),
  ('firma_intern', 'portas',        'Portas',                   40),
  ('firma_intern', 'ladenbau',      'Ladenbau',                 50),
  -- Firma extern (typische Subs / Partner — Admin erweitert)
  ('firma_extern', 'elektriker',    'Elektriker',               10),
  ('firma_extern', 'installateur',  'Installateur',             20),
  ('firma_extern', 'trockenbau',    'Trockenbau',               30),
  ('firma_extern', 'maler',         'Maler',                    40),
  ('firma_extern', 'bodenleger',    'Bodenleger',               50),
  ('firma_extern', 'fliesenleger',  'Fliesenleger',             60),
  ('firma_extern', 'statiker',      'Statiker',                 70)
ON CONFLICT (kategorie, wert) DO NOTHING;
