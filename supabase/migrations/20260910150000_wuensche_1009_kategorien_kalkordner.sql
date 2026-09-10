-- ============================================================================
--  Aenderungswuensche 10.09.2026 abschliessen
-- ============================================================================
-- Keine Belegdaten werden angefasst. Auch die Kalkulation "Kormann, Rosenburg"
-- bleibt unveraendert - der neue Ordner-Rueckfall im Code sortiert sie richtig ein.

-- Kategorien fuer Eingangsrechnungen selbst pflegen
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. Unter Admin > Konfiguration gibt es jetzt die Liste "Kategorien (Eingangsrechnungen)": Dort kannst du Kategorien anlegen, umbenennen, umsortieren und ausblenden. Die Eingangsrechnungen - der Filter, das Hochladen und das Bearbeiten - haben diese Liste schon immer von dort gelesen; es fehlte nur die Stelle, an der man sie pflegen kann. Ein Tipp: Wurde eine Kategorie schon bei Belegen verwendet, lieber ausblenden statt loeschen - die alten Belege behalten sie dann, sie taucht nur bei neuen nicht mehr zur Auswahl auf.'
WHERE id::text LIKE 'c90d65a4%';

-- Kalkulation anlegen: Kunde vs. Bauvorhaben
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Verstanden - und du hast es eigentlich richtig gemacht: Gibt es den Kunden noch nicht, gehoert sein Name einfach in die Bezeichnung. Bisher landete die Kalkulation dann trotzdem unter "Ohne Kunde", weil der Ordnername aus einem eigenen Feld kam, das man leicht uebersieht. Jetzt gilt eine einfache Regel: Kein Kunde gewaehlt, dann heisst der Ordner wie die Kalkulation. "Kormann, Rosenburg" steht damit als eigener Ordner in der Uebersicht, ohne dass du etwas tun musst. Das Feld heisst jetzt "Ordnername (optional)" und ist nur noch dafuer da, wenn mehrere Kalkulationen in einen gemeinsamen Ordner sollen - sonst leer lassen. Sobald der Kunde spaeter in der Datenbank ist, ordnest du ihn ueber "Bauvorhaben aendern" (Drei-Punkte-Menue an der Kalkulation) zu; der Ordner traegt dann seinen Namen. Nebenbei behoben: Beim Duplizieren und bei "Neue Kalkulation aus Vorlage" ging der Ordner bisher verloren, die Kopie rutschte nach "Ohne Kunde".'
WHERE id::text LIKE 'b0261584%';

-- Das Dankeschoen vom 26.08. war beantwortet, stand aber noch als offen.
UPDATE public.aenderungswuensche SET status = 'umgesetzt'
WHERE id::text LIKE '90b6df07%' AND status <> 'umgesetzt';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Kategorien fuer Eingangsrechnungen selbst pflegen',
   'Unter Admin > Konfiguration laesst sich die Liste der Kategorien (Material, Werkzeug, Treibstoff ...) jetzt selbst anlegen, umbenennen, umsortieren und ausblenden. Sie gilt sofort beim Hochladen, Bearbeiten und im Filter der Eingangsrechnungen.'),
  ('Kalkulation ohne Kunden: Ordner heisst wie die Kalkulation',
   'Legst du eine Kalkulation an, ohne einen Kunden zu waehlen, bekommt sie in der Uebersicht einen Ordner mit ihrer eigenen Bezeichnung statt "Ohne Kunde". Das Feld "Ordnername" ist nur noch noetig, wenn mehrere Kalkulationen zusammengehoeren. Beim Duplizieren und bei "aus Vorlage" bleibt der Ordner jetzt erhalten.');
