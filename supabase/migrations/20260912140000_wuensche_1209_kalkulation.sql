-- ============================================================================
--  Aenderungswuensche 11./12.09.2026 (Kalkulation) abschliessen
-- ============================================================================
-- Keine Belegdaten und keine Kalkulationsdaten werden angefasst - alle vier
-- Punkte sind im Code behoben bzw. gebaut.

-- Angebotssumme vs. Projektsumme (dringend, "das Anbot muss raus")
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Beide Zahlen stimmen - und ich verstehe den Schreck. Die 16.199,56 Euro Unterschied sind exakt die drei Aufbauten, die du in dieser Kalkulation als OPTIONAL gekennzeichnet hast: Geruestmiete ab der 5. Woche (260 Euro), Terrassenbelag Laerche (5.292,56 Euro) und Eigenleistungen als Preisminderung (10.647 Euro). Optionale Positionen stehen im Angebot, zaehlen aber - so wie am 09.09. vereinbart - nicht in die Endsumme ("Die Positionen mit OPTIONAL davor sind nicht in der Endsumme eingerechnet"). Das Angebot A-2026-036 mit 131.327,23 Euro ist also richtig: Alle 111 Positionen sind drin, keine fehlt, keine ist falsch gerechnet - ich habe jede einzelne nachgezaehlt. Was nicht gepasst hat: Die Kalkulation zeigte oben rechts die Summe INKLUSIVE der optionalen Aufbauten, ohne das dazuzusagen; nur rechts in der Auswertung stand "Gesamt / Optional / ohne Optional". Jetzt steht oben rechts die Angebotssumme (ohne optional) - genau die Zahl, die im Angebot landet - und darunter "+ optional ... = ... gesamt". Auch die Summe in der Kalkulationsuebersicht ist ab dem naechsten Speichern die Angebotssumme. Sollen Terrassenbelag oder Geruestmiete doch mitzaehlen: beim Aufbau den Haken "optional" wegnehmen und im Angebot "Positionen neu uebernehmen" druecken.'
WHERE id::text LIKE '9ebb8052%';

-- KVH: kalkulierter VK aus dem Rechner erschien nicht
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Gefunden. Bei einer Riegelkonstruktions-Zeile wurde der Verkaufspreis immer aus EK x Aufschlag gerechnet. Ein mit dem Rechner kalkulierter VK kam zwar in den Artikel und von dort in die Zeile - die Riegel-Rechnung hat ihn aber ignoriert. Jetzt gilt: Steht am Artikel ein kalkulierter Verkaufspreis je m3, rechnet die Riegel-Zeile damit (3,5 lfm/m2 x Brettdicke x Wanddicke x diesem VK), und die blaue Erklaerzeile darunter sagt "aus Artikel-Kalkulation". Aenderst du den VK im Artikel, zieht die Zeile nach - solange du sie nicht von Hand ueberschrieben hast. Bei deiner KVH-Zeile: einmal den Artikel neu auswaehlen oder die Kalkulation neu oeffnen, dann holt sie sich den kalkulierten Preis.'
WHERE id::text LIKE 'ea7c2bf1%';

-- Daemmstoff: Preis je m2 wurde mit der Daemmstaerke umgerechnet
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Verstanden. Daemmstoff-Zeilen rechnen fest "Preis je m3 x Daemmstaerke", weil Daemmstoffe im Katalog je m3 stehen - fuer einen selbst gerechneten Preis je m2 gab es keinen Weg daran vorbei. Jetzt steht unter jeder Daemmstoff-Zeile der Schalter "Preis gilt je m2": drueckst du ihn, wird nicht mehr mit der Daemmstaerke umgerechnet, der Preis geht so wie eingetragen x Flaeche. Zurueck geht es mit "je m3 rechnen". Die Einstellung bleibt an der Zeile gespeichert. Fuer deine Trittschalldaemmung 20 mm im Fussbodenaufbau: Schalter druecken, 6,80 / 9,18 gelten dann je m2.'
WHERE id::text LIKE 'af72d61d%';

-- Arbeitszeit je Arbeitsgang
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Eingebaut. Unter "Arbeitszeit" gibt es jetzt "Arbeitsgaenge": je Zeile Stunden, Mann und Text - zum Beispiel 2,5 Std x 2 Mann Abbruch, 8 Std x 4 Mann Riegelbau, 6 Std x 3,5 Mann Aussenhuelle schliessen. Die Kalkulation rechnet dann mit der Summe der Stunden (Std x Mann je Zeile) statt mit Arbeiter x Tage; die Gesamtstunden stehen darunter, und im Rechenweg siehst du jede Zeile einzeln. Laesst du die Arbeitsgaenge leer, gilt weiter Arbeiter x Tage - an bestehenden Kalkulationen aendert sich nichts. Im Angebot steht die Arbeitszeit wie bisher als eine Zeile mit den Gesamtstunden.'
WHERE id::text LIKE '184d3b82%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Kalkulation: oben rechts steht jetzt die Angebotssumme',
   'Die grosse Zahl in der Kalkulation ist jetzt die Summe OHNE optionale Aufbauten - genau der Betrag, der im Angebot als Endsumme landet. Darunter steht, wie viel optional dazukommt und was das gesamt ergibt. Vorher stand oben die Summe inklusive optional, und das Angebot wirkte falsch, obwohl es stimmte.'),
  ('Kalkulation: Arbeitsgaenge, Daemmstoff je m2, kalkulierter Riegel-VK',
   'Unter Arbeitszeit lassen sich jetzt Arbeitsgaenge eintragen (Stunden x Mann x Text) - der Aufbau rechnet mit der Stundensumme. Daemmstoff-Zeilen haben einen Schalter "Preis gilt je m2", der die Umrechnung ueber die Daemmstaerke abschaltet. Und ein mit dem Rechner kalkulierter Verkaufspreis am Artikel zaehlt jetzt auch in Riegelkonstruktions-Zeilen.');
