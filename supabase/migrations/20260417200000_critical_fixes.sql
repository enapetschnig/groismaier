-- ============================================================
-- Critical integrity & consistency fixes
-- ============================================================

-- 1. Unique Username (atomar, race-safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_username_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_unique UNIQUE (username);
  END IF;
END $$;

-- 2. Einsatz: end_date >= start_date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'einsaetze_dates_check'
  ) THEN
    ALTER TABLE public.einsaetze
      ADD CONSTRAINT einsaetze_dates_check CHECK (end_date >= start_date);
  END IF;
END $$;

-- 3. board_projects: Datums-Pflichtfelder + CHECK
-- Bestehende NULL-Werte mit heutigem Datum + 30 Tagen füllen
UPDATE public.board_projects
SET start_date = CURRENT_DATE
WHERE start_date IS NULL;

UPDATE public.board_projects
SET end_date = start_date + INTERVAL '30 days'
WHERE end_date IS NULL;

ALTER TABLE public.board_projects ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE public.board_projects ALTER COLUMN end_date SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_projects_dates_check'
  ) THEN
    ALTER TABLE public.board_projects
      ADD CONSTRAINT board_projects_dates_check CHECK (end_date >= start_date);
  END IF;
END $$;

-- 4. Invoices: Skonto zwischen 0 und 100%, Rabatt zwischen 0 und 100%
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_skonto_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_skonto_check
      CHECK (skonto_prozent IS NULL OR (skonto_prozent >= 0 AND skonto_prozent <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_rabatt_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_rabatt_check
      CHECK (rabatt_prozent IS NULL OR (rabatt_prozent >= 0 AND rabatt_prozent <= 100));
  END IF;
END $$;

-- 5. Legacy Table: RLS absichern (falls nicht bereits) + alle Policies entfernen
ALTER TABLE IF EXISTS public.worker_assignments_legacy ENABLE ROW LEVEL SECURITY;

-- Alle alten Policies auf legacy-Tabelle droppen (falls vorhanden)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'worker_assignments_legacy' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.worker_assignments_legacy', pol.policyname);
  END LOOP;
END $$;

-- Nur Admins dürfen noch lesen (für Audit / Wiederherstellung)
CREATE POLICY "Only admins read legacy"
  ON public.worker_assignments_legacy FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role));
