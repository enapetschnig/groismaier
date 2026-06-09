-- ============================================================
-- Nummernkreise aufräumen (Holzbau Lutz)
-- Entfernte Module: Bautagesbericht, Ersttermin, Besprechungsprotokoll
-- → deren Nummernkreise werden gelöscht.
-- Anzahlungs-/Schlussrechnung teilen sich den 'rechnung'-Nummernkreis
-- (siehe next_document_number) → ihre eigenen Zeilen werden nie gelesen
-- und entfallen, damit alle Rechnungen lückenlos fortlaufend bleiben.
-- ============================================================
DELETE FROM public.number_ranges
 WHERE typ IN (
   'bautagesbericht',
   'besprechungsprotokoll',
   'ersttermin',
   'anzahlungsrechnung',
   'schlussrechnung'
 );
