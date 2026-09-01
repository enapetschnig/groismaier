-- Die fuenf Meldungen vom 01.09. abschliessen.

-- Mails auf ungelesen setzen
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: In der geoeffneten Mail gibt es oben rechts (neben Papierkorb) den Knopf "Als ungelesen markieren" - wie in Outlook. Wirkt auch im echten Postfach.'
 WHERE id::text LIKE '4f969942%';

-- Notizen/Naturmasse ins Projekt
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: In der Projektuebersicht gibt es rechts unten einen zweiten runden Knopf (Notizblock-Symbol) - damit fotografierst du Handnotizen und Naturmasse direkt ab. Sie landen gesammelt im Projekt unter Dokumente -> Ordner "Notizen" und sind dort samt Datum wiederzufinden. Mehrere Aufnahmen auf einmal gehen auch. Der runde Knopf darunter bleibt fuer die normalen Baustellenfotos.'
 WHERE id::text LIKE '17910387%';

-- Frage: Wo ist die Nachfrage-Funktion?
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Die Nachfrage-Funktion haengt am Angebots-VERSAND: Wenn du ein Angebot per E-Mail verschickst (im Angebot auf "Per E-Mail senden"), kommt nach dem Senden die Frage "Nachfrage-Termin setzen?" mit Vorschlag in einer Woche. Bestaetigst du, wird daraus eine Aufgabe mit Faelligkeit - sie erscheint auf der Startseite unter "Meine Aufgaben", sobald sie ansteht. Sie taucht also nicht im Posteingang auf, sondern bei den Aufgaben.'
 WHERE id::text LIKE '18350cbc%';

-- Frage: gemeinsam durchspielen (Baustelle abrechnen)
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Gerne telefonisch - hier der Ablauf in Kurzform: 1) Rechnung/Schlussrechnung oeffnen oder neu anlegen. 2) Ganz oben unter "Allgemein" das PROJEKT zuordnen (ohne Projekt findet die Funktion nichts). 3) Runter zu "Positionen" - dort der blaue Knopf "Baustelle abrechnen". 4) Es oeffnet sich eine Liste mit allen Bloecken des Projekts (Auftrag, Regieberichte, Arbeitszeiten, Material, Lieferscheine, Eingangsrechnungen, bereits gestellte Rechnungen als Abzug). Jeden Block kannst du aufklappen und einzelne Zeilen an- oder abhaken; rechts steht immer die Summe. 5) "In den Beleg uebernehmen" - die Positionen sind danach ganz normal aenderbar. 6) Speichern: die uebernommenen Regieberichte, Stunden und Materialbuchungen werden automatisch als verrechnet vermerkt. Was schon auf einer Rechnung steht, siehst du grau mit dem Vermerk "verrechnet in ..." - es wird also nichts doppelt verrechnet.'
 WHERE id::text LIKE '2b5f261a%';

-- Regieberichte drucken / an die Rechnung
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt, zwei Wege: 1) In der Regiebericht-Liste die Berichte anhaken (Kaestchen links) - in der Auswahl-Leiste gibt es jetzt neben "Rechnung erstellen" den Knopf "PDF oeffnen" bzw. "x PDFs oeffnen". Jeder Bericht wird ein eigenes Dokument zum Drucken oder Speichern. 2) Beim Versenden einer Rechnung, in der Regieberichte verrechnet sind, steht im Mailfenster ein Haekchen "x Regieberichte im Original anhaengen" - sie gehen dann als eigene PDFs mit der Rechnung an den Kunden.'
 WHERE id::text LIKE '47cc2e66%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Regieberichte drucken und mitschicken',
   'In der Regiebericht-Liste: anhaken und "PDF oeffnen" - einzeln oder mehrere. Beim Rechnungsversand koennen die zugehoerigen Berichte im Original mitgeschickt werden.'),
  ('Mail auf ungelesen setzen',
   'In der geoeffneten Mail oben rechts - wie in Outlook.'),
  ('Handnotizen ins Projekt',
   'In der Projektuebersicht der neue runde Knopf mit dem Notizblock: Zettel oder Naturmasse abfotografieren, sie landen unter Dokumente -> Notizen.');
