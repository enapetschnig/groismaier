-- ============================================================
-- Freie Mitarbeiter: neue Beschäftigungsart
-- ============================================================
-- Freie Mitarbeiter haben keinen Anstellungsvertrag — sie können
-- Projektstunden erfassen, aber haben kein Tagessoll, kein Zeitkonto
-- und werden in Auswertungen separat behandelt.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ist_freelancer BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN public.employees.ist_freelancer IS
  'true = freier Mitarbeiter (kein Tagessoll, kein Zeitkonto, nur Projektzeiterfassung)';

CREATE INDEX IF NOT EXISTS employees_ist_freelancer_idx
  ON public.employees (ist_freelancer)
  WHERE ist_freelancer = true;
