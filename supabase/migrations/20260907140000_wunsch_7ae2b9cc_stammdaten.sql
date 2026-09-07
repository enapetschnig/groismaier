-- Aenderungswunsch 07.09.2026 (7ae2b9cc): Stammdaten - Kategorien verschieben
-- und zuklappen. Keine Belegdaten werden angefasst.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt, beides: In Kalkulation > Einstellungen sind die Kategorien jetzt standardmaessig zugeklappt (Pfeil links am Kopf, daneben die Artikelanzahl) - erst nach dem Aufklappen siehst du die Artikel. "+ Artikel" klappt die Kategorie automatisch auf. Rechts im Kopf gibt es Pfeile nach oben/unten, mit denen du eine ganze Kategorie in der Reihenfolge verschiebst. Die Reihenfolge gilt ueberall: in den Stammdaten, in der Kategorie-Auswahl der Kalkulation und im Filter.'
WHERE id::text LIKE '7ae2b9cc%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Stammdaten: Kategorien zuklappen und verschieben',
   'In Kalkulation > Einstellungen sind die Kategorien zugeklappt (Artikel erst nach dem Aufklappen) und lassen sich mit Pfeilen in der Reihenfolge verschieben.');
