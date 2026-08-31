-- Die restlichen Meldungen vom 28.-31.08. abschliessen (echte IDs).

-- Florian: Fotos herunterladen
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: In der grossen Foto-Ansicht (Projekt-Fotos und Regieberichte) gibt es oben rechts jetzt einen Download-Knopf.'
 WHERE id::text LIKE 'f29e4f7b%';

-- Christian: Nachfrage-Funktion bei Angeboten
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: Nach dem E-Mail-Versand eines Angebots fragt die App "Nachfrage-Termin setzen?" (Vorschlag: in einer Woche). Die Erinnerung ist eine Aufgabe mit Faelligkeit - sie erscheint auf der Startseite unter "Meine Aufgaben", sobald sie ansteht. Kein eigenes Erinnerungssystem daneben, alles an einem Ort.'
 WHERE id::text LIKE 'ec1eace2%';

-- Christian: Schindelboeck-Schlussrechnung (Anzahlungsabzug + Stunden)
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Beides gibt es schon: 1) Den Anzahlungsabzug bekommst du automatisch, wenn du die Schlussrechnung ueber die Belegliste erzeugst: beim Angebot (oder der AB) auf "Kopieren in" -> Schlussrechnung - alle Anzahlungsrechnungen der Belegkette werden als Abzugszeilen (brutto, MwSt-frei) angehaengt. Deinen jetzigen Entwurf ohne Abzug am besten verwerfen und ueber diesen Weg neu erzeugen. 2) Die gebuchten Stunden musst du nicht per Hand eintragen: im Beleg bei den Positionen auf "Aus Regiebericht" - die offenen Berichte des Projekts kommen mit Stunden x Mitarbeiter herein. Deine Idee mit der Bezeichnung je Arbeiter (Facharbeiter/Lehrling mit eigenem Satz) baue ich gern ein - sag Bescheid.'
 WHERE id::text LIKE 'fc6e5f12%';

-- Florian: Aufgaben an mehrere Personen
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: Beim Zuweisen einer Aufgabe an eine Person kannst du jetzt zusaetzlich "Weitere Personen" anhaken. Die Aufgabe erscheint bei allen unter "Meine Aufgaben".'
 WHERE id::text LIKE 'a72804a9%';

-- Christian: weitere Telefonnummern
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: In der Kundenmaske gibt es unter den Telefonfeldern den Knopf "Weitere Nummer" - beliebig viele Zeilen mit Bezeichnung (zB "Mutter vor Ort", "Vorarbeiter") und Nummer. Sie stehen auch in der Kunden-Detailansicht.'
 WHERE id::text LIKE '6530ad7e%';

-- Christian: Ordnername ohne Kunde
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: Beim Anlegen einer Kalkulation gibt es jetzt das Feld "Bauvorhaben (falls Kunde noch nicht angelegt)" - es benennt den Ordner in der Uebersicht. Spaeter ueber "Bauvorhaben aendern" (Drei-Punkte-Menue der Kalkulation) durch den echten Kunden ersetzbar; dort kannst du den freien Namen auch nachtraeglich setzen.'
 WHERE id::text LIKE '81a0a913%';

-- Christian: Schichtname mit Daemmstaerke
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: Bei der Uebernahme ins Angebot wird der Platzhalter im Artikelnamen durch die gewaehlte Daemmstaerke ersetzt - aus "Riegelkonstruktion 6/..." wird bei 24 cm "Riegelkonstruktion 6/24". Gilt fuer alle Artikel mit diesem Muster; der Katalog selbst behaelt den Platzhalter.'
 WHERE id::text LIKE '3be35555%';

-- Neuerungen fuer die Startseite (sehen nur Administratoren)
INSERT INTO public.neuerungen (titel, text) VALUES
  ('Nachfrage-Termin nach Angebots-Versand',
   'Nach dem E-Mail-Versand eines Angebots fragt die App nach einem Nachfrage-Termin. Die Erinnerung erscheint unter "Meine Aufgaben".'),
  ('Aufgaben an mehrere Personen',
   'Beim Zuweisen zusaetzlich "Weitere Personen" anhaken - die Aufgabe erscheint bei allen.'),
  ('Weitere Telefonnummern je Kunde',
   'Kundenmaske: Knopf "Weitere Nummer" mit Bezeichnung (zB Vorarbeiter).'),
  ('Kalkulation: Bauvorhaben ohne Kunde',
   'Neues Feld beim Anlegen benennt den Ordner, solange der Kunde noch nicht angelegt ist.'),
  ('Schichtnamen mit Daemmstaerke',
   'Im Angebot steht jetzt zB "Riegelkonstruktion 6/24" statt "6/...".'),
  ('Fotos herunterladen',
   'In der grossen Foto-Ansicht gibt es einen Download-Knopf.');
