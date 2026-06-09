-- ============================================================
-- Teilrechnung aus dem Dokumentsystem entfernen.
-- Neue Regel: Rechnungen aus einem Auftrag sind nur noch
-- Anzahlungsrechnung + Schlussrechnung. Die bisherige "Teilrechnung"
-- wird semantisch zur Anzahlungsrechnung verschmolzen (gleiche Wirkung:
-- wird bei Schlussrechnung automatisch abgezogen).
-- ============================================================

-- 1) Bestehende teilrechnung-Zeilen migrieren → anzahlungsrechnung.
--    Das kommt dem Sinn am nächsten: beides war eine Zwischenrechnung,
--    die in der Schlussrechnung abgezogen wurde.
UPDATE public.invoices
SET typ = 'anzahlungsrechnung'
WHERE typ = 'teilrechnung';

-- 2) CHECK-Constraint neu setzen ohne 'teilrechnung'
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_typ_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_typ_check
  CHECK (typ IN (
    'angebot',
    'auftragsbestaetigung',
    'rechnung',
    'anzahlungsrechnung',
    'schlussrechnung',
    'lieferschein',
    'gutschrift'
  ));

-- 3) Nummernkreis-Eintrag entfernen (falls nie benutzt)
DELETE FROM public.number_ranges WHERE typ = 'teilrechnung';

-- 4) app_settings-Werte für teilrechnung entfernen
DELETE FROM public.app_settings WHERE key LIKE 'teilrechnung\_%' ESCAPE '\';

-- 5) document_texts für teilrechnung entfernen
DELETE FROM public.document_texts WHERE typ = 'teilrechnung';
