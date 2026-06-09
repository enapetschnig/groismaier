-- Fix missing columns on invoice_items that the frontend expects
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS kurztext TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS langtext TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS rabatt_prozent NUMERIC(5,2) DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
