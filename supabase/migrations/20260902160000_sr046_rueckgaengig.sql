-- ============================================================================
--  RUECKGAENGIG: Datenaenderung an Schlussrechnung 2026-046 (02.09.2026)
-- ============================================================================
--
-- Anweisung Christoph: An vorhandenen Rechnungen darf nichts geaendert
-- werden - auch nicht "Geleistete Zahlungen". Die Korrektur aus Migration
-- 20260902130000 wird deshalb exakt auf die vorher gelesenen Werte
-- zurueckgesetzt. Nur diese eine Rechnung, nur wenn sie noch so dasteht,
-- wie ich sie hinterlassen habe.

-- Position 28: Christians urspruengliche Handzeile wiederherstellen
UPDATE public.invoice_items
   SET beschreibung = 'Geleistete Zahlung - Anzahlungsrechnung 2026-044',
       kurztext     = 'Geleistete Zahlung - Anzahlungsrechnung 2026-044',
       menge        = 1,
       einheit      = 'Pauschal',
       einzelpreis  = 1,
       gesamtpreis  = 1,
       mwst_exempt  = false
 WHERE invoice_id = 'af88493c-295f-426f-a682-f2e8b9857a7b'
   AND position = 28
   AND mwst_exempt = true
   AND gesamtpreis = -14400;

-- Kopfsummen exakt wie vor meiner Aenderung
UPDATE public.invoices
   SET netto_summe  = 21204.39,
       mwst_betrag  = 4240.88,
       brutto_summe = 25445.27
 WHERE id = 'af88493c-295f-426f-a682-f2e8b9857a7b'
   AND brutto_summe = 11044.07;

-- Rechnung 2026-044: Projekt-Zuordnung wieder entfernen (war NULL)
UPDATE public.invoices
   SET project_id = NULL
 WHERE id = '7f930e08-f142-44e9-8788-966a3d60f3a0'
   AND project_id = '26a06583-07e0-4da8-b219-a8edc32c9ff7';

-- Antwort an Christian anpassen: Darstellung geaendert, Daten NICHT
UPDATE public.aenderungswuensche SET antwort =
  'Geprueft: 1) Der Rabatt wurde NICHT doppelt abgezogen - die rote Summenzeile war nur eine Aufschluesselung; sie ist jetzt weg, der Rabatt steht nur noch je Zeile. 2) Die "14 Tage" kamen aus dem Schlusstext-Baustein, der bei "sofort" pauschal 14 einsetzte - behoben, dort steht jetzt "sofort faellig". 3) Geleistete Zahlungen erscheinen im PDF als eigenes Kapitel "Abzueglich geleistete Zahlungen" mit fetter Ueberschrift unter dem Bruttobetrag, darunter der Restbetrag - sobald eine Zahlung als Abzugszeile im Beleg steht. An deiner Rechnung 2026-046 habe ich NICHTS veraendert: Dort steht die Zahlung derzeit als Position 28 mit +1,00 EUR (statt als Abzug von 14.400 EUR brutto), der Restbetrag ist daher noch 25.445,27 EUR. Der saubere Weg: die 2026-046 stornieren und die Schlussrechnung neu ueber "Kopieren in -> Schlussrechnung" beim Angebot erzeugen - dann wird die Anzahlung 2026-044 automatisch als Abzug angehaengt (bzw. ueber "Baustelle abrechnen" anhaken). Wenn du willst, gehen wir das kurz gemeinsam durch.'
 WHERE id::text LIKE '3778459f%';
