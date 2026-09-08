-- ============================================================================
--  Aenderungswuensche 07.09.2026 (Nachmittag): LV in der Kalkulationsmaske,
--  Beleg dem Projekt zuordnen, Regieberichte als ein Sammel-PDF
-- ============================================================================
-- Keine Belegdaten werden angefasst.

-- LV <-> Kalkulation verknuepfen
ALTER TABLE public.kalkulationen
  ADD COLUMN IF NOT EXISTS lv_id uuid REFERENCES public.lv_ausschreibungen(id) ON DELETE SET NULL;
ALTER TABLE public.lv_ausschreibungen
  ADD COLUMN IF NOT EXISTS kalkulation_id uuid REFERENCES public.kalkulationen(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS kalkulationen_lv_idx ON public.kalkulationen (lv_id) WHERE lv_id IS NOT NULL;

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: In der Ausschreibung gibt es oben den Knopf "In Kalkulation bepreisen". Er legt aus dem LV eine Auftragskalkulation an - je bepreisbarer LV-Position ein Aufbau (Name = Pos-Nr + Text, Menge = LV-Menge, Einheit aus dem LV). Dort kalkulierst du wie gewohnt mit Stammdaten, Katalog, Material und Arbeitszeit. Oben in der Kalkulation steht ein gelber Balken "Bepreist die Ausschreibung ..." mit "Preise ins LV uebernehmen": Gesamt geteilt durch Menge ergibt den Einheitspreis, der Arbeitsanteil wird als EP Lohn, der Rest als EP Sonstiges in die LV-Positionen geschrieben. In der Ausschreibung geht das auch ueber "Preise aus Kalkulation". Danach wie bisher: Als Angebot uebernehmen.'
WHERE id::text LIKE '3ee156d8%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Zwei Wege: (1) NEU auf der Projektseite: Knopf "Beleg zuordnen" (neben "Neues Angebot") - Liste der Angebote und Rechnungen, Belege ohne Projekt stehen oben, suchen nach Nummer/Betreff/Kunde, anklicken, fertig. (2) Im Angebot selbst unter "1. Allgemein" das Feld "Projekt zuordnen" und speichern. Beides verknuepft das Angebot mit dem Projekt; die PDFs landen dann im Projektordner und der Stundenabgleich zieht das Angebot heran.'
WHERE id::text LIKE 'ba1a7ea1%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt: (1) Beim Versand der Rechnung per E-Mail haengt der Haken "Regieberichte anhaengen" jetzt ALLE verrechneten Berichte als EINE PDF-Datei an ("Regieberichte (25).pdf", nach Datum sortiert) - nicht mehr 25 einzelne Dateien. (2) In der Regieberichte-Liste: Berichte auswaehlen (oder "Alle auswaehlen") und "Als ein PDF" druecken - eine Datei mit allen Berichten zum Speichern oder Weitergeben.'
WHERE id::text LIKE '80dfc6f0%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Ausschreibung mit der Kalkulation bepreisen',
   'In der Ausschreibung: "In Kalkulation bepreisen" legt je LV-Position einen Aufbau an. In der Kalkulation bringt "Preise ins LV uebernehmen" die Einheitspreise (Lohn/Sonstiges) zurueck.'),
  ('Projekt: Beleg zuordnen',
   'Auf der Projektseite laesst sich ein bestehendes Angebot oder eine Rechnung dem Projekt zuordnen.'),
  ('Regieberichte als ein Sammel-PDF',
   'Beim Mailversand einer Rechnung haengen alle verrechneten Regieberichte als eine PDF-Datei an. In der Liste: auswaehlen und "Als ein PDF".');
