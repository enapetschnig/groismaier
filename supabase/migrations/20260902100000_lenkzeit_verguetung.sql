-- ============================================================================
--  LENKZEITVERGÜTUNG (Kundenwunsch 02.09.2026)
-- ============================================================================
--
-- „Entfernung zur Baustelle nach Google Maps inkl. Zeit … bei mindestens
--  25 min Reisezeit (eine Strecke) soll diese Zeit automatisch bei
--  Stundenbuchungen als Lenkzeitvergütung gebucht werden. Für Fahrer/
--  Beifahrer braucht es zwei Kästchen … der Fahrer bekommt etwas mehr Geld.
--  Projekte unter 25 min werden als normale Arbeitszeit gebucht."
--
-- Aufbau in drei Teilen:
--   1) Am PROJEKT steht die Reisezeit (eine Strecke) und die Entfernung.
--   2) Am MITARBEITER stehen die Sätze für Fahrer und Beifahrer (€/Stunde
--      Lenkzeit) — pflegbar unter Stammdaten/Personal.
--   3) An der ZEITBUCHUNG wird vermerkt, ob jemand gefahren ist und wie
--      viele Minuten Lenkzeit anfielen. Der Betrag wird NICHT gespeichert,
--      sondern immer aus dem aktuellen Satz gerechnet — sonst wären
--      Satzänderungen rückwirkend unsichtbar.

-- 1) Projekt: Reisezeit + Entfernung ----------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS fahrzeit_minuten integer,
  ADD COLUMN IF NOT EXISTS entfernung_km numeric(6,1);

COMMENT ON COLUMN public.projects.fahrzeit_minuten IS
  'Reisezeit EINE Strecke in Minuten (Google Maps). Ab 25 min gibt es Lenkzeitvergütung.';

-- 2) Mitarbeiter: Vergütungssätze -------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS fahrer_verguetung numeric(10,2),
  ADD COLUMN IF NOT EXISTS beifahrer_verguetung numeric(10,2);

COMMENT ON COLUMN public.employees.fahrer_verguetung IS
  'Vergütung je Stunde Lenkzeit, wenn der Mitarbeiter selbst fährt (EUR).';

-- Betriebsweite Vorgabewerte, damit nicht jeder Mitarbeiter einzeln gepflegt
-- werden muss; der Wert am Mitarbeiter gewinnt.
INSERT INTO public.app_settings (key, value)
VALUES ('lenkzeit_schwelle_minuten', '25'),
       ('lenkzeit_satz_fahrer', '0'),
       ('lenkzeit_satz_beifahrer', '0')
ON CONFLICT (key) DO NOTHING;

-- 3) Zeitbuchung: Fahrer/Beifahrer + Lenkzeit -------------------------------
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS ist_fahrer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ist_beifahrer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lenkzeit_minuten integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.time_entries.lenkzeit_minuten IS
  'Vergütete Lenkzeit dieses Tages in Minuten (Hin- und Rückfahrt), 0 = keine.';

CREATE INDEX IF NOT EXISTS idx_time_entries_lenkzeit
  ON public.time_entries (user_id, datum) WHERE lenkzeit_minuten > 0;
