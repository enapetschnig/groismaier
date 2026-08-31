-- Meldung f307fadf (31.08.): "Ich hab unabsichtlich zu weit unten zwei neue
-- Kategorien angelegt. Kannst du die nach oben schieben zu den anderen
-- Artikeln wie Holz?"
--
-- Befund: "Arbeitszeit" und "Fuhrpark" (beide am 31.08. angelegt) stehen mit
-- typ='lack' im Bereich Oberflaechenbeschichtung - deshalb erscheinen sie
-- ganz unten. Sie gehoeren als Material-Kategorien in den Aufbau-Block,
-- hinter die bestehenden (Folien ... Gruendachaufbau, sort 10-120).
UPDATE public.kalkulation_kategorien
   SET typ = 'material', sort = 130
 WHERE id = 'e9a70b7a-0000-0000-0000-000000000000'::uuid OR (id::text LIKE 'e9a70b7a%' AND name = 'Arbeitszeit');

UPDATE public.kalkulation_kategorien
   SET typ = 'material', sort = 140
 WHERE id::text LIKE '09512ab1%' AND name = 'Fuhrpark';

-- Meldung abschliessen
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Erledigt: "Arbeitszeit" und "Fuhrpark" waren versehentlich im Bereich Oberflaeche/Lack gelandet - deshalb standen sie ganz unten. Sie sind jetzt Material-Kategorien und stehen im Aufbau-Block bei Holz und Co. Die Artikel darin sind unveraendert.'
 WHERE id::text LIKE 'f307fadf%';
