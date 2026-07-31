-- ============================================================================
-- Eingangsrechnung einem Fahrzeug/einer Maschine zuordenbar (Kundenwunsch):
--
--   „Ich möchte, dass man bei den Eingangsrechnungen Rechnungen hochladen
--    und diese auch einem Auto zuordnen kann — also nicht nur einem Projekt.
--    Dann brauchen wir das im KFZ-Manager nicht [manuell], weil das dann
--    automatisch dem jeweiligen Fahrzeug zugeordnet wird."
--
-- Der KFZ-Manager liest die Kosten je Gerät künftig aus DIESER Zuordnung
-- (plus Alt-Zeilen in vehicle_costs); die manuelle Kostenerfassung dort
-- entfällt.
-- ============================================================================
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_invoices_vehicle_idx
  ON public.purchase_invoices (vehicle_id) WHERE vehicle_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_invoices.vehicle_id IS
  'Zuordnung zu einem Fahrzeug/einer Maschine — Kosten erscheinen automatisch im KFZ-Manager.';
