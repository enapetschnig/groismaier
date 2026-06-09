-- ============================================================
-- 1) Kunden: Herkunft/Referenz als erweiterbare Liste
-- 2) Mitarbeiter: Kinder (JSONB), Foto-URL
-- ============================================================

-- customers.herkunft (Freitext; Vorschläge kommen aus config_options)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS herkunft TEXT;

COMMENT ON COLUMN public.customers.herkunft IS
  'Wie der Kunde zu uns gekommen ist (Empfehlung, Google, Messe, Portas …). Freitext, Vorschläge in config_options category=kunde_herkunft.';

-- Seed für Dropdown-Vorschläge (kunde_herkunft). Die Liste ist dann in der
-- Konfiguration/Admin unter admin_config_options erweiterbar.
INSERT INTO public.admin_config_options (kategorie, wert, label, sort_order)
VALUES
  ('kunde_herkunft', 'empfehlung',     'Empfehlung',           1),
  ('kunde_herkunft', 'google',         'Google / Suche',       2),
  ('kunde_herkunft', 'messe',          'Messe / Event',        3),
  ('kunde_herkunft', 'social_media',   'Social Media',         4),
  ('kunde_herkunft', 'website',        'Website',              5),
  ('kunde_herkunft', 'portas',         'Portas-Netzwerk',      6),
  ('kunde_herkunft', 'bestandskunde',  'Bestandskunde',        7),
  ('kunde_herkunft', 'sonstiges',      'Sonstiges',           99)
ON CONFLICT DO NOTHING;

-- employees.foto_url (Avatar-URL aus employee-documents-Bucket oder externer Link)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- employees.kinder (JSONB: [{ name, geburtsdatum }, ...])
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS kinder JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.employees.kinder IS
  'Liste von Kindern: [{ name, geburtsdatum, anmerkung }]. Für Familienbeihilfe/Urlaubsplanung.';
