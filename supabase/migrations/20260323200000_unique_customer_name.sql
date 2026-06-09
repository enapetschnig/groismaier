-- Remove duplicate customers (keep the oldest one)
DELETE FROM customers a USING customers b
WHERE a.id > b.id AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name));

-- Add unique constraint on customer name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS customers_name_unique ON customers (LOWER(TRIM(name)));
