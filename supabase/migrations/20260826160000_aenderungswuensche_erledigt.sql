-- Bearbeitete Meldungen abschliessen (Kundenwunsch 26.08.2026: "die Dinge,
-- die du schon erledigt hast, bitte gleich auf erledigt stellen").
-- Die Antwort steht danach im Adminbereich beim jeweiligen Wunsch.

-- 12:10 — Belegliste: Summe im Blick, Betreff vollstaendig lesbar
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Umgesetzt: Summe Netto und Brutto stehen jetzt direkt neben Betreff und Kunde - kein Schieben mehr nach rechts. Der Betreff ist breiter und wird nicht mehr abgeschnitten, Belegnummer und Projektname sind vollstaendig lesbar. Kundennummer, Adresse und Kommentare sind nach hinten gerueckt.'
 WHERE id = 'e04d4f02-eb43-4546-9ebd-465462c9eb21';

-- 12:15 — Rueckmeldung zur Farbgestaltung (kein Wunsch)
UPDATE public.aenderungswuensche
   SET status = 'gesehen',
       antwort = 'Danke fuer die Rueckmeldung - freut mich!'
 WHERE id = '90b6df07-c63b-46c0-84f0-555cab3c6a79';

-- 12:17 — Kalkulation: Einheit fuer die Angebots-Uebergabe
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Umgesetzt: Jeder Aufbau hat in der Kalkulation das Feld "Im Angebot als" - automatisch, Pauschale, m2, Laufmeter, m3 oder Stueck. Bei "Pauschale" steht auch keine Flaeche mehr im Positionstext ("Turmdrehkran" statt "Turmdrehkran (1,00 m2)"). Im Angebot selbst bleibt die Einheit je Position weiterhin aenderbar.'
 WHERE id = 'c76be766-b199-4eef-8e67-0feb2ebd2a60';
