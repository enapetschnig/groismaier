-- ============================================================================
-- Produktkalkulation mit freien Kostenbausteinen (Kundenwunsch 3.4):
--
--   „Funktion, um einzelne Produkte kalkulieren zu können. (z. B. Stroh-
--    Einblasdämmung = Rohware Stroh + Transportkosten zu uns aufs Lager +
--    Arbeitszeit für den Einbau + Handling + Helfer bei der Maschine +
--    Müllentsorgung + Maschinenkosten)"
--
-- Die Artikelmaske konnte bisher EK + Verschnitt + Aufschlag + Befestigung +
-- Sonstiges + Lohn. Der Sammelposten „Sonstiges" versteckte die
-- Zusammensetzung — jetzt gibt es beliebig viele BENANNTE Bausteine je
-- Einheit: [{"bezeichnung":"Transport ins Lager","betrag":1.20}, …].
-- Verschnitt für Holz gab es bereits (verschnitt_prozent).
-- ============================================================================
ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS kalk_bausteine jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.invoice_templates.kalk_bausteine IS
  'Benannte Kostenbausteine je Einheit für kalkulierte Artikel: [{bezeichnung, betrag}].';
