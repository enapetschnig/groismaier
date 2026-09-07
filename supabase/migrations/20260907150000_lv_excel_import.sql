-- ============================================================================
--  Ausschreibungen: LV aus Excel einlesen (Kundenwunsch 07.09.2026)
-- ============================================================================
-- Ein Excel-LV hat kein ÖNORM-XML - das Original darf leer sein. Die Quelle
-- wird gemerkt (onlv / excel), damit z. B. der ÖNORM-Export weiss, dass es
-- fuer Excel-LVs keine Originaldatei gibt.

ALTER TABLE public.lv_ausschreibungen ALTER COLUMN xml_original DROP NOT NULL;
ALTER TABLE public.lv_ausschreibungen
  ADD COLUMN IF NOT EXISTS quelle text NOT NULL DEFAULT 'onlv'
  CHECK (quelle IN ('onlv', 'excel'));

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Ausschreibungen: LV aus Excel einlesen',
   'Unter Ausschreibungen laesst sich jetzt auch ein Leistungsverzeichnis als Excel-Datei einlesen. Die App erkennt Kopfzeile und Spalten (Pos-Nr, Text, Menge, Einheit, ggf. Einheitspreis) und zeigt die Zuordnung zur Kontrolle - danach bepreisen wie beim OENORM-LV und als Angebot uebernehmen.');
