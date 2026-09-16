-- Kundenwunsch 16.09.2026: Reiter mit den gesendeten Mails aus allen Konten.
-- Keine Datenaenderung.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. Neben Christian, Office und Buchhaltung gibt es jetzt den Reiter "Gesendet": Er zeigt die gesendeten Mails aus allen drei Konten gemischt nach Datum, je Zeile den Empfaenger ("An: ...") und ein kleines Kaestchen, aus welchem Konto sie ging. Klick oeffnet die Mail wie gewohnt - Antworten, Weiterleiten und Anhaenge gehen dann aus genau diesem Konto. Die Suche durchsucht im Reiter alle gesendeten Mails, "Aeltere Mails laden" holt je Konto die naechsten 25.'
WHERE id::text LIKE 'ac6090eb%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('E-Mail: Reiter "Gesendet" ueber alle Konten',
   'Im Mail-Bereich zeigt der neue Reiter "Gesendet" die gesendeten Mails aus Christian, Office und Buchhaltung gemischt nach Datum, mit Empfaenger und Konto. Suche und "Aeltere laden" funktionieren dort ebenso.');
