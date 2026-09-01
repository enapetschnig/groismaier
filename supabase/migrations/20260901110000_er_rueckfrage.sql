-- Meldung dbcc135b (01.09.): "Meine Frau muss mir zu manchen
-- Eingangsrechnungen Fragen stellen, wenn sie nicht weiss, wo die hin zu
-- buchen sind - ein Knopf, dass ich die Rechnung vorgelegt bekomme und
-- auswaehlen kann, wie sie zu buchen ist (zB 2/3 Projekt, Rest Lager)."
--
-- Rueckfrage direkt AN der Eingangsrechnung - die Buchungs-Auswahl
-- (Aufteilen auf Projekte/Lager) existiert im Detail-Dialog ja schon.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS rueckfrage_text text,
  ADD COLUMN IF NOT EXISTS rueckfrage_von uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rueckfrage_am timestamptz,
  ADD COLUMN IF NOT EXISTS rueckfrage_erledigt_am timestamptz;
