-- ============================================================================
-- KingBill-Kopffelder für den Beleg-Editor (1:1-Angleichung an die Vorlage)
--
--   referenz          = Freitext „Referenz" im Allgemein-Kopf (z. B. Bestell-/
--                       Auftragsnummer des Kunden; erscheint im Dokument).
--   zeige_faelligkeit = Häkchen „Zeige Fälligkeit": steuert, ob die
--                       Fälligkeits-/Zahlbar-Zeile im PDF gedruckt wird.
--   preise_brutto     = Häkchen „Preise sind Brutto": Eingabepreise in der
--                       Artikelmaske werden als Brutto verstanden und beim
--                       Hinzufügen in Netto umgerechnet (die gesamte
--                       Summen-Pipeline bleibt netto-basiert).
--   zahlungstext      = Beleg-eigener Zahlungsbedingungen-TEXT (KingBill zeigt
--                       im Reiter „Zahlungsbedingungen" einen Textbaustein).
--                       Leer = Standardtext des Dokumenttyps.
--   kunde_kontaktperson = Kontaktperson des Kunden für diesen Beleg
--                       (KingBill-Kundenschritt, Feld „Kontaktperson").
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS referenz            TEXT,
  ADD COLUMN IF NOT EXISTS zeige_faelligkeit   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preise_brutto       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zahlungstext        TEXT,
  ADD COLUMN IF NOT EXISTS kunde_kontaktperson TEXT;

COMMENT ON COLUMN public.invoices.referenz IS
  'Freitext „Referenz" (KingBill-Allgemein-Kopf), z. B. Bestellnummer des Kunden.';
COMMENT ON COLUMN public.invoices.zeige_faelligkeit IS
  'Steuert, ob die Fälligkeitszeile im Kundendokument gedruckt wird (KingBill „Zeige Fälligkeit").';
COMMENT ON COLUMN public.invoices.preise_brutto IS
  'KingBill „Preise sind Brutto": Eingaben in der Artikelmaske sind Bruttopreise (werden zu Netto umgerechnet gespeichert).';
COMMENT ON COLUMN public.invoices.zahlungstext IS
  'Beleg-eigener Zahlungsbedingungen-Text. Leer = Standardtext des Dokumenttyps (document_texts).';
COMMENT ON COLUMN public.invoices.kunde_kontaktperson IS
  'Kontaktperson beim Kunden für diesen Beleg (KingBill-Kundenschritt).';
