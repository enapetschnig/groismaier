-- ============================================================================
--  Aenderungswuensche 09.09.2026 abschliessen
-- ============================================================================
-- Keine Belegdaten werden angefasst.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Gefunden: Der Bericht vom 07.09. (Schindelboeck, Fensterleisten montieren) war als "verrechnet" markiert, aber keiner Rechnung zugeordnet - vermutlich per Haken "Als verrechnet markieren". Der Knopf "Rechnung erstellen" wurde bisher nur angezeigt, solange der Bericht NICHT als verrechnet markiert war, deshalb kamst du nicht weiter. Behoben: Der Knopf ist jetzt immer da; ist der Bericht bereits verrechnet, steht das als Hinweis darunter (mit Link zur Rechnung, falls es eine gibt). Ist er als verrechnet markiert OHNE Rechnung, weist die Seite ausdruecklich darauf hin - du kannst ihn dann trotzdem uebernehmen oder den Haken wieder entfernen. An deinen Daten habe ich nichts geaendert; oeffne den Bericht einfach und druecke "Rechnung erstellen".'
WHERE id::text LIKE 'ce35263b%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Dein Verdacht war goldrichtig - es lag an den Regieberichten. Nachgemessen am Goettinger-Beleg: Das Sammel-PDF der 25 Berichte war 120,55 MB gross, die ganze Mail 161 MB. Ursache: Die Fotos gingen seit dem 02.09. in voller Handy-Aufloesung ins PDF, obwohl sie darin nur etwa 8 cm breit gedruckt werden. Behoben: (1) Fotos werden jetzt vor dem Einbetten auf Druckgroesse gerechnet - aus 120,55 MB wurden 6,13 MB, ein einzelner Bericht wiegt 0,32 MB. Die Bildqualitaet im Bericht bleibt gut. (2) Grosse Anhaenge nimmt der Mailversand jetzt ueber den offiziellen Weg von Microsoft (Upload-Session) - vorher war bei etwa 3 MB Schluss, daher die Fehlermeldung. (3) Sollte ein Anhang trotzdem zu gross sein, sagt die App klar, welcher es ist, wie gross und was zu tun ist. Getestet: Die Rechnung mit allen 25 Berichten (8,6 MB) ist als Testmail erfolgreich rausgegangen.'
WHERE id::text LIKE '9fdb14d3%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Regieberichte per Mail: Fotos kleiner, grosse Anhaenge moeglich',
   'Die Fotos im Regiebericht-PDF werden auf Druckgroesse gerechnet - ein Sammel-PDF aus 25 Berichten wiegt statt 120 MB nur noch gut 6 MB. Grosse Anhaenge gehen jetzt zuverlaessig raus; ist einer trotzdem zu gross, sagt die App welcher und warum.'),
  ('Regiebericht: "Rechnung erstellen" immer erreichbar',
   'Der Knopf verschwand bisher, sobald ein Bericht als verrechnet markiert war. Jetzt bleibt er da, und ein Hinweis zeigt, ob und mit welcher Rechnung der Bericht verrechnet ist.');
