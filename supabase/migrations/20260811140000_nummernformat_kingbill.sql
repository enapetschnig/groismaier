-- ============================================================================
-- Nummernformat wie in KingBill (Kundenwunsch): „die letzte Rechnungsnummer
-- ist 2026-042, ab jetzt geht es mit 043 weiter."
--
--   Rechnung:  2026-043, 2026-044, …      (nahtlos nach dem Import)
--   Angebot:   A-2026-034, …              (nahtlos nach Import A-2026-033;
--                                          das A- hält den UNIQUE-Nummernkreis
--                                          von den Rechnungen getrennt)
--   AB/GS/LS:  AB-…, GS-…, LS- im selben Stil
--
-- Zähler auf die höchste importierte Laufnummer gestellt; die Eindeutigkeits-
-- Schleife in next_document_number überspringt Kollisionen ohnehin.
-- ============================================================================
UPDATE public.number_ranges SET format_pattern = '{YYYY}-{NNN}', prefix = '', aktuelle_nummer = GREATEST(aktuelle_nummer, 42) WHERE typ = 'rechnung';
UPDATE public.number_ranges SET format_pattern = '{PREFIX}{YYYY}-{NNN}', prefix = 'A-', aktuelle_nummer = GREATEST(aktuelle_nummer, 33) WHERE typ = 'angebot';
UPDATE public.number_ranges SET format_pattern = '{PREFIX}{YYYY}-{NNN}', prefix = 'AB-' WHERE typ = 'auftragsbestaetigung';
UPDATE public.number_ranges SET format_pattern = '{PREFIX}{YYYY}-{NNN}', prefix = 'GS-' WHERE typ = 'gutschrift';
UPDATE public.number_ranges SET format_pattern = '{PREFIX}{YYYY}-{NNN}', prefix = 'LS-' WHERE typ = 'lieferschein';
