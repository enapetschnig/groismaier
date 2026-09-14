-- ============================================================================
--  Aenderungswuensche 14.09.2026: Teilzeit-Soll, Einheiten-Beschriftung,
--  Riegelkonstruktion-Preis
-- ============================================================================
-- Keine Belegdaten werden angefasst.

-- ── 1. Soll je Person (Meldung Katrin: "auf 15 h eingestellt, nicht 39") ─────
-- Bisher galt fuer alle 39 h/Woche, 7,8 h je Werktag - eine Teilzeitkraft
-- sammelte jeden Tag Minusstunden. Vollzeit bleibt durch die Defaults exakt
-- wie vorher (39 / 5 = 7,8).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wochenstunden     numeric NOT NULL DEFAULT 39,
  ADD COLUMN IF NOT EXISTS arbeitstage_woche numeric NOT NULL DEFAULT 5;

UPDATE public.profiles SET wochenstunden = 15, updated_at = now()
 WHERE id = '0030187e-da65-4da1-806e-7c04747c9b41';   -- Katrin Groismaier

-- ── 2. Artikel "Riegelkonstruktion 6/..." zuruecksetzen ─────────────────────
-- Seit dem Rechner-Versuch am 12.09. stand er auf EK 15,50 / VK 23,02 je m3
-- (vorher EK 465 / VK 627,75 = 465 x 1,35 - Roscheks Zeile traegt genau
-- diese Werte als Vergleichswert). Bei 6 x 16 cm ergibt 465 EUR/m3 exakt
-- 15,62 EUR/m2: Das Ergebnis je m2 wurde als EK je m3 eingetippt. Die
-- Stammdaten-Nachfuehrung zog den Preis in jede Kalkulation mit dieser
-- Zeile ("hat es die Formel verloren?", Meldung 14.09.). Der Betrieb bittet
-- ausdruecklich um Korrektur - Stammdaten, kein Beleg.
UPDATE public.invoice_templates
   SET ek_netto = 465,
       vk_netto = 627.75, netto_preis = 627.75, einzelpreis = 627.75,
       brutto_preis = round((627.75 * (1 + coalesce(ust_satz, 20) / 100))::numeric, 2),
       ist_kalkuliert = false, vk_preis_manuell = false,
       verschnitt_prozent = 0, aufschlag_prozent = 0
 WHERE id = '82d2782c-26bd-40e7-8e55-c3b6bf60e135';

-- ── 3. Meldungen abschliessen ───────────────────────────────────────────────
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. Bisher galt fuer alle dasselbe Soll: 39 Stunden pro Woche, 7,8 je Tag - deshalb sind bei dir jeden Tag Minusstunden aufgelaufen. Jetzt hat jede Person eigene Wochenstunden; bei dir stehen 15 h/Woche (3 h je gebuchtem Werktag). Christian kann das unter Admin > Benutzer & Mitarbeiter > Zeitkonten > "Soll" anpassen - auch die Arbeitstage je Woche, falls du z. B. an 3 Tagen je 5 h arbeitest. Die Zeiterfassung zeigt oben jetzt dein Soll statt der 39 h.'
WHERE id::text LIKE '8f84ba5d%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt. Die Beschriftungen folgen jetzt der Einheit, die oben unter "Im Angebot als" gewaehlt ist: Bei Laufmeter heisst das Feld "Laenge in lfm", der Umschalter "Pro lfm rechnen (x Laenge)", die Pauschal-Hinweise sagen "ohne x Laenge (54 lfm)", und die Zusammenfassung zeigt "pro lfm". Bei Stueck und m3 entsprechend. Gerechnet wird wie bisher Preis x Menge - nur die Woerter waren falsch. Riegel- und Daemmstoff-Zeilen bleiben bei m2, weil dort die Wandflaeche gemeint ist.'
WHERE id::text LIKE '95b9beb4%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Die Formel ist in Ordnung - sie steht ja in der blauen Zeile: 3,5 lfm/m2 x 6 cm x 16 cm x Preis je m3. Was nicht stimmte, war der Preis: Der Artikel "Riegelkonstruktion 6/..." stand seit Samstag auf EK 15,50 je m3 statt 465. Das ist beim Ausprobieren des Rechners passiert - bei 6 x 16 cm ergibt 465 Euro/m3 genau 15,62 Euro/m2, sehr wahrscheinlich wurde also das Ergebnis je m2 als Einkaufspreis je m3 eingetippt. Ich habe den Artikel auf die Werte von vorher zurueckgestellt: EK 465, VK 627,75 je m3, nicht kalkuliert. Beim naechsten Oeffnen holt sich jede Kalkulation mit dieser Zeile den richtigen Preis - auch Alfred Roschek steht dann wieder bei 147.526,79 gesamt. Willst du den Riegel-VK per Rechner kalkulieren: EK 465 je m3 eintragen, dann Verschnitt und Aufschlag - das Ergebnis zaehlt dann in den Riegel-Zeilen.'
WHERE id::text LIKE '8c4005fe%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Zeitkonto: eigenes Soll je Person (Teilzeit)',
   'Jede Person hat jetzt eigene Wochenstunden und Arbeitstage je Woche - Vollzeit bleibt 39 h / 7,8 h je Tag, Teilzeit bekommt ihr eigenes Tagessoll. Einstellen unter Admin > Benutzer & Mitarbeiter > Zeitkonten > "Soll". Urlaub, Zeitausgleich und Krankenstand rechnen ebenfalls mit dem persoenlichen Tagessoll.'),
  ('Kalkulation: Beschriftung folgt der Einheit',
   'Steht ein Aufbau auf Laufmeter, Stueck oder m3, heissen Mengenfeld, Umschalter und Hinweise jetzt auch so ("Laenge in lfm", "Pro lfm rechnen") - vorher stand ueberall "Flaeche in qm" und "Pro m2".');
