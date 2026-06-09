-- ============================================================
-- Artikelverwaltung, Angebots-Workflow, Regie-Integration
-- ============================================================

-- 1. Drop and recreate invoices status constraint to include 'verrechnet' and 'teilbezahlt'
-- The original constraint may or may not exist, so we use DO block
DO $$
BEGIN
  -- Try to drop existing constraint (name auto-generated or inline)
  ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
  -- Re-add with all valid statuses
  ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('entwurf', 'gesendet', 'bezahlt', 'teilbezahlt', 'storniert', 'abgelehnt', 'angenommen', 'verrechnet'));
EXCEPTION WHEN OTHERS THEN
  -- If constraint doesn't exist by that name, just add the new one
  NULL;
END $$;

-- 2. material_entries erweitern für Entnahme/Rückgabe/Verbrauch
ALTER TABLE material_entries ADD COLUMN IF NOT EXISTS einheit TEXT DEFAULT 'Stk.';
ALTER TABLE material_entries ADD COLUMN IF NOT EXISTS einzelpreis NUMERIC(10,2) DEFAULT 0;
ALTER TABLE material_entries ADD COLUMN IF NOT EXISTS typ TEXT DEFAULT 'verbrauch';
ALTER TABLE material_entries ADD COLUMN IF NOT EXISTS datum DATE DEFAULT CURRENT_DATE;
ALTER TABLE material_entries ADD COLUMN IF NOT EXISTS disturbance_id UUID REFERENCES disturbances ON DELETE SET NULL;

-- 3. disturbance_materials erweitern für Preise
ALTER TABLE disturbance_materials ADD COLUMN IF NOT EXISTS einheit TEXT DEFAULT 'Stk.';
ALTER TABLE disturbance_materials ADD COLUMN IF NOT EXISTS einzelpreis NUMERIC(10,2) DEFAULT 0;
