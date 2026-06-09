-- ============================================================
-- invoices.parent_invoice_id → ON DELETE RESTRICT
-- ============================================================
-- Vorher: ON DELETE SET NULL → löscht der User ein Angebot/AB, bleiben
-- die abgeleiteten Anzahlungs-/Schlussrechnungen als Waisen ohne Kontext
-- zurück. Das kann zu falsch zugeordneten Abzügen und verloren
-- gegangener Dokumenten-Genealogie führen.
--
-- Neu: RESTRICT → der User bekommt bei Löschversuch einen Fehler,
-- solange noch Folgedokumente existieren. Für Löschung muss er erst
-- die Folgedokumente selbst entfernen oder stornieren.

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_parent_invoice_id_fkey;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_parent_invoice_id_fkey
  FOREIGN KEY (parent_invoice_id)
  REFERENCES public.invoices(id)
  ON DELETE RESTRICT;
