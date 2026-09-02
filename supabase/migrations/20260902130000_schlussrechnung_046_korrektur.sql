-- ============================================================================
--  Schlussrechnung 2026-046 (Schindelboeck) berichtigen — Meldung 3778459f
-- ============================================================================
--
-- Befund (Daten gelesen, nicht geraten):
--   * Position 28 "Geleistete Zahlung - Anzahlungsrechnung 2026-044" stand
--     mit +1,00 EUR netto drin (Handversuch) statt als steuerfreier
--     Brutto-ABZUG von 14.400,00 - der Kunde haette 14.400 EUR zu viel
--     bezahlt.
--   * Die bezahlte Rechnung 2026-044 hing an KEINEM Projekt, nur an der
--     Belegkette; deshalb fand "Baustelle abrechnen" sie nicht.
--
-- Nur dieser eine Beleg, nur solange Position 28 noch genau so dasteht.

UPDATE public.invoice_items
   SET beschreibung = 'Abzug Rechnung 2026-044 vom 18.08.2026 (brutto, MwSt-frei)',
       kurztext     = 'Abzug Rechnung 2026-044 vom 18.08.2026',
       menge        = 1,
       einheit      = 'pausch.',
       einzelpreis  = -14400,
       gesamtpreis  = -14400,
       mwst_exempt  = true
 WHERE invoice_id = 'af88493c-295f-426f-a682-f2e8b9857a7b'
   AND position = 28
   AND mwst_exempt = false
   AND gesamtpreis = 1;

-- Kopfsummen aus den Positionen neu rechnen (mwst_exempt = Brutto-Abzug).
UPDATE public.invoices i
   SET netto_summe  = s.netto,
       mwst_betrag  = ROUND(s.netto * 0.20, 2),
       brutto_summe = ROUND(s.netto * 1.20, 2) + s.abzug
  FROM (
    SELECT ROUND(SUM(CASE WHEN mwst_exempt THEN 0 ELSE gesamtpreis END)::numeric, 2) AS netto,
           ROUND(SUM(CASE WHEN mwst_exempt THEN gesamtpreis ELSE 0 END)::numeric, 2) AS abzug
      FROM public.invoice_items
     WHERE invoice_id = 'af88493c-295f-426f-a682-f2e8b9857a7b'
  ) s
 WHERE i.id = 'af88493c-295f-426f-a682-f2e8b9857a7b'
   AND i.mwst_satz = 20;

-- Die bezahlte Rechnung 2026-044 gehoert zum selben Bauvorhaben (Kette:
-- sie ist der Eltern-Beleg der Schlussrechnung). Projekt nachtragen, damit
-- Nachkalkulation und Baustellen-Abrechnung sie sehen.
UPDATE public.invoices
   SET project_id = '26a06583-07e0-4da8-b219-a8edc32c9ff7'
 WHERE id = '7f930e08-f142-44e9-8788-966a3d60f3a0'
   AND project_id IS NULL;

-- Meldungen abschliessen
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Geprueft und berichtigt: 1) Der Rabatt wurde NICHT doppelt abgezogen - die rote Summenzeile war nur eine Aufschluesselung. Sie ist jetzt weg; der Rabatt steht nur noch je Zeile in der Rabattspalte. 2) Die "14 Tage" kamen aus dem Schlusstext-Baustein, der bei "sofort" pauschal 14 einsetzte - jetzt steht dort "sofort faellig" (bzw. das echte Datum/die echte Frist). 3) Die geleisteten Zahlungen stehen jetzt als eigenes Kapitel "Abzueglich geleistete Zahlungen" mit fetter Ueberschrift unter dem Bruttobetrag, je Zahlung eine Zeile, darunter der Restbetrag. Deine Handzeile (Position 28, +1 EUR) habe ich in den echten Abzug von 14.400 EUR umgewandelt - der Restbetrag ist jetzt 11.044,07 EUR. Bitte den Beleg einmal neu oeffnen.'
 WHERE id::text LIKE '3778459f%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: Auf einem ausgestellten Beleg gibt es fuer Administratoren oben den Knopf "Korrektur". Er gibt genau das frei, was den Betrag nicht beruehrt - Kundenblock (Name, Adresse, Anrede) sowie Vor- und Schlusstext. Positionen, Betraege, Datum und Nummer bleiben gesperrt; dafuer bleibt Storno der richtige Weg. "Heidi" kannst du damit jetzt dazuschreiben.'
 WHERE id::text LIKE 'db6cc91c%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Schlussrechnung: Zahlungen als eigenes Kapitel',
   'Geleistete Zahlungen stehen jetzt mit fetter Ueberschrift unter dem Bruttobetrag, je Zahlung eine Zeile, darunter der Restbetrag. Die rote Rabatt-Summenzeile ist weg - der Rabatt steht nur noch je Position.'),
  ('Korrektur an ausgestellten Belegen',
   'Fuer Administratoren: Knopf "Korrektur" oben im Beleg gibt Kundendaten sowie Vor-/Schlusstext frei. Betraege, Positionen, Datum und Nummer bleiben gesperrt.'),
  ('Zahlungsfrist im Schlusstext stimmt',
   'Bei "Zahlbar sofort" steht im Schlusstext nicht mehr "innerhalb 14 Tagen", sondern "sofort faellig"; bei individuellem Datum das Datum.');
