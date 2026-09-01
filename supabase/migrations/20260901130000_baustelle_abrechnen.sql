-- Meldung fc6e5f12 (30.08.) und Nachfrage 01.09.: eine Schlussrechnung,
-- auf der ALLES von der Baustelle steht.
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Jetzt in einem Schritt: Im Beleg (Rechnung, Anzahlungs- oder Schlussrechnung) gibt es den Knopf "Baustelle abrechnen". Er sammelt alles zum Projekt und zeigt je Block die Summe: Auftrag (AB, sonst Angebot), offene Regieberichte (Stunden x Mitarbeiter, Material, Maschinen), gebuchte Arbeitszeiten, Materialbuchungen und die Anzahlungen als steuerfreien Brutto-Abzug. Anhaken, uebernehmen, fertig - danach ganz normal aenderbar. Nichts wird doppelt verrechnet: Stunden und Material aus Regieberichten stehen nur im Regie-Block. Ausserdem behoben: Die Knoepfe "Aus Angebot" und "Aus Regiebericht" gab es bisher NUR auf normalen Rechnungen - auf der Schlussrechnung fehlten sie, deshalb bist du nicht weitergekommen. Und der Material-Teil bei "Zeit & Material" war gebaut, aber nicht erreichbar.'
 WHERE id::text LIKE 'fc6e5f12%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Baustelle abrechnen — alles auf einer Rechnung',
   'Neuer Knopf im Beleg: sammelt Auftrag, offene Regieberichte, gebuchte Stunden, Material und den Anzahlungs-Abzug in einem Schritt. Je Block die Summe, anhaken und uebernehmen. Auf Schlussrechnungen fehlten die Import-Knoepfe bisher ganz - das ist mit behoben.');
