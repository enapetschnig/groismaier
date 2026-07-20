-- ============================================================
-- Kostenstellen (Zeiterfassung), KFZ-Manager-Ausbau,
-- Kalkulations-Warnschwellen + Selbstkosten
-- ============================================================

-- 1) Kostenstellen als erweiterbare Admin-Liste (ConfigOptionsManager) ----
INSERT INTO public.admin_config_options (kategorie, wert, label, sort_order)
VALUES
  ('kostenstelle', 'baustelle',      'Baustelle',      10),
  ('kostenstelle', 'werkstatt',      'Werkstatt',      20),
  ('kostenstelle', 'lagerwerkstatt', 'Lagerwerkstatt', 30),
  ('kostenstelle', 'lagerplatz',     'Lagerplatz',     40)
ON CONFLICT (kategorie, wert) DO NOTHING;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS kostenstelle TEXT NOT NULL DEFAULT 'baustelle';
CREATE INDEX IF NOT EXISTS idx_time_entries_kostenstelle
  ON public.time_entries(kostenstelle);
COMMENT ON COLUMN public.time_entries.kostenstelle IS
  'Kostenstelle der Buchung (admin_config_options, kategorie=kostenstelle). Bei baustelle gehoert ein Projekt dazu.';

-- 2) Fahrzeugstunden je eingesetztem Fahrzeug -----------------------------
ALTER TABLE public.time_entry_vehicles
  ADD COLUMN IF NOT EXISTS stunden NUMERIC(5,2);
COMMENT ON COLUMN public.time_entry_vehicles.stunden IS
  'Auf dieses Fahrzeug gebuchte Stunden (Fahrzeugstunden). Vorbelegt mit den Stunden des Zeiteintrags.';

-- 3) Fahrzeug-Kosten (Reparatur / Service / Treibstoff / Sonstiges) -------
CREATE TABLE IF NOT EXISTS public.vehicle_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  betrag NUMERIC(12,2) NOT NULL,
  kategorie TEXT NOT NULL DEFAULT 'reparatur'
    CHECK (kategorie IN ('reparatur','service','treibstoff','sonstiges')),
  beschreibung TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_costs_vehicle ON public.vehicle_costs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_costs_datum ON public.vehicle_costs(datum);

ALTER TABLE public.vehicle_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_vehicle_costs" ON public.vehicle_costs
  FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "admin_manage_vehicle_costs" ON public.vehicle_costs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "vorarbeiter_insert_vehicle_costs" ON public.vehicle_costs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'vorarbeiter'::app_role) AND is_active_user(auth.uid()));

-- 4) Standard-Fahrzeug je Mitarbeiter -------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS standard_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.employees.standard_vehicle_id IS
  'Standard-Fahrzeug des Mitarbeiters — wird in der Zeiterfassung vorausgewaehlt.';

-- 5) Kalkulation: Warnschwelle + Selbstkosten-Lohnsatz ---------------------
INSERT INTO public.app_settings (key, value) VALUES
  ('kalk_warn_marge_prozent', '35'),
  ('kalk_selbstkosten_lohn', '38')
ON CONFLICT (key) DO NOTHING;

-- 6) Feature-Rechte fuer den KFZ-Manager -----------------------------------
INSERT INTO public.role_permissions (role, feature, can_view, can_edit)
VALUES
  ('administrator', 'fahrzeuge', true,  true),
  ('vorarbeiter',   'fahrzeuge', true,  true),
  ('mitarbeiter',   'fahrzeuge', false, false)
ON CONFLICT (role, feature) DO NOTHING;
