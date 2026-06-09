-- Extend customers table with fields from CSV import
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS kundennummer TEXT,
ADD COLUMN IF NOT EXISTS anrede TEXT,
ADD COLUMN IF NOT EXISTS titel TEXT,
ADD COLUMN IF NOT EXISTS vorname TEXT,
ADD COLUMN IF NOT EXISTS nachname TEXT,
ADD COLUMN IF NOT EXISTS telefon2 TEXT,
ADD COLUMN IF NOT EXISTS zahlungsbedingungen TEXT,
ADD COLUMN IF NOT EXISTS skonto_prozent DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS skonto_tage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS nettofrist INTEGER DEFAULT 0;

-- Drop the old unique index (name + plz) so we can re-import
DROP INDEX IF EXISTS idx_customers_name_plz_unique;
