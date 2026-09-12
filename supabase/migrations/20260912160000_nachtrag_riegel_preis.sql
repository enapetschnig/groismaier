-- ============================================================================
--  Nachtrag zu den Kalkulations-Meldungen vom 12.09.2026
-- ============================================================================
-- Beim Live-Nachpruefen fiel auf: Der Artikel "Riegelkonstruktion 6/..." (KVH)
-- traegt seit dem Rechner-Versuch EK 15,50 / VK 25,02 je m3 statt EK 465.
-- Die Stammdaten-Nachfuehrung (21.08.) zieht das beim Oeffnen in jede
-- Kalkulation mit dieser Zeile - bei Alfred Roschek sind das -3.190,86 Euro.
-- Keine Daten werden geaendert: Der Artikel gehoert dem Betrieb, die
-- Korrektur macht er selbst im Rechner. Hier nur der Hinweis in beiden
-- Antworten.

UPDATE public.aenderungswuensche
   SET antwort = antwort || E'\n\nNACHTRAG (12.09., nach dem Live-Test): Beim Nachpruefen ist mir aufgefallen, dass der Artikel "Riegelkonstruktion 6/..." (Gruppe KVH) seit deinem Rechner-Versuch EK 15,50 und VK 25,02 Euro je m3 traegt. Vorher stand er auf EK 465 (VK 627,75). KVH kostet rund 465 Euro je m3 - die 15,50 sind vermutlich beim Probieren haengengeblieben. Wichtig: Jede Kalkulation mit dieser Zeile holt sich den Preis beim Oeffnen aus dem Artikel (so wie am 21.08. gewuenscht). Bei Alfred Roschek wird die Aussenwand dadurch um rund 3.190 Euro billiger - die Kalkulation zeigt jetzt 144.335,93 statt 147.526,79 gesamt. Bitte den Artikel im Rechner auf den richtigen m3-Preis stellen (EK 465), dann stimmt Roschek beim naechsten Oeffnen wieder. Das Angebot A-2026-036 aendert sich davon nicht, solange du nicht "Positionen neu uebernehmen" drueckst.'
 WHERE id::text LIKE 'ea7c2bf1%';

UPDATE public.aenderungswuensche
   SET antwort = antwort || E'\n\nNACHTRAG: Wenn du die Kalkulation jetzt oeffnest, siehst du 128.136,37 Angebotssumme / 144.335,93 gesamt statt 131.327,23 / 147.526,79. Das kommt NICHT von der Aenderung hier, sondern vom KVH-Preis im Artikel "Riegelkonstruktion 6/..." (seit heute EK 15,50 statt 465 - siehe die Antwort auf deine KVH-Meldung). Artikel korrigieren, Kalkulation neu oeffnen, dann passt es wieder. Dein Angebot A-2026-036 bleibt bei 131.327,23.'
 WHERE id::text LIKE '9ebb8052%';
