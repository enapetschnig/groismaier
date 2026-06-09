-- ==============================================================
-- Ersttermin erweitert: Felder für vollständige Projekt-Anlage
-- ==============================================================
-- PLZ + Ort separat (vorher nur Freitext standort)
ALTER TABLE ersttermin_interessent
  ADD COLUMN IF NOT EXISTS standort_plz TEXT,
  ADD COLUMN IF NOT EXISTS standort_ort TEXT;

-- Geplantes Ende als echtes Datum (ergänzt zeitrahmen-Freitext)
ALTER TABLE ersttermin_interessent
  ADD COLUMN IF NOT EXISTS geplantes_ende DATE;

-- Leistungsarten als Array (ersetzt/ergänzt einzelnes gewerk-Feld)
ALTER TABLE ersttermin_interessent
  ADD COLUMN IF NOT EXISTS leistungsarten JSONB DEFAULT '[]';

-- Bauleiter als FK (ersetzt/ergänzt bauleiter-Text-Feld)
ALTER TABLE ersttermin_interessent
  ADD COLUMN IF NOT EXISTS bauleiter_id UUID REFERENCES employees(id) ON DELETE SET NULL;
