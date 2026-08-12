-- ============================================================================
-- Belegarten der 2026er-Rechnungen richtig setzen (Kundenwunsch: „kannst du
-- bei den Rechnungen von heuer das so einbauen, wie es im System vorgesehen
-- ist — dass die Teilrechnungen usw. gespeichert sind").
--
-- Beim KingBill-Import landeten ALLE Rechnungen als typ='rechnung'; die Art
-- stand nur als Text im Betreff („3. Teilrechnung 2026-009"). Dadurch zeigte
-- die App überall „RE" und man konnte nicht nach Teil-/Schlussrechnungen
-- filtern.
--
-- Diese Migration trennt sauber:
--   typ                   = die Belegart des Systems
--   dokument_bezeichnung  = was am Dokument steht („3. Teilrechnung")
--   betreff               = frei fürs Bauvorhaben
--
-- WICHTIG: Es ändert sich KEIN Betrag. Anzahlungs- und Schlussrechnungen
-- zählen in Umsatz, offenen Posten und Auswertungen exakt wie Rechnungen
-- (PAYABLE_INVOICE_TYPES/INVOICE_LIKE_TYPES enthalten alle drei).
-- Stornobelege bleiben unangetastet (sie sind bereits status='storniert').
-- ============================================================================

-- 1. Bezeichnung aus dem Betreff lösen (alles vor der Belegnummer)
UPDATE public.invoices
   SET dokument_bezeichnung = btrim(regexp_replace(betreff, '\s*' || nummer || '\s*$', '')),
       betreff = ''
 WHERE jahr = 2026
   AND typ = 'rechnung'
   AND betreff ~ ('^.+ ' || nummer || '$');

-- 2. Teil-, Abschlags- und Anzahlungsrechnungen sind im System
--    „Anzahlungsrechnungen" (davon sind beliebig viele je Auftrag erlaubt)
UPDATE public.invoices
   SET typ = 'anzahlungsrechnung'
 WHERE jahr = 2026 AND typ = 'rechnung' AND status <> 'storniert'
   AND dokument_bezeichnung ~* '(Teilrechnung|Abschlagsrech|Anzahlung)';

-- 3. Schlussrechnungen
UPDATE public.invoices
   SET typ = 'schlussrechnung'
 WHERE jahr = 2026 AND typ = 'rechnung' AND status <> 'storniert'
   AND dokument_bezeichnung ~* 'Schlussrechnung';

-- 4. Wo die Bezeichnung nur „Rechnung" lautet, ist sie redundant zum Typ
UPDATE public.invoices
   SET dokument_bezeichnung = NULL
 WHERE jahr = 2026 AND dokument_bezeichnung = 'Rechnung';
