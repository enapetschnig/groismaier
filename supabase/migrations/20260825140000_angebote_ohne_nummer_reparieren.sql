-- Angebote/AB/Lieferscheine mit Platzhalter-Nummer reparieren
-- (Kundenmeldung 25.08.2026: "Belegnummer fehlt noch ... Drucken ausgegraut").
--
-- Ursache: Nicht-rechnungsartige Belege starten im Status "entwurf" (nur fuer
-- die Belegliste), bekamen dadurch aber faelschlich eine ENTWURF-Platzhalter-
-- Nummer. Sie kennen keinen "Erstellen"-Schritt, der den Platzhalter gegen die
-- echte Nummer tauscht - also blieben sie ohne Nummer und liessen sich weder
-- drucken noch senden. Der Code vergibt Platzhalter ab jetzt nur noch fuer
-- rechnungsartige Belege; diese Migration holt die Nummern der bereits
-- betroffenen Belege nach (in Anlagereihenfolge, ueber den regulaeren
-- Nummernkreis).
DO $$
DECLARE
  r RECORD;
  neue_nummer TEXT;
  anzahl INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, typ, jahr
      FROM invoices
     WHERE nummer LIKE 'ENTWURF-%'
       AND typ NOT IN ('rechnung', 'anzahlungsrechnung', 'schlussrechnung', 'gutschrift')
     ORDER BY created_at
  LOOP
    neue_nummer := public.next_document_number(r.typ, r.jahr);
    UPDATE invoices
       SET nummer = neue_nummer,
           laufnummer = COALESCE(NULLIF(substring(neue_nummer from '(\d+)$'), '')::INTEGER, 1)
     WHERE id = r.id;
    anzahl := anzahl + 1;
  END LOOP;
  RAISE NOTICE 'Belege mit nachgezogener Nummer: %', anzahl;
END $$;
