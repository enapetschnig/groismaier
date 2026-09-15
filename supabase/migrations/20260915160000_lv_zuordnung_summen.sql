-- ============================================================================
--  Meldungen 15.09.2026 (LV "625.001 Ausschreibungs LV H38 Holzbau"):
--  1) nach "Preise aus Kalkulation" blieben einzelne Positionen leer
--  2) Summenaufstellung am Ende des LVs leer
-- ============================================================================
-- Keine Datenaenderung: Die von Hand nachgetragenen Preise (5.3.2, 5.3.3,
-- 6.3, 6.4) bleiben stehen; "Preise aus Kalkulation" schreibt sie beim
-- naechsten Lauf aus der Kalkulation neu.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Gefunden und behoben. Ursache: Du hast in der Kalkulation Aufbauten geklont und umbenannt (5.3.1 -> 5.3.2 und 5.3.3, 6.2 -> 6.3 und 6.4). Die Kopie trug aber unsichtbar noch den Verweis auf die Original-Position. "Preise aus Kalkulation" schrieb deshalb dreimal auf 5.3.1 bzw. 6.2 - die anderen blieben leer. Jetzt entscheidet die Positionsnummer am Anfang des Aufbau-Namens ("5.3.2 Massivstiege ..."), also genau das, was du siehst. Eine Kopie bekommt keinen Verweis mehr mit. Zwei Aufbauten mit derselben Nummer werden fuer diese Position zusammengezaehlt (Einheitspreis = Summe geteilt durch LV-Menge). Aufbauten, deren Name mit keiner Positionsnummer beginnt, werden bei der Uebernahme namentlich gemeldet statt still uebergangen. Deine von Hand eingetragenen Werte bleiben stehen; wenn du "Preise aus Kalkulation" nochmal drueckst, kommen alle 21 Positionen aus der Kalkulation.'
WHERE id::text LIKE 'ac69aa58%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. Die drei Zeilen "Angebotspreis netto", "zuzueglich 20% MwSt." und "Angebotspreis brutto" stammen aus der Excel-Datei des Planers und wurden beim Einlesen als Vertragstext (Positionen 22-24) uebernommen - deshalb standen sie ohne Zahl da. Jetzt zeigen genau diese Zeilen die Werte aus den bepreisten Normalpositionen (netto, 20 % MwSt., brutto), auch im Ausdruck. Beim naechsten Excel-Import werden solche Summenzeilen gar nicht mehr als Positionen uebernommen; stattdessen steht am Ende jedes LVs eine Summenaufstellung. Wahl- und Eventualpositionen zaehlen wie bisher nicht mit; sind Positionen noch offen, steht das dabei.'
WHERE id::text LIKE '686947fd%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Ausschreibung: Preise landen auf der richtigen Position',
   'Bei "Preise aus Kalkulation" zaehlt jetzt die Positionsnummer am Anfang des Aufbau-Namens. Geklonte und umbenannte Aufbauten (5.3.1 -> 5.3.2) treffen damit ihre eigene Position; Aufbauten ohne Nummer werden gemeldet.'),
  ('Ausschreibung: Summenaufstellung am Ende',
   'Jedes LV endet mit Angebotspreis netto, 20 % MwSt. und brutto. Summenzeilen aus einer Excel-Datei zeigen die Werte, neue Importe lassen sie als Positionen weg.');
