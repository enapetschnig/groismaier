-- Meldung 6530ad7e (31.08.): "Bei manchen Kunden brauch ich weitere Felder
-- bei der Telefonnummer - mit + eine Zeile dazu, mit Bezeichnung zB
-- Mutter vor Ort, Vorarbeiter ect."
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS weitere_kontakte jsonb NOT NULL DEFAULT '[]'::jsonb;
