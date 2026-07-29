-- ============================================================================
-- Finanzplanung — Nachbau der Planrechnung (Steuerberater "Haider mal Zwei",
-- Stand 5/2025) direkt in der App.
--
-- Leitgedanke: Die IST-Werte werden NICHT gespeichert, sondern aus den Belegen
-- gerechnet, die ohnehin in der App entstehen (Rechnungen, Zahlungseingänge,
-- Eingangsrechnungen). Gespeichert werden nur:
--   * die PLAN-Werte (Soll),
--   * Stammdaten, die es sonst nirgends gibt (Fixkosten, Kredite, Investitionen),
--   * IST-Werte aus der Zeit VOR der App-Einführung (Excel-Import).
--
-- Alles nur für Administratoren — hier stehen Gewinn, Löhne und Kredite.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kategorien (Zeilenstruktur der Aufwands-/Ertragsblätter)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finanz_kategorien (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bereich      text NOT NULL CHECK (bereich IN
                 ('sbaw','wareneinkauf','foerderung','sonstiger_ertrag','zinsertrag')),
  kategorie    text NOT NULL,
  detail       text,
  sort         integer NOT NULL DEFAULT 0,
  aktiv        boolean NOT NULL DEFAULT true,
  -- Kreditzinsen sind im Excel eine SBAW-Zeile, werden in der GuV aber separat
  -- als "Zinsen und ähnliche Aufwendungen" ausgewiesen UND aus der SBAW-Summe
  -- herausgerechnet (SBAW!AD132 = SUMME(AD7:AD131) - AD100). Dieses Flag bildet
  -- genau das ab — ohne es wären die Zinsen doppelt im Aufwand.
  ist_zinsaufwand boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finanz_kategorien_bereich_idx ON public.finanz_kategorien (bereich, sort);

-- ---------------------------------------------------------------------------
-- 2. Monatswerte (eine Zeile = eine Zelle des Monatsrasters)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finanz_werte (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategorie_id uuid NOT NULL REFERENCES public.finanz_kategorien(id) ON DELETE CASCADE,
  jahr         integer NOT NULL,
  monat        integer NOT NULL CHECK (monat BETWEEN 1 AND 12),
  soll         numeric(14,2),
  -- Nur befüllt für Zeiträume ohne Belege in der App (Excel-Historie) bzw. für
  -- Bereiche, die die App nicht selbst kennt.
  ist_manuell  numeric(14,2),
  notiz        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kategorie_id, jahr, monat)
);
CREATE INDEX IF NOT EXISTS finanz_werte_periode_idx ON public.finanz_werte (jahr, monat);

-- ---------------------------------------------------------------------------
-- 3. Personalkosten (PEK) — Soll aus Planung, Ist aus der Lohnverrechnung
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finanz_personal (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  name         text NOT NULL,
  rolle        text,                       -- Chef / MA 1 / Angestellte …
  jahr         integer NOT NULL,
  monat        integer NOT NULL CHECK (monat BETWEEN 1 AND 12),
  soll         numeric(14,2),
  ist          numeric(14,2),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, jahr, monat)
);

