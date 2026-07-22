-- ============================================================================
-- Angebotspositionen: Gruppen (Aufbauten/Kapitel) + Sichtbarkeit je Position
--
-- Kundenwunsch: "Ich will im Angebot sehen, woraus der Aufbau besteht, und
-- einstellen können, was der Kunde davon sieht. Die Kategorie sieht er immer,
-- die Positionen soll ich ein-/ausschalten können."
--
-- Modell:
--   gruppe            = Name des Aufbaus/Kapitels (z. B. "Aufbau 1 — Dach").
--                       Alle Zeilen einer Gruppe stehen im Beleg zusammen.
--   ist_gruppensumme  = die preistragende Sammelzeile der Gruppe. Sie zeigt
--                       den Betrag, den der Kunde zahlt (immer sichtbar).
--   auf_pdf           = erscheint die Zeile im Kundendokument (PDF/Vorschau)?
--                       Detailzeilen stehen defaultmäßig auf false: der Chef
--                       sieht sie im Editor, der Kunde nicht — per Schalter
--                       jederzeit einblendbar.
--
-- Detailzeilen tragen KEINEN eigenen Betrag in der Belegsumme (gesamtpreis 0),
-- damit nichts doppelt gezählt wird; ihr interner Wert steht in ek_preis.
-- ============================================================================

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS gruppe TEXT,
  ADD COLUMN IF NOT EXISTS auf_pdf BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ist_gruppensumme BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoice_items.gruppe IS
  'Kapitel/Aufbau-Name zur Gruppierung im Beleg. NULL = ungruppierte Position.';
COMMENT ON COLUMN public.invoice_items.auf_pdf IS
  'Erscheint diese Zeile im Kundendokument? Detailzeilen aus der Kalkulation stehen auf false.';
COMMENT ON COLUMN public.invoice_items.ist_gruppensumme IS
  'Preistragende Sammelzeile einer Gruppe (zeigt den Betrag, den der Kunde zahlt).';

CREATE INDEX IF NOT EXISTS idx_invoice_items_gruppe
  ON public.invoice_items(invoice_id, gruppe);
