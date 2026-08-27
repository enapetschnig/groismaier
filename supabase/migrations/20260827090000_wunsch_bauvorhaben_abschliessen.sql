-- Meldung "Ordner ins Bauvorhaben Knapp uebersiedeln" abschliessen.
-- Der vorige Versuch traf nicht: die ID war geraten und der Textvergleich
-- suchte "uebersiedeln", im Text steht aber "uebersiedeln" mit Umlaut.
-- Jetzt ueber die tatsaechliche ID.
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Erledigt: "Knapp - Japons/Allgemein" liegt jetzt im Bauvorhaben Knapp. Kuenftig kannst du das selbst: im Menue einer Kalkulation (drei Punkte) gibt es den Eintrag "Bauvorhaben aendern".'
 WHERE id = 'f2716861-5606-417d-b695-7d449608ab96';

-- Kontrolle: Liegt die Kalkulation jetzt beim Kunden? (Sicherheitsnetz,
-- falls der vorige Lauf sie nicht erwischt hat.)
UPDATE public.kalkulationen
   SET customer_id = (
         SELECT customer_id FROM public.kalkulationen
          WHERE name LIKE 'Knapp - Japons%' AND customer_id IS NOT NULL LIMIT 1)
 WHERE name = 'Knapp - Japons/Allgemein' AND customer_id IS NULL;

SELECT k.name, c.name AS kunde
  FROM public.kalkulationen k
  LEFT JOIN public.customers c ON c.id = k.customer_id
 WHERE k.name LIKE 'Knapp - Japons%'
 ORDER BY k.name;
