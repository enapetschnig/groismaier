-- Meldung 81a0a913 (31.08.): "Wenn ich eine Kalkulation fuer einen Kunden
-- anlege, der noch nicht in der Datenbank ist - wie bekomme ich eine
-- Kundenbezeichnung als Ordnernamen da rein?"
--
-- Freies Bauvorhaben-Feld an der Kalkulation: Es benennt den Ordner in der
-- Uebersicht, solange kein Kunde zugeordnet ist. Wird spaeter ein Kunde
-- gesetzt ("Bauvorhaben aendern"), gewinnt dessen Name.
ALTER TABLE public.kalkulationen
  ADD COLUMN IF NOT EXISTS bauvorhaben text;
