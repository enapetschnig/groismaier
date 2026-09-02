-- ============================================================================
--  Aenderungswuensche 02.09.2026 (dritte Runde) abschliessen
-- ============================================================================
-- Sechs Meldungen von Christian, alle im Code umgesetzt (Commit gleichen
-- Datums). Hier: Status + Antwort je Meldung, Neuerungen fuer die Startseite.
-- Keine Belegdaten werden angefasst.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: Die Fotos des Einsatzes stehen jetzt im Regiebericht-PDF (zwei je Reihe, vor der Unterschrift). Ausserdem zeigt die Material-Tabelle nun auch den Preis je Einheit. Damit sind alle eingetragenen Daten drauf: Kunde, Datum, Arbeitszeit, Pause, Stunden, Mitarbeiter, Notizen, Material (mit Menge, Einheit, Preis, Notiz), Maschinen/Fahrzeuge (mit Satz und Summe), Fotos und Unterschrift.'
WHERE id::text LIKE 'e2e59a62%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: In "Baustelle abrechnen" gibt es beim Abzug der Anzahlungen jetzt den Schalter "Tatsaechlich bezahlten Betrag abziehen (statt Rechnungsbetrag)". Er erscheint nur, wenn eine Anzahlung mit anderem Betrag bezahlt wurde (z. B. Skonto). Standard bleibt der Rechnungsbetrag - ein gewaehrter Skonto wird damit nicht nachgefordert. Schaltest du um, wird der wirklich gebuchte Betrag abgezogen und die Position heisst "... bezahlter Betrag". An bestehenden Rechnungen wurde nichts veraendert.'
WHERE id::text LIKE '5e506d23%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'So geht ein individuelles Thema: Bei Bildideen ist das Textfeld "Was soll dort hin?" jetzt das Hauptfeld - dort schreibst du frei in eigenen Worten, z. B. "eine zarte Holzkonstruktion im Farbton der Fassade, mit Glasdach, ueber dem Vorplatz". Die Vorlagen darunter sind nur Starthilfe: Sie setzen einen Text ein, den du danach beliebig aenderst oder ergaenzt. Tipps: Foto der Stelle hochladen, Material/Farbe/Ort im Bild nennen (je konkreter, desto besser), Ergebnis mit "Weiterdenken" als neues Ausgangsbild nehmen und den Wunsch nachschaerfen ("Dach flacher", "Holz heller").'
WHERE id::text LIKE '39805eca%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: Im Regiebericht heisst der Abschnitt jetzt "Maschinen / Fahrzeuge". Die Auswahl zeigt alle aktiven Maschinen UND Fahrzeuge aus dem Stamm - mit dem hinterlegten Verrechnungssatz. Bei Fahrzeugen gibt es unter Fahrzeuge > Verrechnung neu die Einheit "EUR/km"; im Bericht traegst du dann die gefahrenen Kilometer ein, verrechnet wird km x Satz. Fahrzeuge ohne Satz sind ebenfalls waehlbar (Hinweis "kein Satz hinterlegt"), der Preis wird dann von Hand eingetragen.'
WHERE id::text LIKE '6714b20f%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: Beim Material im Regiebericht (im Formular und im Detail) kommen beim Tippen Vorschlaege aus der Artikelliste (Einstellungen > Artikel). Ein Klick uebernimmt Name, Einheit und Verkaufspreis. Wer nichts anklickt, bucht wie bisher frei - und kann den Preis je Einheit trotzdem von Hand eintragen. Der Preis wandert in die Rechnung ("Baustelle abrechnen", "Regiebericht importieren") und steht im PDF.'
WHERE id::text LIKE 'd9997234%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: In der Regieberichte-Liste gibt es oben neben "X von Y Berichten" den Knopf "Alle N auswaehlen". Er waehlt genau die gerade sichtbaren (gefilterten) Berichte; ein zweiter Klick hebt die Auswahl wieder auf.'
WHERE id::text LIKE '30d8b550%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Regiebericht: Fotos und Preise im PDF',
   'Das Regiebericht-PDF enthaelt jetzt die Fotos des Einsatzes und beim Material den Preis je Einheit. In der Liste gibt es "Alle auswaehlen".'),
  ('Regiebericht: Material aus der Artikelliste, Fahrzeuge mit km-Satz',
   'Beim Material kommen beim Tippen Vorschlaege aus der Artikelliste (Name, Einheit, Preis) - freie Eingabe bleibt moeglich. Im Abschnitt "Maschinen / Fahrzeuge" sind alle Fahrzeuge waehlbar; unter Fahrzeuge > Verrechnung gibt es neu "EUR/km".'),
  ('Baustelle abrechnen: bezahlten Betrag abziehen',
   'Wurde eine Anzahlung mit Skonto bezahlt, laesst sich beim Abzug umschalten: Rechnungsbetrag (Standard) oder tatsaechlich bezahlter Betrag.'),
  ('Bildideen: eigener Wunsch zuerst',
   'Das Textfeld ist jetzt das Hauptfeld - einfach in eigenen Worten beschreiben, was ins Bild soll. Vorlagen sind nur Starthilfe und lassen sich danach frei aendern.');
