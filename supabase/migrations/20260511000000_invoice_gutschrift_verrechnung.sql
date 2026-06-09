-- ============================================================
-- Gutschriften: Verrechnung mit Rechnung + sauberer Closing-Text
-- ============================================================
-- Bisher konnte eine Gutschrift zwar angelegt, aber nicht abgeschlossen
-- werden — der Status "verrechnet" wurde nur automatisch im Anzahlungs-/
-- Schlussrechnungs-Pfad gesetzt. Diese Migration ergänzt zwei nullable
-- Audit-Spalten, mit denen UI/Code eine Gutschrift als verrechnet
-- markieren und optional eine konkrete Rechnung referenzieren kann.
--
-- Zusätzlich: document_texts.gutschrift.closing bekommt einen eigenen
-- Default-Text (statt des unpassenden Rechnungs-Schluss-Texts „Wir
-- bedanken uns für Ihren Auftrag und bitten um Überweisung …").

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS verrechnet_mit_invoice_id UUID,
  ADD COLUMN IF NOT EXISTS verrechnet_am DATE;

-- Selbstreferenzierender Foreign-Key — nullable, ON DELETE SET NULL,
-- damit das Löschen einer verrechneten Ziel-Rechnung den Verweis
-- aufräumt, ohne die Gutschrift mitzulöschen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoices_verrechnet_mit_invoice_id_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_verrechnet_mit_invoice_id_fkey
      FOREIGN KEY (verrechnet_mit_invoice_id)
      REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.invoices.verrechnet_mit_invoice_id IS
  'Bei Gutschriften (typ=gutschrift): optional die ID der Rechnung, gegen die diese Gutschrift verrechnet wurde. Wird beim "Als verrechnet markieren"-Workflow gesetzt; NULL, wenn die Gutschrift ausgezahlt statt verrechnet wurde.';
COMMENT ON COLUMN public.invoices.verrechnet_am IS
  'Datum der Verrechnung/Auszahlung einer Gutschrift. NULL solange die Gutschrift "offen" ist.';

-- Eigener Closing-Text für Gutschrift (idempotent — überschreibt nicht,
-- wenn der User bereits einen eigenen Text gepflegt hat).
INSERT INTO public.document_texts (typ, feld, sprache, inhalt)
VALUES (
  'gutschrift',
  'closing',
  'de',
  'Hiermit schreiben wir Ihnen den oben angeführten Betrag gut. Die Auszahlung erfolgt innerhalb von 14 Tagen auf Ihr bekanntes Bankkonto bzw. wird mit einer offenen Rechnung verrechnet.'
)
ON CONFLICT (typ, feld, sprache) DO NOTHING;
