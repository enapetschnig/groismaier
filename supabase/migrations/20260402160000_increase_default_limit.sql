-- Increase default row limit for invoice_templates API access
-- This ensures all 1373+ products are returned without needing .limit() in frontend
ALTER ROLE authenticator SET pgrst.db_max_rows = 5000;
NOTIFY pgrst, 'reload config';
