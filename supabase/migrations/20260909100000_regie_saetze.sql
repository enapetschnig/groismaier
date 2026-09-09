-- ============================================================================
--  Regie-Saetze als Stammdaten + Schlusstext fuer Angebote (Wunsch 09.09.2026)
-- ============================================================================
-- "das soll schoen am ende jedes angebots stehen, aber auch so, dass man die
--  preise dann immer aendern kann und die preise auch synchron sind"
--
-- Eine Liste, eine Wahrheit: Die Saetze stehen hier, der Schlusstext des
-- Angebots holt sie ueber den Platzhalter {{regiesaetze}}.
-- Keine Belegdaten werden angefasst.

CREATE TABLE IF NOT EXISTS public.regie_saetze (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gruppe      text NOT NULL DEFAULT 'personal' CHECK (gruppe IN ('personal','fahrzeug')),
  bezeichnung text NOT NULL,
  betrag      numeric NOT NULL DEFAULT 0,
  /* "Std" oder "km" - steht genau so im Angebot. */
  einheit     text NOT NULL DEFAULT 'Std',
  sort        integer NOT NULL DEFAULT 0,
  aktiv       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS regie_saetze_sort_idx ON public.regie_saetze (gruppe, sort);

ALTER TABLE public.regie_saetze ENABLE ROW LEVEL SECURITY;
-- Lesen darf jeder Angemeldete (die Saetze stehen ohnehin im Angebot),
-- pflegen nur der Administrator.
DROP POLICY IF EXISTS "Regie-Saetze lesen" ON public.regie_saetze;
CREATE POLICY "Regie-Saetze lesen" ON public.regie_saetze FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Regie-Saetze pflegen" ON public.regie_saetze;
CREATE POLICY "Regie-Saetze pflegen" ON public.regie_saetze FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

-- Startbestand laut Vorgabe vom 09.09.2026.
INSERT INTO public.regie_saetze (gruppe, bezeichnung, betrag, einheit, sort)
SELECT * FROM (VALUES
  ('personal', 'Vorarbeiter',                          85.00, 'Std', 10),
  ('personal', 'Facharbeiter',                         75.00, 'Std', 20),
  ('personal', 'Hilfsarbeiter',                        70.00, 'Std', 30),
  ('personal', 'Lehrling 1. LJ',                       35.00, 'Std', 40),
  ('fahrzeug', 'Montagebus',                            1.20, 'km',  10),
  ('fahrzeug', 'Montagebus mit Anhänger',               1.50, 'km',  20),
  ('fahrzeug', '2-Achs-LKW mit Anhänger',               2.00, 'km',  30),
  ('fahrzeug', '2-Achs-LKW mit Anhänger inkl. Maut',    2.50, 'km',  40)
) AS v(gruppe, bezeichnung, betrag, einheit, sort)
WHERE NOT EXISTS (SELECT 1 FROM public.regie_saetze);

-- Schlusstext fuer Angebote: der Text des Chefs, die Saetze als Platzhalter.
-- Nur setzen, wenn noch keiner hinterlegt ist - ein vorhandener Text des
-- Chefs wird NICHT ueberschrieben.
INSERT INTO public.document_texts (typ, feld, sprache, inhalt)
SELECT 'angebot', 'closing', 'de',
'Kosten für Regiearbeiten:

{{regiesaetze}}

Durch bauseitig beigestelltes Material und dadurch nötige Regiepositionen, halten wir uns das Recht auf Preiserhöhung bis max. 10 % der Gesamtsumme vor.

Die Regiepositionen werden nach tatsächlichem Aufwand abgerechnet. Regieaufzeichnungen werden zu den jeweiligen Rechnungen angefügt (spätestens aber bei der Schlussrechnung).

Die Positionen mit "OPTIONAL" davor sind nicht in der Endsumme eingerechnet.

Für Änderungen der Ausführung nach schriftlicher Beauftragung oder bei Ausführung später als 6 Monate nach der Angebotslegung behalten wir uns ein Recht auf Preisanpassung vor.

Alle Unterlagen (Einreichplan, Polierplan etc.), behördliche Genehmigungen bzw. persönliche Sonderwünsche bei der Ausführung müssen bis spätestens 6 Wochen vor Montagebeginn festgelegt sein. Jede Verzögerung in der Planung wirkt sich auf die Lieferzeit aus und kann nicht als Mangel geltend gemacht werden.

Die Abrechnung erfolgt in den angegebenen Positionseinheiten nach Fertigstellung der Leistung.

Nach schriftlicher Auftragserteilung werden 10 % der Gesamtsumme (nach Absprache) in Rechnung gestellt, als Anzahlung für Material.

Teilrechnungen werden nach Baufortschritt gestellt.


_________________________________________________________
                             Unterschrift Kunde'
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_texts
   WHERE typ = 'angebot' AND feld = 'closing' AND sprache = 'de' AND btrim(coalesce(inhalt,'')) <> ''
);

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Regie-Saetze und Angebotstext',
   'Unter Kalkulation > Einstellungen stehen die Saetze fuer Regiearbeiten (Vorarbeiter, Facharbeiter, Hilfsarbeiter, Lehrling, Montagebus, LKW ...). Sie erscheinen automatisch am Ende jedes Angebots - aenderst du einen Satz, stimmt er ueberall. Den Text darum pflegst du unter Einstellungen > Dokumenttexte, Platzhalter {{regiesaetze}}.');
