-- Projektbereiche im Beleg (Kundenwunsch 24.08.2026): Positionen eines
-- Sammelangebots tragen den Namen ihrer Quell-Kalkulation. Das PDF gruppiert
-- damit je Bereich (fette Ueberschrift, Zwischensumme, neue Seite) und die
-- Zwischensummen werden zur Druckzeit aus den Positionen gerechnet - sie
-- koennen nie veralten.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS bereich text;
