-- ============================================================
-- Dokumenten-Erweiterung: Auftragsbestätigung, Lieferschein,
-- Anzahlungs-/Teil-/Schlussrechnung, Gutschrift, Kundennummer,
-- editierbare Textbausteine, Dokument-Genealogie.
-- ============================================================

-- ------------------------------------------------------------
-- 1) invoices.typ erweitern + parent_invoice_id + Anzahlungsfelder
-- ------------------------------------------------------------

-- alten CHECK-Constraint entfernen und neu setzen
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_typ_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_typ_check
  CHECK (typ IN (
    'angebot',
    'auftragsbestaetigung',
    'rechnung',
    'anzahlungsrechnung',
    'teilrechnung',
    'schlussrechnung',
    'lieferschein',
    'gutschrift'
  ));

-- Verkettung zwischen Dokumenten (Angebot → AB → Schlussrechnung usw.)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

-- Anzahlungs-Spalten (nur für typ='anzahlungsrechnung' relevant)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS anzahlung_prozent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS anzahlung_betrag NUMERIC(12,2);

COMMENT ON COLUMN public.invoices.parent_invoice_id IS
  'Verweis auf Ausgangsdokument. Angebot→AB, AB→Anzahlungsrechnung, AB→Schlussrechnung usw.';
COMMENT ON COLUMN public.invoices.anzahlung_prozent IS
  'Anzahlungs-Prozentsatz (falls typ=anzahlungsrechnung). Alternativ anzahlung_betrag.';
COMMENT ON COLUMN public.invoices.anzahlung_betrag IS
  'Anzahlungs-Fixbetrag (falls typ=anzahlungsrechnung). Alternativ anzahlung_prozent.';

CREATE INDEX IF NOT EXISTS idx_invoices_parent ON public.invoices(parent_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_typ ON public.invoices(typ);

-- ------------------------------------------------------------
-- 2) Nummernkreise seeden (in number_ranges + app_settings)
-- ------------------------------------------------------------

INSERT INTO public.number_ranges (typ, label, prefix, stellen, start_nummer, format_pattern) VALUES
  ('auftragsbestaetigung', 'Auftragsbestätigungen', 'AB', 3, 1, '{PREFIX}{YY}{NNN}'),
  ('lieferschein',         'Lieferscheine',          'LS', 3, 1, '{PREFIX}{YY}{NNN}'),
  ('anzahlungsrechnung',   'Anzahlungsrechnungen',   'AR', 3, 1, '{PREFIX}{YY}{NNN}'),
  ('teilrechnung',         'Teilrechnungen',         'TR', 3, 1, '{PREFIX}{YY}{NNN}'),
  ('schlussrechnung',      'Schlussrechnungen',      'SR', 3, 1, '{PREFIX}{YY}{NNN}'),
  ('gutschrift',           'Gutschriften',           'GS', 3, 1, '{PREFIX}{YY}{NNN}'),
  ('kundennummer',         'Kundennummern',          'K',  5, 1, '{PREFIX}-{NNN}')
ON CONFLICT (typ) DO NOTHING;

-- Parallel in app_settings spiegeln (damit das UI dieselben Werte zeigt)
INSERT INTO public.app_settings (key, value) VALUES
  ('auftragsbestaetigung_prefix', 'AB'),
  ('auftragsbestaetigung_format', '{PREFIX}{YY}{NNN}'),
  ('auftragsbestaetigung_start_nummer', '1'),
  ('auftragsbestaetigung_stellen', '3'),
  ('lieferschein_prefix', 'LS'),
  ('lieferschein_format', '{PREFIX}{YY}{NNN}'),
  ('lieferschein_start_nummer', '1'),
  ('lieferschein_stellen', '3'),
  ('anzahlungsrechnung_prefix', 'AR'),
  ('anzahlungsrechnung_format', '{PREFIX}{YY}{NNN}'),
  ('anzahlungsrechnung_start_nummer', '1'),
  ('anzahlungsrechnung_stellen', '3'),
  ('teilrechnung_prefix', 'TR'),
  ('teilrechnung_format', '{PREFIX}{YY}{NNN}'),
  ('teilrechnung_start_nummer', '1'),
  ('teilrechnung_stellen', '3'),
  ('schlussrechnung_prefix', 'SR'),
  ('schlussrechnung_format', '{PREFIX}{YY}{NNN}'),
  ('schlussrechnung_start_nummer', '1'),
  ('schlussrechnung_stellen', '3'),
  ('gutschrift_prefix', 'GS'),
  ('gutschrift_format', '{PREFIX}{YY}{NNN}'),
  ('gutschrift_start_nummer', '1'),
  ('gutschrift_stellen', '3'),
  ('kundennummer_prefix', 'K'),
  ('kundennummer_format', '{PREFIX}-{NNN}'),
  ('kundennummer_start_nummer', '1'),
  ('kundennummer_stellen', '5')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 3) customers.kundennummer (UNIQUE, nullable → nachfüllbar)
-- ------------------------------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS kundennummer TEXT;

