-- ============================================================
-- Ansprechpartner auf Rechnungen/Angeboten: FK zum Mitarbeiter
-- ============================================================
-- Bis jetzt lagen Name/Telefon/E-Mail nur als Freitext-Felder auf
-- invoices. Sie wurden beim Kunden-/Projekt-Wechsel aus
-- customers.ansprechpartner kopiert — das waren also eher
-- Kunden-Kontakte. Richtig ist: auf einer Rechnung/einem Angebot
-- steht der BKS-Sachbearbeiter, und der muss pro Dokument aus der
-- Mitarbeiterliste wählbar sein.
--
-- Neu: ansprechpartner_employee_id als FK → employees.id. Die alten
-- Freitext-Spalten bleiben als Snapshot erhalten, damit historische
-- Rechnungen stabil bleiben, auch wenn der Mitarbeiter später
-- ausscheidet oder seine Telefonnummer ändert.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ansprechpartner_employee_id UUID
  REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_ansprechpartner_employee
  ON public.invoices(ansprechpartner_employee_id);

COMMENT ON COLUMN public.invoices.ansprechpartner_employee_id IS
  'Referenz auf employees.id — der auf diesem Dokument ausgewiesene BKS-Sachbearbeiter. Name/Telefon/E-Mail werden beim Speichern als Snapshot in ansprechpartner_name/_telefon/_email abgelegt, damit alte Dokumente stabil bleiben.';
