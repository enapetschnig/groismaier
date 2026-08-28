-- ============================================================================
--  Gemeldete Wuensche 27.08.-28.08. abschliessen + Neuerungen eintragen
-- ============================================================================

-- Fahrten: Festbetrag / Mindestbetrag (f48b97b9)
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Beides eingebaut: Im Aufbau gibt es unter "Fahrten" jetzt das Feld "Festbetrag Fahrten" - ein eingetragener Betrag ersetzt die km-Rechnung komplett. Zusaetzlich gibt es in den Kalkulations-Einstellungen den "Mindestbetrag je Fahrt": Jede Hin- und Rueckfahrt zaehlt dann mindestens mit diesem Betrag, auch bei kurzen Strecken.'
 WHERE id = 'f48b97b9-ac94-4463-b55a-4e533bac83ea';

-- Sendebestaetigung beim Belegversand (8a472548)
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Eingebaut: Jeder Versand ueber "Per E-Mail senden" speichert automatisch eine Sendebestaetigung mit Datum, Uhrzeit, Empfaenger und Anhaengen. Im Projekt gibt es dafuer die eigene Karte "Sendeprotokoll"; alles gesammelt (auch Belege ohne Projekt) findest du unter Dokumente -> Menue (drei Punkte) -> Sendeprotokoll. Gespraechsprotokolle fuer Telefonate heben wir uns wie besprochen fuer spaeter auf.'
 WHERE id = '8a472548-eba7-4f45-8a24-33a5e46835d0';

-- Skonto wird nicht uebernommen (de836467)
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Ursache gefunden: Der Skonto kam erst aufs Dokument, wenn Prozent UND Tage befuellt waren - bei dir waren die Skonto-Tage leer, und die Beleg-Vorschau zeigte den Skonto generell nicht (nur das PDF). Jetzt: Traegst du einen Skonto-Prozentsatz ein, werden die Tage automatisch mit 10 vorbelegt (aenderbar), die Vorschau zeigt den Skonto-Kasten genau wie das PDF, und wenn die Tage fehlen, warnt die Maske deutlich.'
 WHERE id = 'de836467-d7a9-4e77-8264-e0a6552e13e0';

-- Kalkulations-Ordner loeschen/umbenennen (1d1e1a66)
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Eingebaut: Jede Bauvorhaben-Karte in der Kalkulationsuebersicht hat jetzt ein Menue (drei Punkte) mit "Ordner umbenennen" (aendert den Kundennamen - der Ordnername ist der Kunde) und "Ordner loeschen" (loescht nach Rueckfrage die enthaltenen Kalkulationen, der Kunde bleibt). Einzelne Kalkulationen lassen sich ueber ihr Menue jetzt auch direkt umbenennen.'
 WHERE id = '1d1e1a66-4914-470e-a327-e86daf101100';

-- Regie-Sammelrechnung: Stunden dazugebuchter Mitarbeiter fehlten (fc59ea56)
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Fehler gefunden und behoben: Beim Uebernehmen in die Rechnung zaehlten nur die Stunden des Berichts EINMAL - dazugebuchte Mitarbeiter fielen unter den Tisch. Jetzt rechnet der Import Stunden x Anzahl der beteiligten Mitarbeiter und schreibt die Namen mit in die Position. Fuer die Schindlboeck-Rechnung: Bitte im Beleg "Aus Regiebericht importieren" noch einmal ausfuehren (die alten Arbeitszeit-Zeilen vorher loeschen) - dann stimmen die Stunden. Auch die Summe "Noch zu verrechnen" in der Regie-Liste rechnet jetzt je Mitarbeiter.'
 WHERE id = 'fc59ea56-170f-4f77-b086-546aef296556';

-- Regieberichte: verrechnete in Projektordner sammeln (4b0f5383)
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Eingebaut: Die erste Ansicht zeigt nur noch die offenen (nicht verrechneten) Berichte. Alles Verrechnete liegt darunter in zugeklappten Projektordnern - aufklappen per Klick. Suche und Status-Filter zeigen weiterhin alles.'
 WHERE id = '4b0f5383-95c5-49ae-8bbb-e31b544299da';

