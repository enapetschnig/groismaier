-- Unified Ersttermin: Add missing columns to ersttermin_interessent

-- Nächste Schritte
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS angebot_ersteller TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS angebot_bis DATE;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS folgetermin_noetig BOOLEAN DEFAULT FALSE;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS folgetermin_datum DATE;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS fehlende_unterlagen TEXT;

-- Zuständigkeiten
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS zustaendigkeiten_intern TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS zustaendigkeiten_extern TEXT;

-- Anmerkungen
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS anmerkungen TEXT;

-- Unterschriften
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS unterschrift_berater TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS unterschrift_interessent TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS unterschrift_am TIMESTAMPTZ;

-- Technisch
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS offene_technische_fragen TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS genehmigungen_relevant TEXT;

-- Ressourcen (from Ersttermin Projekt template)
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS bauleiter TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS beteiligte TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS benoetigte_materialien TEXT;
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS stunden_schaetzung NUMERIC(8,2);
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS materialkosten NUMERIC(12,2);
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS fremdkosten NUMERIC(12,2);
ALTER TABLE ersttermin_interessent ADD COLUMN IF NOT EXISTS gesamtkosten NUMERIC(12,2);

-- Seed: Ersttermin Checkliste (admin-configurable)
INSERT INTO admin_config_options (kategorie, wert, label, sort_order) VALUES
  ('ersttermin_checkliste', 'anforderung_geklaert', 'Kundenanforderung und Zielbild geklärt', 1),
  ('ersttermin_checkliste', 'bestand_aufgenommen', 'Bestand / Ist-Zustand aufgenommen', 2),
  ('ersttermin_checkliste', 'aufmass_genommen', 'Aufmaß genommen bzw. Prüftermin notwendig', 3),
  ('ersttermin_checkliste', 'fotos_aufgenommen', 'Fotos aufgenommen', 4),
  ('ersttermin_checkliste', 'zufahrt_geprueft', 'Zufahrt, Zugang und Arbeitssituation geprüft', 5),
  ('ersttermin_checkliste', 'materialien_abgestimmt', 'Materialien / Oberflächen / Ausführung abgestimmt', 6),
  ('ersttermin_checkliste', 'besonderheiten_erkannt', 'Behördliche / technische Besonderheiten erkannt', 7),
  ('ersttermin_checkliste', 'firmen_identifiziert', 'Benötigte Firmen intern / extern identifiziert', 8)
ON CONFLICT (kategorie, wert) DO NOTHING;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticator;
