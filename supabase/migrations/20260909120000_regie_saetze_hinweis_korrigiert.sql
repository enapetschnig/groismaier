-- Neuerung korrigiert (Kundenmeldung 09.09.2026): "Kalkulation > Einstellungen
-- gibt es bei mir nicht". Stimmt - der Reiter lag INNERHALB einer geoeffneten
-- Kalkulation. Die Saetze stehen jetzt unter Einstellungen > Einstellungen,
-- direkt ueber den Dokumenttexten (und weiterhin auch im Kalkulations-Reiter).
UPDATE public.neuerungen
   SET titel = 'Saetze fuer Regiearbeiten',
       text  = 'Unter Einstellungen > Einstellungen (ganz oben, ueber den Dokumenttexten) pflegst du die Saetze fuer Regiearbeiten: Vorarbeiter, Facharbeiter, Hilfsarbeiter, Lehrling sowie Montagebus und LKW je Kilometer. Sie stehen automatisch am Ende jedes Angebots - aenderst du einen Betrag, gilt er ueberall. Den Text drumherum aenderst du bei den Dokumenttexten (Platzhalter {{regiesaetze}}).'
 WHERE titel = 'Regie-Saetze und Angebotstext';
