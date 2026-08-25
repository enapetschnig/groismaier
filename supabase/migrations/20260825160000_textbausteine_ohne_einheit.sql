-- Textbausteine drucken kein "0,00 Stk." mehr (Kundenmeldung 25.08.2026).
--
-- Eine reine Textzeile hat keine Menge, keinen Preis und KEINE Einheit -
-- nur dann druckt der Beleg ausschliesslich den Text (istTextzeile in
-- src/lib/invoiceHtml.ts). Beim Laden aus der Datenbank wurde eine leere
-- Einheit bisher auf "Stk." gesetzt; dadurch bekamen bereits gespeicherte
-- Textbausteine (Einleitungstext ueber dem Aufbau, Nachtext, von Hand
-- eingefuegte Texte) die Spalte "0,00 Stk." aufs Papier.
--
-- Diese Migration raeumt den Bestand auf: betroffen sind ausschliesslich
-- Zeilen OHNE jede Zahl (Menge, Einzelpreis und Gesamtpreis je 0) - also
-- Textzeilen bzw. leere Positionen. Artikel-Aufzaehlungen der Aufbauten
-- tragen ihre Flaechenmenge und bleiben unberuehrt.
DO $$
DECLARE anzahl INTEGER;
BEGIN
  UPDATE invoice_items
     SET einheit = ''
   WHERE COALESCE(menge, 0) = 0
     AND COALESCE(einzelpreis, 0) = 0
     AND COALESCE(gesamtpreis, 0) = 0
     AND COALESCE(einheit, '') <> '';
  GET DIAGNOSTICS anzahl = ROW_COUNT;
  RAISE NOTICE 'Textbausteine ohne Einheit gesetzt: %', anzahl;
END $$;
