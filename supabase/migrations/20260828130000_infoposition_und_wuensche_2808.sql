-- ============================================================================
--  INFOPOSITION + Aufbau-Limit + Margengrenze (Meldungen 28.08. vormittags)
-- ============================================================================

-- INFOPOSITION (f13bc4c2): Optionale Aufbauten aus der Kalkulation stehen im
-- Angebot mit "INFOPOSITION" vorne und zaehlen nicht in die Belegsumme.
-- Der Betrag bleibt an der Zeile sichtbar (in Klammern).
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS ist_info BOOLEAN NOT NULL DEFAULT false;

-- Margengrenze (99303d6c): Warnschwelle auf 30 % setzen — gilt sofort fuer
-- Kalkulation und Beleg-Editor (app_settings gewinnt vor dem Code-Default).
INSERT INTO public.app_settings (key, value)
VALUES ('kalk_warn_marge_prozent', '30')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── Meldungen abschliessen ──────────────────────────────────────────────────

UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Eingebaut: Ein Aufbau, der in der Kalkulation auf "optional" steht, kommt jetzt als INFOPOSITION ins Angebot - vorne steht INFOPOSITION, der Betrag steht in Klammern an der Zeile und wird rechts NICHT mitsummiert (auch nicht in Netto/USt/Brutto). Im Beleg-Editor traegt die Zeile ein gelbes Kennzeichen. Zum Bildschirmfoto: Die Beleg-Vorschau ist ein eigenes eingebettetes Fenster - das kann die Foto-Funktion technisch nicht ablichten, dein Text kam aber vollstaendig an.'
 WHERE id = 'f13bc4c2-3c57-425d-90f7-832ccfdc5e99';

UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Erledigt: Die Grenze von 20 Aufbauten ist aufgehoben (jetzt praktisch unbegrenzt). Bei sehr vielen Aufbauten wird die Maske nur entsprechend laenger.'
 WHERE id = 'cc7ea12f-3782-497f-a882-a31c28bcd6b4';

UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Erledigt: Die Margen-Warnschwelle steht jetzt auf 30 %. Du kannst sie jederzeit selbst aendern: Kalkulation -> Einstellungen -> "Warnschwelle Marge (%)".'
 WHERE id = '99303d6c-c57a-4f1c-9f03-49774fc32254';

-- ── Neuerungen fuer die Startseite ──────────────────────────────────────────

INSERT INTO public.neuerungen (titel, text, aenderungswunsch_id) VALUES
  ('Optionale Aufbauten als INFOPOSITION',
   'Ein optionaler Aufbau kommt jetzt als INFOPOSITION ins Angebot: Betrag in Klammern an der Zeile, zaehlt aber nicht zur Angebotssumme.',
   'f13bc4c2-3c57-425d-90f7-832ccfdc5e99'),
  ('Aufbauten unbegrenzt',
   'Die Grenze von 20 Aufbauten je Kalkulation ist aufgehoben.',
   'cc7ea12f-3782-497f-a882-a31c28bcd6b4'),
  ('Margen-Warnschwelle: 30 %',
   'Die Warnschwelle fuer die Marge steht jetzt auf 30 % (aenderbar unter Kalkulation -> Einstellungen).',
   '99303d6c-c57a-4f1c-9f03-49774fc32254');

NOTIFY pgrst, 'reload schema';

-- Kontrolle
SELECT id, art, status, LEFT(COALESCE(antwort,''), 60) AS antwort
  FROM public.aenderungswuensche
 WHERE status = 'neu' OR created_at > '2026-08-28'
 ORDER BY created_at;
