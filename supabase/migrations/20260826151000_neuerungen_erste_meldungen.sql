-- Erste Startseiten-Meldungen: was zuletzt umgesetzt wurde
-- (Kundenwunsch 26.08.2026 - "dass er auch sieht, welche Aenderungen
--  umgesetzt wurden, kurz und wie").
INSERT INTO public.neuerungen (titel, text) VALUES
  ('Aenderung melden - direkt aus der App',
   'Oben in jeder Maske: Knopf "Aenderung melden". Bildschirmfoto ist automatisch dabei, dazu tippen oder einfach hineinsprechen. Kommt gesammelt im Adminbereich an.'),
  ('Summe gleich im Blick',
   'In den Belegen stehen Netto- und Bruttosumme jetzt direkt neben Betreff und Kunde - kein Schieben mehr nach rechts. Der Betreff wird nicht mehr abgeschnitten.'),
  ('Im Angebot als: Pauschale, m2, Laufmeter ...',
   'In der Kalkulation legst du bei jedem Aufbau fest, wie er ins Angebot geht (Feld "Im Angebot als"). Bei "Pauschale" steht kein "1,00 m2" mehr dabei. Im Angebot selbst bleibt die Einheit je Position weiterhin aenderbar.'),
  ('Bereiche im Angebot deutlicher',
   'Jede Kalkulation bekommt im Angebot einen kraeftigen Balken als Ueberschrift. Bereiche lassen sich im Beleg nachtraeglich einfuegen, umsortieren und wieder entfernen.'),
  ('Nachkalkulation: Angebot zuordnen',
   'Projekte ohne Auftragswert zeigen jetzt den Knopf "Angebot zuordnen" - damit haengst du ein bestehendes Angebot (auch ein altes aus KingBill) an das Projekt, und Soll gegen Ist steht sofort da.'),
  ('Textbausteine ueberall',
   'In den Positionen gibt es den Knopf "Textbaustein" fuer reine Textzeilen - ohne Menge, Einheit und Preis.');
