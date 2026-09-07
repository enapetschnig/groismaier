-- Nachtrag zur Meldung 5b76a520 ("Alle im Angebot zeigen" laesst sich nicht deaktivieren):
-- auch am Produktivsystem mit echtem Chrome geprueft, Vorschau zusaetzlich gehaertet.
UPDATE public.aenderungswuensche SET antwort = antwort ||
  ' NACHTRAG: Auch direkt am Produktivsystem mit echtem Chrome geprueft (Fenster sichtbar, PDF-Vorschau gerendert) - Ein/Aus wirkt beide Male sofort in der Vorschau. Vorsichtshalber habe ich die Beleg-Vorschau so umgebaut, dass jedes neue PDF in einem frischen Vorschau-Rahmen geladen wird und die alte Datei erst spaeter freigegeben wird - damit kann der PDF-Viewer keinen alten Stand mehr weiterzeigen. Bitte nach dem naechsten Laden der App (Strg+F5) nochmal probieren und mir sagen, ob es noch auftritt.'
WHERE id::text LIKE '5b76a520%';
