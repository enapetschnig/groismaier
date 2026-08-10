-- ============================================================================
-- KFZ-Manager: Zulassungsscheine (Kundenwunsch)
--
--   „Beim KFZ-Manager alle Zulassungsscheine oder nur einen hochladen können,
--    und dann erkennt er automatisch das Auto mit der KI. Der Zulassungsschein
--    ist auch hinterlegt."
--
-- Neue Spalten am Fahrzeug: Ablage-Pfad des Scheins plus die drei Felder, die
-- die KI aus dem Schein liest (Marke/Modell, Fahrgestellnummer, Erstzulassung)
-- - sie füllen nur LEERE Felder, Handeingaben bleiben unangetastet.
-- ============================================================================
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS zulassungsschein_path text,
  ADD COLUMN IF NOT EXISTS marke_modell text,
  ADD COLUMN IF NOT EXISTS fahrgestellnummer text,
  ADD COLUMN IF NOT EXISTS erstzulassung date;

-- Eigener privater Bucket für Fahrzeug-Dokumente.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vehicle-documents', 'vehicle-documents', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins verwalten Fahrzeugdokumente"
  ON storage.objects FOR ALL
  USING (bucket_id = 'vehicle-documents' AND has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (bucket_id = 'vehicle-documents' AND has_role(auth.uid(), 'administrator'::app_role));
