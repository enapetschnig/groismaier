-- Verlauf fuer Kalkulationen (Kundenwunsch 24.08.2026: "dass man da auch den
-- Verlauf fuer sich selbst hat"). Gespeicherte Staende werden gedrosselt
-- versioniert (Stand beim Oeffnen + hoechstens alle 10 Minuten, max. 40 je
-- Kalkulation); der Editor bietet Ansehen + Wiederherstellen.
CREATE TABLE IF NOT EXISTS kalkulation_versionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kalkulation_id uuid NOT NULL REFERENCES kalkulationen(id) ON DELETE CASCADE,
  name text,
  summe numeric,
  data jsonb NOT NULL,
  fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kalk_versionen_kalk
  ON kalkulation_versionen (kalkulation_id, created_at DESC);
ALTER TABLE kalkulation_versionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_kalk_versionen ON kalkulation_versionen;
CREATE POLICY admin_all_kalk_versionen ON kalkulation_versionen
  FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
