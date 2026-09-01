-- Kundenwunsch 01.09.2026: "wenn schon mal eine Arbeitszeit in eine Rechnung
-- reingeschrieben wurde, dann unter verrechnet - aber ich will ALLE Sachen
-- von diesem Projekt sehen."
--
-- Bisher gab es einen Verrechnet-Vermerk nur bei Regieberichten
-- (disturbances.is_verrechnet / verrechnet_in_invoice_id). Arbeitszeiten und
-- Materialbuchungen bekommen denselben Vermerk, damit die Baustellen-
-- Abrechnung zeigen kann, was schon auf einer Rechnung steht - statt es
-- einfach wegzulassen.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS verrechnet_in_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.material_entries
  ADD COLUMN IF NOT EXISTS verrechnet_in_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_verrechnet
  ON public.time_entries (verrechnet_in_invoice_id) WHERE verrechnet_in_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_entries_verrechnet
  ON public.material_entries (verrechnet_in_invoice_id) WHERE verrechnet_in_invoice_id IS NOT NULL;