-- Duplikate absichern. Die Vergabe erfolgt immer über next_document_number('kundennummer'),
-- weshalb Kollisionen faktisch ausgeschlossen sind.
CREATE UNIQUE INDEX IF NOT EXISTS customers_kundennummer_uniq
  ON public.customers(kundennummer)
  WHERE kundennummer IS NOT NULL;

COMMENT ON COLUMN public.customers.kundennummer IS
  'Kundennummer im Format K-00001. Wird beim Anlegen automatisch über next_document_number() vergeben.';

-- Backfill: alle bestehenden Kunden ohne Nummer bekommen nachträglich eine.
-- In sortierter Reihenfolge (ältester zuerst) für stabile Nummerierung.
DO $$
DECLARE
  rec RECORD;
  neue_nr TEXT;
BEGIN
  FOR rec IN
    SELECT id FROM public.customers
    WHERE kundennummer IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    neue_nr := public.next_document_number('kundennummer');
    UPDATE public.customers SET kundennummer = neue_nr WHERE id = rec.id;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4) Textbausteine je Dokumenttyp
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT NOT NULL,     -- 'angebot','rechnung','auftragsbestaetigung','anzahlungsrechnung',...
  feld TEXT NOT NULL,    -- 'intro','closing','zahlungsbedingungen','anzahlung_hinweis','danke'
  sprache TEXT NOT NULL DEFAULT 'de',
  inhalt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(typ, feld, sprache)
);

ALTER TABLE public.document_texts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_document_texts" ON public.document_texts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
CREATE POLICY "auth_read_document_texts" ON public.document_texts
  FOR SELECT TO authenticated USING (true);

-- Standardtexte seeden (greifen nur wenn noch kein Eintrag für typ+feld existiert)
INSERT INTO public.document_texts (typ, feld, inhalt) VALUES
  ('angebot',              'closing',              'Dieses Angebot ist 30 Tage gültig. Wir freuen uns auf Ihre Rückmeldung.'),
  ('angebot',              'intro',                'Wir freuen uns, Ihnen folgendes Angebot unterbreiten zu dürfen:'),
  ('auftragsbestaetigung', 'intro',                'Wir bestätigen hiermit den Auftrag gemäß Angebot {{angebot_nr}} vom {{angebot_datum}}.'),
  ('auftragsbestaetigung', 'closing',              'Voraussichtlicher Ausführungszeitraum: wird separat abgestimmt. Vielen Dank für Ihren Auftrag.'),
  ('rechnung',             'closing',              'Zahlbar innerhalb {{tage}} Tagen ohne Abzug.'),
  ('rechnung',             'zahlungsbedingungen',  'Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer.'),
  ('anzahlungsrechnung',   'intro',                'Anzahlungsrechnung lt. Auftragsbestätigung {{ab_nr}}.'),
  ('anzahlungsrechnung',   'closing',              'Anzahlung in Höhe von {{prozent}}%. Die Schlussrechnung erfolgt nach Fertigstellung.'),
  ('teilrechnung',         'intro',                'Teilrechnung zum aktuellen Leistungsstand.'),
  ('teilrechnung',         'closing',              'Zahlbar innerhalb {{tage}} Tagen. Verrechnung in der Schlussrechnung.'),
  ('schlussrechnung',      'intro',                'Schlussrechnung. Bereits geleistete Anzahlungen werden anbei verrechnet.'),
  ('schlussrechnung',      'closing',              'Der ausgewiesene Restbetrag ist innerhalb {{tage}} Tagen fällig.'),
  ('lieferschein',         'intro',                'Wir liefern folgende Positionen:'),
  ('lieferschein',         'closing',              'Bitte prüfen Sie die Lieferung und bestätigen den Empfang per Unterschrift.'),
  ('gutschrift',           'intro',                'Gutschrift zu Rechnung {{rechnung_nr}} vom {{rechnung_datum}}.'),
  ('gutschrift',           'closing',              'Der Gutschriftsbetrag wird Ihrem Konto umgehend erstattet.'),
  ('_global',              'danke',                'Vielen Dank für Ihr Vertrauen.')
ON CONFLICT (typ, feld, sprache) DO NOTHING;

-- ------------------------------------------------------------
-- 5) Alte lieferscheine-Tabelle: wenn leer, löschen.
--    Wenn nicht leer, nur Warnung (wir lassen die Daten stehen).
-- ------------------------------------------------------------

DO $$
DECLARE
  cnt INTEGER;
  tbl_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lieferscheine'
  ) INTO tbl_exists;

  IF tbl_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.lieferscheine' INTO cnt;
    IF cnt = 0 THEN
      DROP TABLE public.lieferscheine CASCADE;
      RAISE NOTICE 'Alte leere lieferscheine-Tabelle wurde entfernt (Lieferscheine laufen nun über invoices.typ=lieferschein).';
    ELSE
      RAISE NOTICE 'lieferscheine-Tabelle enthält % Datensätze und wurde NICHT entfernt. Bitte manuell migrieren.', cnt;
    END IF;
  END IF;
END $$;