-- KVH m3-Preis als Pauschale (d8f619d3)
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Zur Frage: Nein, so stimmt die Rechnung vermutlich NICHT. Die Zeile "KVH Staerke ab 10 cm" steht im Pauschal-Modus (Bleistift) - dort zaehlen EK/VK nur EINMAL gesamt, ohne Flaeche und ohne Menge. 485 ist aber ein m3-Preis: Fuer 186 m2 Dach waeren das je nach Holzmenge mehrere tausend Euro, nicht 654,75. Die Maske warnt jetzt deutlich, wenn ein je-m3-bepreister Artikel als Pauschale steht. Richtig rechnen: bei Decke/Dach den Modus "Holz berechnen" verwenden (lfm/m2 x Querschnitt x m3-Preis) oder den Gesamtbetrag selbst ausrechnen und als Pauschale eintragen. Der Hinweis rechts beim 6-cm-KVH zeigt den umgerechneten Preis je m2 - der stimmt.'
 WHERE id = 'd8f619d3-78f8-4fbe-bbd8-6c89d4338a46';

-- Dankeschoen zur Farbgestaltung (90b6df07) - keine Aufgabe, nur freundlich
-- bestaetigen, damit die Meldung nicht ewig als offen herumliegt.
UPDATE public.aenderungswuensche
   SET status = 'gesehen',
       antwort = 'Danke fuer die Rueckmeldung - freut uns, dass die Gestaltung passt!'
 WHERE id = '90b6df07-c63b-46c0-84f0-555cab3c6a79' AND antwort IS NULL;

-- ── Neuerungen fuer die Startseite ──────────────────────────────────────────

INSERT INTO public.neuerungen (titel, text, aenderungswunsch_id) VALUES
  ('Regie-Rechnung: Stunden je Mitarbeiter',
   'Beim Uebernehmen von Regieberichten in eine Rechnung zaehlen die Stunden jetzt je beteiligtem Mitarbeiter (z.B. 2 Mitarbeiter x 7,5 Std. = 15 Std.), mit Namen in der Position. Bitte betroffene Rechnungs-Entwuerfe einmal neu importieren.',
   'fc59ea56-170f-4f77-b086-546aef296556'),
  ('Skonto: Vorschau + automatische Tage',
   'Die Beleg-Vorschau zeigt den Skonto-Kasten jetzt genauso wie das PDF. Beim Eintragen eines Skonto-Prozentsatzes werden die Skonto-Tage automatisch mit 10 vorbelegt (aenderbar); fehlen die Tage, warnt die Maske.',
   'de836467-d7a9-4e77-8264-e0a6552e13e0'),
  ('Fahrten: Festbetrag und Mindestbetrag',
   'Im Aufbau unter "Fahrten": Feld "Festbetrag Fahrten" ersetzt die km-Rechnung. In den Kalkulations-Einstellungen: "Mindestbetrag je Fahrt" fuer kurze Strecken.',
   'f48b97b9-ac94-4463-b55a-4e533bac83ea'),
  ('Sendeprotokoll fuer versendete Belege',
   'Jeder E-Mail-Versand eines Belegs speichert eine Sendebestaetigung mit Datum und Uhrzeit. Zu finden im Projekt (Karte "Sendeprotokoll") und gesammelt unter Dokumente -> drei-Punkte-Menue -> Sendeprotokoll.',
   '8a472548-eba7-4f45-8a24-33a5e46835d0'),
  ('Kalkulations-Ordner aufraeumen',
   'Bauvorhaben-Ordner lassen sich ueber das drei-Punkte-Menue umbenennen (aendert den Kundennamen) und loeschen. Kalkulationen selbst haben jetzt auch "Umbenennen" im Menue.',
   '1d1e1a66-4914-470e-a327-e86daf101100'),
  ('Regieberichte: offene zuerst',
   'Die Regie-Liste zeigt zuerst nur die offenen Berichte; alles Verrechnete liegt in zugeklappten Projektordnern darunter.',
   '4b0f5383-95c5-49ae-8bbb-e31b544299da'),
  ('Kalkulation: Warnung bei m3-Preis als Pauschale',
   'Steht ein je m3 bepreister Artikel (KVH, BSH ...) im Pauschal-Modus, warnt die Zeile jetzt deutlich - der Betrag zaehlt dort nur einmal, ohne Menge.',
   'd8f619d3-78f8-4fbe-bbd8-6c89d4338a46');

-- Kontrolle
SELECT id, art, status, LEFT(antwort, 60) AS antwort
  FROM public.aenderungswuensche
 ORDER BY created_at;
