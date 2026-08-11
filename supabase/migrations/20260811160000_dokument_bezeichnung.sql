-- Frei änderbare Dokument-Bezeichnung (Kundenwunsch): statt des fixen
-- „Rechnung" soll am Dokument z. B. „Teilrechnung", „Honorarnote" oder
-- „Schlussrechnung Bauabschnitt 2" stehen können. Leer = Standard-Bezeichnung
-- des Belegtyps (documentTypes.label).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS dokument_bezeichnung text;
