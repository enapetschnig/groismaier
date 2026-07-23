-- ============================================================================
-- Beleg-Texte (Vortext/Schlusstext) pro Dokument + Lieferadresse
--
-- KingBill-Umbau des Beleg-Editors: die Unter-Tabs „Vortext" und „Schlusstext"
-- sollen den Standardtext (aus document_texts) vorbefüllt zeigen, aber pro
-- Beleg editierbar sein. pdfGenerator.ts und invoiceHtml.ts lesen bereits die
-- Override-Felder custom_intro_text / custom_closing_text — bisher wurden sie
-- nur flüchtig vom documentTextsLoader gesetzt, jetzt werden sie pro Beleg
-- gespeichert (leer = Standardtext des Dokumenttyps greift).
--
-- lieferadresse: KingBill-Kundenschritt hat ein Lieferadress-Feld (abweichende
-- Lieferanschrift). Nullable — leer heißt „gleich Rechnungsadresse".
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS custom_intro_text   TEXT,
  ADD COLUMN IF NOT EXISTS custom_closing_text TEXT,
  ADD COLUMN IF NOT EXISTS lieferadresse       TEXT;

COMMENT ON COLUMN public.invoices.custom_intro_text IS
  'Beleg-eigener Vortext (überschreibt den Standard aus document_texts.intro). Leer = Standardtext des Dokumenttyps.';
COMMENT ON COLUMN public.invoices.custom_closing_text IS
  'Beleg-eigener Schlusstext (überschreibt den Standard aus document_texts.closing). Leer = Standardtext des Dokumenttyps.';
COMMENT ON COLUMN public.invoices.lieferadresse IS
  'Abweichende Lieferadresse (Freitext). Leer = identisch mit der Rechnungsadresse.';
