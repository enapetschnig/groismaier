-- Verlauf benutzeruebergreifend (Kundenwunsch 25.08.2026): Wer die
-- Kalkulation sehen darf, sieht auch ihren kompletten Verlauf und kann
-- wiederherstellen - egal, wer die Aenderung gespeichert hat. Die Policy
-- erbt ueber EXISTS die Sichtbarkeit der Kalkulation selbst (heute
-- admin-only; wird die Kalkulation je breiter geoeffnet, wandert der
-- Verlauf automatisch mit). Zusaetzlich: wer hat den Stand gespeichert.
ALTER TABLE kalkulation_versionen
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS admin_all_kalk_versionen ON kalkulation_versionen;
DROP POLICY IF EXISTS kalk_versionen_wie_kalkulation ON kalkulation_versionen;
CREATE POLICY kalk_versionen_wie_kalkulation ON kalkulation_versionen
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM kalkulationen k WHERE k.id = kalkulation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM kalkulationen k WHERE k.id = kalkulation_id));
