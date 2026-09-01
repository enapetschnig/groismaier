-- Nachtrag 01.09.: "uebersichtlicher, die einzelnen Positionen aufgeschluesselt,
-- und wenn schon mal eine Arbeitszeit in eine Rechnung reingeschrieben wurde
-- dann unter verrechnet - aber ich will ALLE Sachen von diesem Projekt sehen."
UPDATE public.aenderungswuensche SET antwort =
  '"Baustelle abrechnen" zeigt jetzt ALLES, was dem Projekt zugeordnet ist - nichts wird mehr weggelassen. Sieben Bloecke zum Aufklappen, in jedem die einzelnen Positionen mit Menge x Preis = Summe, jede Zeile einzeln anhakbar: Auftrag, Regieberichte (Stunden x Mitarbeiter, Material, Maschinen), gebuchte Arbeitszeiten, Materialbuchungen, Lieferscheine, Eingangsrechnungen (mit Aufschlag) und die bereits gestellten Rechnungen als Abzug - dort steht je Rechnung der Zahlungsstand (bezahlt / teilbezahlt / offen). Was schon auf einer Rechnung steht, ist mit "verrechnet in <Nummer>" gekennzeichnet und nicht vorgewaehlt - sichtbar bleibt es aber. Arbeitszeiten und Materialbuchungen bekommen diesen Vermerk ab jetzt automatisch, sobald sie uebernommen und der Beleg gespeichert wurde.'
 WHERE id::text LIKE 'fc6e5f12%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Baustelle abrechnen: alles aufgeschluesselt',
   'Jeder Block laesst sich aufklappen - jede Position einzeln anhakbar mit Menge, Preis und Summe. Bereits Verrechnetes steht mit Vermerk dabei statt zu fehlen, und bei den gestellten Rechnungen siehst du den Zahlungsstand (bezahlt / teilbezahlt / offen).');
