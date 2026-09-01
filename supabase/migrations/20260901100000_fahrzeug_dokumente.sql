-- Meldung b240a087 (31.08.): "Bitte im Maschinen Manager auch den Upload von
-- allgemeinen Dokumenten ermoeglichen - zB Schaltplaene - dann ist alles
-- beisammen."
--
-- Beliebig viele Dokumente je Fahrzeug/Maschine, abgelegt im bestehenden
-- privaten Bucket vehicle-documents (Admin-Policies dort gelten weiter).
CREATE TABLE IF NOT EXISTS public.vehicle_dokumente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_dokumente_vehicle ON public.vehicle_dokumente (vehicle_id);
ALTER TABLE public.vehicle_dokumente ENABLE ROW LEVEL SECURITY;

-- Wie der Bucket: Fahrzeugverwaltung ist Admin-Sache; lesen duerfen alle
-- Angemeldeten (Fahrer wollen z.B. den Schaltplan oeffnen).
DROP POLICY IF EXISTS "Fahrzeugdokumente lesen" ON public.vehicle_dokumente;
CREATE POLICY "Fahrzeugdokumente lesen" ON public.vehicle_dokumente
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Fahrzeugdokumente verwalten" ON public.vehicle_dokumente;
CREATE POLICY "Fahrzeugdokumente verwalten" ON public.vehicle_dokumente
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

-- Lesen der Dateien selbst: bisher nur Admins - Angemeldete duerfen die
-- Fahrzeugdokumente jetzt auch OEFFNEN (nicht hochladen/loeschen).
DROP POLICY IF EXISTS "Fahrzeugdokumente ansehen" ON storage.objects;
CREATE POLICY "Fahrzeugdokumente ansehen" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-documents');
