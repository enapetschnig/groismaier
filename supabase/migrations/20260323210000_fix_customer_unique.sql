-- Drop the too-strict name-only unique index
DROP INDEX IF EXISTS customers_name_unique;

-- Create a more sensible unique index: name + plz (allows same name with different address)
CREATE UNIQUE INDEX IF NOT EXISTS customers_name_plz_unique
  ON customers (LOWER(TRIM(name)), COALESCE(LOWER(TRIM(plz)), ''));
