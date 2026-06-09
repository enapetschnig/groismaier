-- Fix missing columns on invoices table that the frontend expects
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kundennummer TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kunde_anrede TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kunde_titel TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT FALSE;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
