-- ============================================================
-- Eingangsrechnungen: verrechnet-Status + Beleg-Lock
-- ============================================================
-- 1) verrechnet_am / verrechnet_in_invoice_id — trackt, wann und in
--    welcher Ausgangsrechnung der Beleg an den Kunden weiterverrechnet
--    wurde. Damit lassen sich offene Posten (bezahlt aber noch nicht
--    verrechnet) sauber filtern.
-- 2) beleg_locked — verhindert Re-Upload/Delete des Files nach
--    initialer Erfassung. Meta-Felder (Betrag, Status, Kategorie)
--    bleiben über die bestehende RLS weiterhin editierbar.

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS verrechnet_am DATE,
  ADD COLUMN IF NOT EXISTS verrechnet_in_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beleg_locked BOOLEAN DEFAULT FALSE;

-- Backfill: alles was bereits ein Beleg-File hat, wird gelockt. Damit
-- ist gewährleistet, dass Bestandsbelege nicht nachträglich manipuliert
-- werden können — nur neue Uploads laufen durch den neuen Lock-Flow.
UPDATE public.purchase_invoices
   SET beleg_locked = TRUE
 WHERE pdf_path IS NOT NULL AND pdf_path <> '' AND beleg_locked = FALSE;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_verrechnet
  ON public.purchase_invoices(verrechnet_am)
  WHERE verrechnet_am IS NOT NULL;

COMMENT ON COLUMN public.purchase_invoices.verrechnet_am IS
  'Datum, an dem der Beleg an den Kunden weiterverrechnet wurde (NULL = noch nicht verrechnet).';
COMMENT ON COLUMN public.purchase_invoices.verrechnet_in_invoice_id IS
  'Ausgangsrechnung, in der der Beleg verrechnet wurde. ON DELETE SET NULL — Verrechnung wird automatisch aufgehoben, wenn die Ausgangsrechnung entfernt wird.';
COMMENT ON COLUMN public.purchase_invoices.beleg_locked IS
  'Wenn TRUE: das Beleg-File (pdf_path) darf nicht mehr überschrieben oder gelöscht werden. Wird nach dem initialen Upload automatisch auf TRUE gesetzt.';
