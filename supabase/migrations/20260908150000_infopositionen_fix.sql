-- ============================================================================
--  Aenderungswunsch 08.09.2026 (a401c851): Infopositionen zaehlten mit
-- ============================================================================
-- Keine Belegdaten werden angefasst - die drei betroffenen Angebote behalten
-- ihre gespeicherten Summen, bis Christian sie selbst kennzeichnet.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Ursache gefunden und behoben: Beim Knopf "Positionen neu uebernehmen" (im Angebot, nach einer Aenderung in der Kalkulation) verlor die Infoposition ihre Kennzeichnung. Der Text "INFOPOSITION: ..." blieb stehen, der Betrag zaehlte aber wieder in die Angebotssumme - man sieht es dem Beleg nicht an. Das Uebernehmen laeuft jetzt fuer alle Wege ueber dieselbe Stelle im Programm, ein Test prueft den ganzen Weg (Kalkulation - Angebot - neu uebernehmen), damit es auch bei kuenftigen Erweiterungen nicht wiederkommt. Ausserdem: (1) Rechts in der Summenspalte steht bei einer Infoposition jetzt gar nichts mehr - der Einheitspreis bleibt sichtbar, damit der Kunde die Variante bewerten kann. (2) Neuer Schalter "i" in jeder Positionszeile: damit kennzeichnest du eine Zeile selbst als Infoposition oder hebst das wieder auf. (3) Ist in einem Angebot eine Zeile "INFOPOSITION: ..." nicht gekennzeichnet, steht oben ein Hinweis mit dem betroffenen Betrag und dem Knopf "Jetzt kennzeichnen". BETROFFEN sind drei bestehende Angebote: A-2026-037 (Gruber, 73.144,15 netto zu viel - statt 530.998,33 brutto waeren es 443.225,35), A-2026-036 (Roschek, 260,-) und A-2026-034 (Knapp, 250,-). An diesen Angeboten wurde NICHTS veraendert: Oeffne sie, druecke "Jetzt kennzeichnen" und speichere - dann stimmt die Summe. So entscheidest du, ob und wann sich der Preis aendert.'
WHERE id::text LIKE 'a401c851%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Infopositionen zaehlen nicht mehr mit',
   'Beim "Positionen neu uebernehmen" verlor eine Infoposition bisher ihre Kennzeichnung und wurde in die Angebotssumme gerechnet. Das ist behoben. Neu: Schalter "i" je Position zum Kennzeichnen, ein Hinweis im Angebot, wenn eine Infoposition nicht gekennzeichnet ist, und in der Summenspalte steht bei Infopositionen nichts mehr.');
