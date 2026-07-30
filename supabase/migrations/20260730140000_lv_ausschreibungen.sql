-- ============================================================================
-- Ausschreibungen (ÖNORM A 2063, .onlv) — Import und Bepreisung.
--
-- Umsetzungsplan Modul B: eigener Menüpunkt, Datei hochladen, Positionen
-- bepreisen (Preisanteile Lohn/Sonstiges), Summen getrennt nach Positionsart.
--
-- `xml_original` speichert die hochgeladene Datei unverändert — das ist der
-- Schlüssel zum späteren Rückexport als Angebots-LV: Die Antwortdatei wird
-- nicht neu erzeugt, sondern das Original um Preise ergänzt, damit keine
-- Angaben verloren gehen, die wir nicht auswerten (Plan B4).
--
-- RLS: nur Administratoren. Ein Leistungsverzeichnis mit unseren Preisen ist
-- so vertraulich wie eine Kalkulation — Mitarbeiter haben darin nichts
-- verloren (dieselbe Linie wie bei kalkulationen, Migration 20260729*).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lv_ausschreibungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lvcode text,
  vorhaben text,
  lvbezeichnung text,
  auftraggeber_name text,
  auftraggeber_adresse text,
  waehrung text NOT NULL DEFAULT 'EUR',
  preisbasis text,
  schema_version text,
  programmsystem text,
  datei_name text,
  xml_original text NOT NULL,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bepreist', 'abgegeben')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lv_positionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lv_id uuid NOT NULL REFERENCES public.lv_ausschreibungen(id) ON DELETE CASCADE,
  positionsnummer text NOT NULL,
  lg text NOT NULL,
  lg_ueberschrift text,
  ulg text NOT NULL,
  ulg_ueberschrift text,
  grundtext_nr text,
  ftnr text,
  stichwort text,
  langtext_html text,
  einheit text,
  menge numeric,
  -- normal zählt in die Angebotssumme; wahl/eventual werden getrennt
  -- ausgewiesen; text ist reiner Vertragstext ohne Preis.
  positionsart text NOT NULL DEFAULT 'normal'
    CHECK (positionsart IN ('normal', 'wahl', 'eventual', 'text')),
  leistungsteil text,
  sort integer NOT NULL DEFAULT 0,
  ep_lohn numeric,
  ep_sonstiges numeric,
  bepreist_am timestamptz,
  notiz text
);

CREATE INDEX IF NOT EXISTS lv_positionen_lv_idx ON public.lv_positionen (lv_id, sort);

ALTER TABLE public.lv_ausschreibungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lv_positionen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_lv_ausschreibungen ON public.lv_ausschreibungen;
CREATE POLICY admin_all_lv_ausschreibungen ON public.lv_ausschreibungen
  FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

DROP POLICY IF EXISTS admin_all_lv_positionen ON public.lv_positionen;
CREATE POLICY admin_all_lv_positionen ON public.lv_positionen
  FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
