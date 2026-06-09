-- Erweiterbare Kategorien für Eingangsrechnungen.
-- Bestehende Werte bleiben als "seed" vorhanden (material/fremdleistung/...),
-- plus neue Kategorien (werkstatt, verbrauchsmaterial, geschaeftsessen, ...).
-- Admin kann über das Config-Options-UI weitere Kategorien hinzufügen.

INSERT INTO public.admin_config_options (kategorie, wert, label, sort_order)
VALUES
  ('eingangsrechnung_kategorie', 'material',          'Material',                   10),
  ('eingangsrechnung_kategorie', 'verbrauchsmaterial','Verbrauchsmaterial',         15),
  ('eingangsrechnung_kategorie', 'werkzeug',          'Werkzeug / Maschinen',       20),
  ('eingangsrechnung_kategorie', 'werkstatt',         'Werkstatt',                  25),
  ('eingangsrechnung_kategorie', 'fremdleistung',     'Fremdleistung',              30),
  ('eingangsrechnung_kategorie', 'miete',             'Miete / Leasing',            40),
  ('eingangsrechnung_kategorie', 'treibstoff',        'Treibstoff / KFZ',           50),
  ('eingangsrechnung_kategorie', 'geschaeftsessen',   'Geschäftsessen / Bewirtung', 60),
  ('eingangsrechnung_kategorie', 'buero',             'Büro / Verwaltung',          70),
  ('eingangsrechnung_kategorie', 'fortbildung',       'Fortbildung / Schulung',     80),
  ('eingangsrechnung_kategorie', 'versicherung',      'Versicherung / Gebühren',    85),
  ('eingangsrechnung_kategorie', 'reise',             'Reise / Hotel',              90),
  ('eingangsrechnung_kategorie', 'sonstiges',         'Sonstiges',                  99)
ON CONFLICT (kategorie, wert) DO NOTHING;
