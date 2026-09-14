-- ============================================================================
--  Frage 14.09.2026 (Knapp - Japons, Holzwolle): "Wie sieht der Vorgang im
--  Hintergrund aus? ... steht ja dabei, dass er nicht ueber m2 rechnet"
-- ============================================================================
-- Keine Datenaenderung - nur die Antwort und der Hinweis auf die klarere
-- Beschriftung an der Daemmstoff-Zeile.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Ja, das ist bei allen Daemmstoff-Zeilen gleich und die gewaehlte Daemmstaerke zaehlt immer mit. So rechnet die App: Jede Zeile mit Kategorie "Daemmstoffe" nimmt den VK als Preis je m3 und multipliziert ihn mit der Daemmstaerke des Aufbaus in Metern. Bei deiner Holzwolle: 141,75 Euro/m3 x 0,16 m (16 cm) = 22,68 Euro/m2. Das mal 107 m2 Flaeche ergibt den Betrag der Zeile. Aenderst du die Daemmstaerke oben im Aufbau, rechnet die Zeile sofort neu; bei 10 cm waeren es 14,18 Euro/m2, bei 24 cm 34,02. Der EK wird genauso umgerechnet (105 x 0,16 = 16,80 Euro/m2). Der Aufschlag steckt schon im VK aus dem Katalog; ist kein VK eingetragen, nimmt die App EK x Faktor. Der Satz "Preis gilt je m2" war kein Hinweis, sondern ein Knopf: Er schaltet die Zeile um, falls du einen Preis schon selbst je m2 gerechnet hast - dann wird NICHT mehr mit der Daemmstaerke multipliziert. Damit das nicht mehr missverstanden wird, steht unter der Zeile jetzt die ganze Rechnung mit Zahlen ("141,75 Euro/m3 x 0,16 m = 22,68 Euro/m2 x 107 m2"), und der Knopf heisst "Umschalten auf Preis je m2". Eins zum Pruefen bei dir: Der Artikel "Stroh inkl Einblasen" steht im Katalog mit Einheit "kg" (EK 183 / VK 248). Die Kalkulation rechnet ihn trotzdem als m3-Preis x Daemmstaerke und zeigt darunter eine gelbe Warnung. Gilt der Preis je m3, stell in den Stammdaten die Einheit auf m3 - dann ist die Warnung weg. Und "Zellulose" hat im Katalog EK 0,50 / VK 13,50 je m3 - das schaut nach einem Tippfehler aus.'
WHERE id::text LIKE 'a590f30b%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Kalkulation: Daemmstoff-Rechnung steht komplett dabei',
   'Unter jeder Daemmstoff-Zeile steht jetzt die ganze Rechnung mit Zahlen (Preis je m3 x Daemmstaerke in m = Preis je m2 x Flaeche). Der Umschalter fuer selbst gerechnete m2-Preise heisst jetzt "Umschalten auf Preis je m2".');
