-- Kalkulation "Knapp - Japons/Allgemein" ins Bauvorhaben Knapp holen
-- (gemeldeter Wunsch 26.08.2026, 13:25). Sie hatte keinen Kunden und lag
-- deshalb im Ordner "Ohne Kunde"; die Ordner richten sich nach dem Kunden.
--
-- Der Kunde wird aus den Geschwister-Kalkulationen desselben Bauvorhabens
-- uebernommen - so trifft es sicher denselben Datensatz, ohne Namensraten.
UPDATE public.kalkulationen
   SET customer_id = (
         SELECT customer_id
           FROM public.kalkulationen
          WHERE name LIKE 'Knapp - Japons%'
            AND customer_id IS NOT NULL
          LIMIT 1)
 WHERE name = 'Knapp - Japons/Allgemein'
   AND customer_id IS NULL;

-- Meldung abschliessen
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Erledigt: "Knapp - Japons/Allgemein" liegt jetzt im Bauvorhaben Knapp. Damit du das kuenftig selbst kannst, gibt es bei jeder Kalkulation im Menue (drei Punkte) den Eintrag "Bauvorhaben aendern".'
 WHERE id = 'f2716861-0000-0000-0000-000000000000'
    OR (seite = '/auftragskalkulation' AND status = 'neu' AND text LIKE '%uebersiedeln%');

-- Der Funktionstest-Eintrag aus der Einrichtung kann weg.
DELETE FROM public.aenderungswuensche WHERE text LIKE '\_\_Funktionstest%';

-- Neuerung fuer die Startseite
INSERT INTO public.neuerungen (titel, text) VALUES
  ('Kalkulation ins richtige Bauvorhaben schieben',
   'Im Menue einer Kalkulation (drei Punkte) gibt es jetzt "Bauvorhaben aendern" - damit wandert sie in den Ordner des gewaehlten Kunden. "Knapp - Japons/Allgemein" ist bereits verschoben.');
