-- Die drei offenen Meldungen vom 28.08. abschliessen (echte IDs).

-- 08:43 - Schindelboeck zuruecksetzen: wurde ANDERS geloest - die
-- Entwurfsrechnung ist direkt korrigiert (Migration 20260828140000),
-- Loeschen und Neuanlegen ist nicht mehr noetig.
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Anders geloest, du musst nichts neu anlegen: Die bestehende Entwurfsrechnung wurde direkt korrigiert - die Arbeitszeit-Zeilen rechnen jetzt Stunden x Mitarbeiter (mit Namen in der Beschreibung), die Summen sind neu gerechnet. Bitte oeffne einfach den Entwurf und pruefe die Stunden. Die Regieberichte bleiben auf verrechnet, weil sie ja in dieser Rechnung stecken.'
 WHERE id = '3409411b-0000-0000-0000-000000000000' OR (id::text LIKE '3409411b%');

-- 11:56 - Mail einem Projekt zuordnen
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Umgesetzt: Im Posteingang gibt es bei jeder Mail den Knopf "Zu Projekt" - die Mail wird als lesbare Datei samt allen Anhaengen im Projekt unter Dokumente -> E-Mails abgelegt. Zur Automatik-Frage: Technisch machbar (alle Mails eines Absenders automatisch ins Projekt); der Speicherplatz ist nur bei grossen Anhaengen ein Thema, der Mailtext selbst ist winzig. Wenn du das willst, bauen wir eine Absender-Zuordnung je Projekt ein - sag einfach Bescheid.'
 WHERE id::text LIKE 'aaed05f2%';

-- 11:58 - 15-Minuten-Pause
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Umgesetzt: In der Zeiterfassung gibt es bei der Pause jetzt auch "15 Min" (neben Keine/30/45/60).'
 WHERE id::text LIKE '4d7fbe54%';

-- Neuerungen fuer die Startseite (sehen nur Administratoren)
INSERT INTO public.neuerungen (titel, text) VALUES
  ('Mail einem Projekt zuordnen',
   'Im Posteingang bei jeder Mail: Knopf "Zu Projekt". Die Mail landet als lesbare Datei samt allen Anhaengen im Projekt unter Dokumente -> E-Mails.'),
  ('15-Minuten-Pause',
   'In der Zeiterfassung gibt es bei der Pause jetzt auch 15 Min.');
