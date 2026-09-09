-- ============================================================================
--  Regie-Block an den vorhandenen Angebots-Schlusstext anhaengen (09.09.2026)
-- ============================================================================
-- Die vorige Migration hat den Text bewusst NICHT ueberschrieben, weil schon
-- einer hinterlegt war ("Dieses Angebot ist 30 Tage gueltig ..."). Der Block
-- des Chefs gehoert aber ans Ende jedes Angebots - also wird er angehaengt,
-- der vorhandene Satz bleibt als Einleitung stehen.
--
-- Idempotent: Steht der Block schon drin (Platzhalter oder Ueberschrift),
-- passiert nichts. Keine Belegdaten werden angefasst.

INSERT INTO public.document_texts (typ, feld, sprache, inhalt)
VALUES ('angebot', 'closing', 'de', '')
ON CONFLICT (typ, feld, sprache) DO NOTHING;

UPDATE public.document_texts
   SET inhalt = btrim(coalesce(inhalt, '')) || CASE WHEN btrim(coalesce(inhalt,'')) = '' THEN '' ELSE E'\n\n' END ||
'Kosten für Regiearbeiten:

{{regiesaetze}}

Durch bauseitig beigestelltes Material und dadurch nötige Regiepositionen, halten wir uns das Recht auf Preiserhöhung bis max. 10 % der Gesamtsumme vor.

Die Regiepositionen werden nach tatsächlichem Aufwand abgerechnet. Regieaufzeichnungen werden zu den jeweiligen Rechnungen angefügt (spätestens aber bei der Schlussrechnung).

Die Positionen mit "OPTIONAL" davor sind nicht in der Endsumme eingerechnet.

Für Änderungen der Ausführung nach schriftlicher Beauftragung oder bei Ausführung später als 6 Monate nach der Angebotslegung behalten wir uns ein Recht auf Preisanpassung vor.

Alle Unterlagen (Einreichplan, Polierplan etc.), behördliche Genehmigungen bzw. persönliche Sonderwünsche bei der Ausführung müssen bis spätestens 6 Wochen vor Montagebeginn festgelegt sein. Jede Verzögerung in der Planung wirkt sich auf die Lieferzeit aus und kann nicht als Mangel geltend gemacht werden.

Die Abrechnung erfolgt in den angegebenen Positionseinheiten nach Fertigstellung der Leistung.

Nach schriftlicher Auftragserteilung werden 10 % der Gesamtsumme (nach Absprache) in Rechnung gestellt, als Anzahlung für Material.

Teilrechnungen werden nach Baufortschritt gestellt.


_________________________________________________________
                             Unterschrift Kunde',
       updated_at = now()
 WHERE typ = 'angebot' AND feld = 'closing' AND sprache = 'de'
   AND coalesce(inhalt, '') NOT LIKE '%regiesaetze%'
   AND coalesce(inhalt, '') NOT LIKE '%Kosten für Regiearbeiten%';
