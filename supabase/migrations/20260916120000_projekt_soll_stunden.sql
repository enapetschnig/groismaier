-- ============================================================================
--  Meldungen 16.09.2026: Stundenabgleich am Projekt
--  1) BV Schindelboeck: Regiestunden aus dem Angebot nicht uebernommen
--  2) BV Zimmerl: Kalkulation mit Projekt verknuepfen / Stunden haendisch
-- ============================================================================
-- Keine Belegdaten werden geaendert.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS geplante_stunden numeric;
COMMENT ON COLUMN public.projects.geplante_stunden IS 'Haendisch geplante Arbeitsstunden fuer den Stundenabgleich (geht vor Kalkulation und Angebot).';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Gefunden. Das Angebot Schindelboeck hat vier Stundenpositionen zu je 50 Std.: Zimmerer Vorarbeiter, Zimmerer Facharbeiter, Zimmerer Hilfsarbeiter und Lehrling. Die App zaehlte nur Facharbeiter und Lehrling (100 Std.), weil die Erkennung "eigene Arbeitsstunden" die Woerter Vorarbeiter und Hilfsarbeiter nicht kannte. Jetzt gelten alle Zeilen mit Stunden-Einheit und Personal im Namen (Vorarbeiter, Facharbeiter, Hilfsarbeiter, Zimmerer, Polier, Monteur, Partie, Lehrling ...). Bei Schindelboeck stehen damit 200 Std. laut Angebot gegen 143,3 gebucht - also unter dem Angebot, nicht darueber. Zugekaufte Leistungen mit Std-Einheit (z. B. Geruest-Transport) zaehlen weiter nicht.'
WHERE id::text LIKE '1db5eff7%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt, beides. Im Stundenabgleich der Projektseite gibt es jetzt "Woher kommen die Soll-Stunden?": Aus dem Angebot (wie bisher, automatisch), aus einer Kalkulation (du waehlst sie aus der Liste, sie wird mit dem Projekt verknuepft, die Summe der Arbeitsstunden aller Aufbauten ist dann das Soll) oder haendisch (Zahl eintragen). Haendisch gilt vor Kalkulation, Kalkulation vor Angebot; die Karte sagt dazu, woher die Zahl kommt. Die Nachkalkulations-Uebersicht rechnet mit derselben Zahl. Fuer Zimmerl also: Kalkulation waehlen oder die geplanten Stunden eintippen.'
WHERE id::text LIKE 'e3c8c79f%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Stundenabgleich: Soll aus Angebot, Kalkulation oder haendisch',
   'Auf der Projektseite laesst sich einstellen, woher die Soll-Stunden kommen: automatisch aus dem Angebot, aus einer verknuepften Kalkulation (Summe der Arbeitsstunden) oder haendisch. Die Nachkalkulation rechnet mit derselben Zahl.'),
  ('Stundenabgleich: alle Personal-Stundenpositionen zaehlen',
   'Angebotszeilen wie "Zimmerer Vorarbeiter 50 Std." oder "Hilfsarbeiter" zaehlen jetzt zum Stunden-Soll - vorher nur Facharbeiter und Lehrling.');