-- ---------------------------------------------------------------------------
-- 4. Kredite — die Monatsraten entstehen daraus automatisch
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finanz_kredite (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  bank           text,
  kreditbetrag   numeric(14,2),
  rate_monatlich numeric(14,2) NOT NULL DEFAULT 0,
  zinssatz       numeric(6,3),
  start_jahr     integer,
  start_monat    integer CHECK (start_monat BETWEEN 1 AND 12),
  laufzeit_monate integer,
  -- true = geplante NEUE Kreditlinie (im Liquiditätsplan ein Zufluss),
  -- false = bestehender Kredit (nur Ratenabfluss)
  ist_neue_linie boolean NOT NULL DEFAULT false,
  aktiv          boolean NOT NULL DEFAULT true,
  notiz          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. Anschaffungen + AfA-Katalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.afa_saetze (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anlagenbeschreibung text NOT NULL,
  nutzungsdauer       integer NOT NULL
);
CREATE INDEX IF NOT EXISTS afa_saetze_name_idx ON public.afa_saetze (lower(anlagenbeschreibung));

CREATE TABLE IF NOT EXISTS public.finanz_anschaffungen (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategorie      text,
  bezeichnung    text NOT NULL,
  afa_text       text,                     -- Eintrag aus dem AfA-Katalog
  nutzungsdauer  integer,                  -- Jahre; 0/NULL = GWG (Sofortabschreibung)
  ist_gwg        boolean NOT NULL DEFAULT false,
  jahr           integer NOT NULL,
  monat          integer NOT NULL CHECK (monat BETWEEN 1 AND 12),
  betrag_soll    numeric(14,2),
  betrag_ist     numeric(14,2),
  notiz          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. Bauvorhaben-Pipeline
--    Die Zeilen entstehen aus Angeboten/Aufträgen (invoice_id) — hier stehen
--    nur die Planungs-Zusätze, die im Beleg nichts verloren haben. Vorhaben
--    ohne Angebot in der App können manuell erfasst werden (invoice_id NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finanz_bv (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id     uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  kunde           text,
  bezeichnung     text,
  -- entwurf | angebot | beauftragt  (bei verknüpftem Beleg aus dessen Status
  -- abgeleitet, hier nur überschreibbar)
  phase           text CHECK (phase IN ('entwurf','angebot','beauftragt')),
  summe           numeric(14,2),
  start_jahr      integer,
  start_monat     integer CHECK (start_monat BETWEEN 1 AND 12),
  ende_jahr       integer,
  ende_monat      integer CHECK (ende_monat BETWEEN 1 AND 12),
  -- Anzahl Teilrechnungen (nur Band ">60.000"); NULL = Vorgabe aus Einstellungen
  teilzahlungen   integer,
  anz_prozent     numeric(6,2),            -- überschreibt den Bandwert
  schluss_prozent numeric(6,2),
  aktiv           boolean NOT NULL DEFAULT true,
  notiz           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id)
);

-- ---------------------------------------------------------------------------
-- 7. RLS — durchgängig nur Administratoren
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finanz_kategorien','finanz_werte','finanz_personal',
                           'finanz_kredite','afa_saetze','finanz_anschaffungen','finanz_bv']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'administrator'::app_role))
        WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role))
    $f$, t || '_admin_only', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Einstellungen — die Zahlungsstaffel exakt nach den Excel-FORMELN.
--
--    Achtung: Das Excel-Blatt "Erklärungen" beschreibt die Staffel anders
--    (>60.000 mit 5 % Schlusszahlung) als die tatsächlich rechnenden Formeln
--    in "Umsatzberechnung 1/2/4" (10 %). Übernommen sind die Formeln, weil
--    die die Zahlen erzeugt haben, die im Plan stehen.
--
--    "Umsatzberechnung 3" (60.000–300.000, 4 feste Teilrechnungen) ist im
--    Excel verwaist — die Spalte U3 im Blatt "Umsatz" ist in allen Zeilen
--    leer. Deshalb hier bewusst nur drei Bänder.
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES
  ('finanz_zahlungsstaffel', '[
     {"bis": 10000,  "anzahlung": 50, "teilzahlungen": 0, "schluss": 0},
     {"bis": 60000,  "anzahlung": 30, "teilzahlungen": 1, "schluss": 10},
     {"bis": null,   "anzahlung": 15, "teilzahlungen": 4, "schluss": 10}
   ]'),
  ('finanz_koest_satz', '23'),
  ('finanz_koest_mindest', '500'),
  ('finanz_planjahre', '3'),
  ('finanz_basisjahr', '2025'),
  ('finanz_liq_bargeld', '0'),
  ('finanz_liq_konto', '0'),
  ('finanz_liq_kreditlinien', '0'),
  ('finanz_liq_warnschwelle', '0')
ON CONFLICT (key) DO NOTHING;
