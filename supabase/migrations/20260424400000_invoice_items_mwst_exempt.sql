-- ============================================================
-- invoice_items: MwSt-freie Zeilen (für Brutto-Abzüge in Schlussrechnungen)
-- ============================================================
-- Hintergrund: Bei einer Schlussrechnung werden bereits geleistete
-- Anzahlungen abgezogen. Österreichisches Rechnungsrecht verlangt, dass
-- die bereits ausgewiesene MwSt der Anzahlung nicht nochmal mit dem
-- MwSt-Satz der Schlussrechnung verrechnet wird. Daher werden solche
-- Abzugszeilen als BRUTTO-Betrag gespeichert und mit mwst_exempt=true
-- markiert, damit die Kalkulation sie nicht mehr per MwSt-Satz multipliziert.

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS mwst_exempt BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.invoice_items.mwst_exempt IS
  'Wenn true, ist gesamtpreis bereits brutto und wird bei der MwSt-Berechnung ausgenommen. Typisch für Anzahlungs-Abzüge in Schlussrechnungen.';

CREATE INDEX IF NOT EXISTS idx_invoice_items_mwst_exempt
  ON public.invoice_items(mwst_exempt)
  WHERE mwst_exempt = TRUE;
