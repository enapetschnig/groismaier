-- ============================================================================
--  Aenderungswuensche vom 06.09.2026 abschliessen
-- ============================================================================
-- Keine Belegdaten werden angefasst.

-- Kapitel je Aufbau in der Kalkulation (umgesetzt)
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: In der Kalkulation hat jeder Aufbau jetzt das Feld "Kapitel im Angebot" (unter der Notiz). Aufbauten mit gleichem Kapitel stehen im Angebot unter einer gemeinsamen Ueberschrift "Bereich: <Kapitel>" mit Zwischensumme - genau wie bei den zusammengefassten Kalkulationen beim Angebot Knapp. Beim Tippen werden bereits vergebene Kapitel vorgeschlagen. Aufbauten ohne Kapitel stehen im Angebot vor dem ersten Kapitel. Die Kapitel sind in der Projektuebersicht als kleines Etikett sichtbar. Wird eine Kalkulation mit Kapiteln spaeter mit anderen zu einem Gesamtangebot zusammengefasst, bleibt die Kalkulation der Bereich und das Kapitel wird darunter als fette Textzeile gedruckt. Bei einem bestehenden Angebot: "Positionen neu uebernehmen" holt die Kapitel nach.'
WHERE id::text LIKE '2cb75640%';

-- "Alle im Angebot zeigen" laesst sich nicht deaktivieren (nicht nachstellbar)
UPDATE public.aenderungswuensche SET status = 'gesehen', antwort =
  'Nicht nachstellbar - bitte kurze Rueckmeldung. Ich habe es automatisiert im Browser geprueft, sowohl am gespeicherten Angebot A-2026-039 als auch an einem neuen, ungespeicherten Angebot aus der Kalkulation: Schalter am Aufbau EIN -> die Unterpositionen stehen im PDF; AUS -> sie sind weg. Knopf oben "Alle im Angebot zeigen" EIN -> alle drin; danach heisst er "Unterpositionen ausblenden", Klick -> alle weg (PDF-Text geprueft, Zaehler "0 davon im Angebot sichtbar"). Dabei wurde nichts gespeichert. Bitte sag mir: (1) Welchen Schalter meinst du - den Knopf oben oder den Schalter am Aufbau? (2) Wo bleiben die Zeilen stehen: in der Beleg-Vorschau rechts, im gedruckten/gesendeten PDF oder in der Positionsliste? Hinweis: In der Positionsliste bleiben die Zeilen immer stehen (mit "nur intern"), nur der Kunde sieht sie nicht. Tipp: Haengt die Vorschau, einmal das Aktualisieren-Symbol in der Vorschau-Kopfzeile druecken oder die Seite mit Strg+F5 neu laden, damit sicher die neueste Version laeuft.'
WHERE id::text LIKE '5b76a520%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Kalkulation: Kapitel je Aufbau',
   'Jeder Aufbau hat das Feld "Kapitel im Angebot". Gleiches Kapitel = gemeinsame Ueberschrift mit Zwischensumme im Angebot, wie bei zusammengefassten Kalkulationen.');
