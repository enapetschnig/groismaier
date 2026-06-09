-- Add missing 'aktiv' column to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS aktiv BOOLEAN DEFAULT true;

-- Set all existing employees to active
UPDATE employees SET aktiv = true WHERE aktiv IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
