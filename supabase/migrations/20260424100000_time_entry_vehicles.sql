-- ============================================================
-- Mehrere Fahrzeuge pro Zeiteintrag + Modus (gefahren vs start/ende).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.time_entry_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  modus TEXT NOT NULL CHECK (modus IN ('gefahren', 'start_ende')),
  km_gefahren INTEGER,  -- nur bei modus='gefahren'
  km_start INTEGER,     -- nur bei modus='start_ende'
  km_ende INTEGER,      -- nur bei modus='start_ende'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tev_time_entry ON public.time_entry_vehicles(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_tev_vehicle ON public.time_entry_vehicles(vehicle_id);

ALTER TABLE public.time_entry_vehicles ENABLE ROW LEVEL SECURITY;

-- RLS: Der Besitzer des time_entry darf seine Einträge managen,
-- Admins dürfen alles.
CREATE POLICY "tev_owner_all" ON public.time_entry_vehicles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.id = time_entry_vehicles.time_entry_id
        AND (te.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.id = time_entry_vehicles.time_entry_id
        AND (te.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

-- Lesen für Vorarbeiter/Admin auch alle
CREATE POLICY "tev_read_elevated" ON public.time_entry_vehicles
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'administrator'::app_role)
    OR has_role(auth.uid(), 'vorarbeiter'::app_role)
  );

-- Migrationshilfe: bestehende Werte aus time_entries.kfz_id übernehmen
INSERT INTO public.time_entry_vehicles (time_entry_id, vehicle_id, modus, km_start, km_ende, km_gefahren)
SELECT
  te.id,
  te.kfz_id,
  CASE WHEN te.km_start IS NOT NULL AND te.km_ende IS NOT NULL THEN 'start_ende' ELSE 'gefahren' END,
  te.km_start,
  te.km_ende,
  CASE WHEN te.km_start IS NULL OR te.km_ende IS NULL THEN NULL
       ELSE te.km_ende - te.km_start END
FROM public.time_entries te
WHERE te.kfz_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.time_entry_vehicles tev WHERE tev.time_entry_id = te.id
  );
