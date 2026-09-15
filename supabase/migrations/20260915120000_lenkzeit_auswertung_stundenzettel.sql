-- ============================================================================
--  Meldung 15.09.2026: Fahrzeiten fehlen in der Stundenauswertung; Lenkzeit-
--  Saetze laut KV muessen anpassbar sein. Dazu (Christoph): Zeitausgleich
--  wurde im Excel dazugerechnet, aber nirgends abgezogen.
-- ============================================================================
-- Keine Datenaenderung an Buchungen oder Belegen. Die Lenkzeit-Saetze bleiben
-- auf 0, bis der Betrieb den KV-Satz eintraegt (Admin > Einstellungen).

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt - drei Dinge waren los. 1) Es gab noch keine einzige Buchung mit Fahrzeit: Eine Lenkzeit entsteht nur, wenn beim Projekt "Fahrzeit einfach" mindestens 25 Minuten steht UND bei der Buchung "Fahrer" oder "Beifahrer" angehakt ist. Fahrzeit ist bisher nur bei Brueckenhaus Tullnerbach (90 min) und Goettinger (27 min) eingetragen - bei den anderen Projekten bitte nachtragen, sonst zeigt die Zeiterfassung die Kaestchen nicht. 2) Die Lenkzeit-Auswertung hing im Tab "Kostenstellen" und verschwand ganz, wenn nichts gebucht war. Jetzt steht sie im Tab "Arbeitszeit" unter der Mitarbeitertabelle, immer sichtbar, und erklaert, was fehlt. Zusaetzlich hat jede Buchung eine eigene Spalte "Lenkzeit" (z. B. "1:30 h Fahrer - 18,00 EUR"), oben eine Kachel mit der Monatssumme, und der Excel-Export hat wie der alte Stundenzettel die Spalten "Lenkzeit Fahrer EUR" und "Lenkzeit Beifahrer EUR" je Tag plus Summe. Nachtragen geht ueber "Eintrag bearbeiten" - dort gibt es jetzt auch Fahrer/Beifahrer. 3) Die EUR je Stunde: Neu unter Admin > Einstellungen > "Lenkzeitvergütung" - Satz Fahrer, Satz Beifahrer und ab wie vielen Minuten je Strecke vergütet wird. Das ist der betriebliche Standard laut KV; bei einer Erhoehung dort aendern, ab dann rechnen Auswertung und Excel neu. Fuer einzelne Personen kann man unter Stammdaten/Personal weiterhin einen eigenen Satz eintragen, der dann vorgeht. Derzeit stehen beide Saetze auf 0 - bitte den KV-Satz eintragen, sonst bleibt jede Lenkzeit bei 0,00 EUR. Ausserdem, weil es zusammenhaengt: Der Excel-Bericht rechnete einen Zeitausgleich-Tag bisher neutral - die 7,8 h standen in der Summe, wurden aber nirgends abgezogen. Jetzt steht beim ZA-Tag "-7,80 ZA" in der Ueberstunden-Spalte, und unten steht wie am alten Zettel: Soll / Ist / Differenz, ZA-Konto vor dem Monat, + Ueberstunden, - Zeitausgleich verbraucht, = ZA-Konto nach dem Monat, dazu die Lenkzeitvergütung und - falls vorhanden - Werktage ohne Buchung. Bildschirm, Excel und Monatsabschluss rechnen jetzt mit derselben Tagesregel.'
WHERE id::text LIKE 'fcf2c67f%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Lenkzeit in der Stundenauswertung und im Excel',
   'Die Lenkzeitvergütung steht jetzt im Tab "Arbeitszeit": je Buchung eine Spalte, oben die Monatssumme, darunter die Tabelle je Mitarbeiter (immer sichtbar, mit Hinweis, wenn nichts gebucht ist). Der Excel-Export hat die Spalten Lenkzeit Fahrer / Beifahrer in EUR wie der alte Stundenzettel. Fahrer/Beifahrer lassen sich auch beim Admin-Nachtrag setzen.'),
  ('Lenkzeit-Saetze laut KV in den Einstellungen',
   'Admin > Einstellungen > Lenkzeitvergütung: Satz Fahrer, Satz Beifahrer (EUR je Stunde) und die Minuten-Schwelle je Strecke. Gilt fuer alle ohne eigenen Satz unter Stammdaten/Personal. Bitte den KV-Satz eintragen - derzeit 0.'),
  ('Stundenzettel: Zeitausgleich wird abgezogen',
   'Bericht, Meine Stunden und Excel rechnen einen Zeitausgleich-Tag jetzt wie das Zeitkonto: -7,8 h, sichtbar als "ZA". Der Excel-Export endet wie der alte Zettel mit Soll/Ist/Differenz, ZA-Konto vorher, + Ueberstunden, - ZA verbraucht, = ZA-Konto nachher, Lenkzeitvergütung und Werktagen ohne Buchung.');
