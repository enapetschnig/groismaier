-- Generische updated_at Funktion
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at Spalte auf invoices sicherstellen (falls nicht vorhanden)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger anlegen (drop-first für Idempotenz)
DROP TRIGGER IF EXISTS invoices_set_updated_at ON public.invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Analog für andere wichtige Tabellen die Optimistic Locking nutzen sollen
ALTER TABLE public.bautagesberichte ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
DROP TRIGGER IF EXISTS btb_set_updated_at ON public.bautagesberichte;
CREATE TRIGGER btb_set_updated_at
  BEFORE UPDATE ON public.bautagesberichte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
