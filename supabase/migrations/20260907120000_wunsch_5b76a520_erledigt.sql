-- Meldung 5b76a520 ("Alle im Angebot zeigen" deaktivieren) auf Anweisung
-- von Christoph (07.09.2026) auf umgesetzt setzen.
UPDATE public.aenderungswuensche SET status = 'umgesetzt'
WHERE id::text LIKE '5b76a520%';
