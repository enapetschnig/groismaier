-- ============================================================================
--  Aenderungswuensche 19.09.2026: Subgewerk in der Kalkulation, neue
--  Kalkulation im Bauvorhaben, Gesamtauswertung je Bauvorhaben, taegliche
--  Datensicherung. Keine Datenaenderung.
-- ============================================================================

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. In jeder Aufbau-Karte gibt es neben "optional" jetzt das Kaestchen "Subgewerk". Damit kennzeichnest du Aufbauten, die du zukaufst (Maler, Spengler, Elektriker ...). Was das bewirkt: In der Kalkulation steht unten bei "Gesamt (Projekt)" die Zeile "davon Subgewerke" mit Verkauf und Einkauf. In der Nachkalkulation (Auswertung aller Projekte) gibt es die neue Spalte "Fremd Soll" - das ist der Einkaufswert der Subgewerke laut Kalkulation - neben "Fremd Ist" (die Eingangsrechnungen). Liegen die Rechnungen ueber der Kalkulation, wird es rot, in den Details steht die Differenz. Auch auf der Projektseite unter "Nachkalkulation" steht bei den Fremdkosten, was laut Kalkulation geplant war. Voraussetzung: Die Kalkulation ist mit dem Projekt verknuepft (Projektseite > Stundenabgleich > "Woher kommen die Soll-Stunden?" > Kalkulation). Optionale Aufbauten zaehlen nicht mit, weil sie nicht beauftragt sind.'
WHERE id::text LIKE '594aa9d7%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. Wenn du ein Bauvorhaben geoeffnet hast, steht oben neben dem Namen der Knopf "Neue Kalkulation hier". Der legt eine leere Kalkulation (oder eine aus Vorlage) direkt in diesem Ordner an - Kunde bzw. Ordnername sind schon ausgefuellt. Der Knopf rechts oben "Neue Kalkulation" bleibt fuer neue Bauvorhaben.'
WHERE id::text LIKE 'dbdacc9f%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. Oeffnest du ein Bauvorhaben, steht ueber den Kalkulationen jetzt die "Gesamtauswertung": Gesamtsumme, Material, Arbeit in Euro, Arbeitsstunden, die ueber die Erloese gewichtete Marge und der Anteil Subgewerke - dazu eine Tabelle mit denselben Zahlen je Kalkulation. Gerechnet wird mit den aktuellen Stammdaten, genau wie in der einzelnen Kalkulation. Ein Stern bei der Marge heisst: mindestens ein Einkaufspreis ist geschaetzt.'
WHERE id::text LIKE 'e4343f82%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Ja, das laeuft jetzt so: Jede Nacht um 4 Uhr wird die komplette Datenbank gesichert - Kunden, Belege, Positionen, Stunden, Projekte, Benutzer. Die Sicherung liegt an zwei Orten: in der App unter Admin > Einstellungen > "Sicherheitskopie der App" > "Taegliche Datensicherung" (die letzten 60 Tage, aeltere werden automatisch geloescht - das ist die Rotation, die du von der externen Platte kennst) und bei GitHub, wo jede Sicherung 90 Tage aufgehoben wird. Willst du etwas auf deiner eigenen Platte im anderen Haus haben, lade dort einen Tag herunter - z. B. einmal im Monat. Das komplette Paket mit Programm und Anleitungen wird weiterhin am 1. jedes Monats neu gebaut. Nicht in der Tagessicherung enthalten sind Fotos und PDFs (rund 950 MB); die liegen im Speicher der App und werden getrennt gesichert. Die erste Tagessicherung kommt in der naechsten Nacht.'
WHERE id::text LIKE '4330bda5%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Kalkulation: Aufbau als "Subgewerk" kennzeichnen',
   'Zugekaufte Leistungen als Subgewerk markieren. Die Kalkulation zeigt "davon Subgewerke", die Nachkalkulation vergleicht sie als "Fremd Soll" mit den Eingangsrechnungen.'),
  ('Kalkulation: neue Kalkulation direkt im Bauvorhaben, Gesamtauswertung je Ordner',
   'Im geoeffneten Bauvorhaben: Knopf "Neue Kalkulation hier" und darueber die Gesamtauswertung mit Material, Arbeit, Stunden, Marge und Subgewerken ueber alle Kalkulationen des Ordners.'),
  ('Taegliche Datensicherung',
   'Die Datenbank wird jede Nacht gesichert; die letzten 60 Tage stehen unter Admin > Einstellungen > Sicherheitskopie zum Herunterladen, aeltere werden automatisch geloescht.');
