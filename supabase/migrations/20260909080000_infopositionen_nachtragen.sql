-- ============================================================================
--  Infopositionen in drei Angeboten nachtragen (Freigabe Christoph 09.09.2026)
-- ============================================================================
-- Diese vier Zeilen tragen den Text "INFOPOSITION: ...", hatten das Kennzeichen
-- ist_info aber verloren (Fehler beim "Positionen neu uebernehmen", behoben am
-- 08.09.). Ihr Betrag zaehlte dadurch in die Angebotssumme.
--
-- NACHWEIS je Zeile: In der verknuepften Kalkulation ist der gleichnamige
-- Aufbau als "optional" gefuehrt.
--   A-2026-034  Pos  13  Geruestmiete ab der 5. Woche        250,00
--               -> Kalkulation "Knapp - Japons/Allgemein", isOptional
--   A-2026-036  Pos   9  Geruestmiete ab der 5. Woche        260,00
--               -> Kalkulation "Alfred Roschek", isOptional
--   A-2026-037  Pos  83  Innenwand - 100 mm (Kopie)       18.842,14
--   A-2026-037  Pos 129  Flachdach Brettsperrholz/EPS     54.302,01
--               -> Kalkulation "Gruber-Langau", beide isOptional
--
-- STAND VORHER (fuer ein etwaiges Zurueckdrehen):
--   A-2026-034  netto 345212.86  mwst 69042.57  brutto 414255.43
--   A-2026-036  netto 126077.18  mwst 25215.44  brutto 151292.62
--   A-2026-037  netto 442498.61  mwst 88499.72  brutto 530998.33
--
-- NICHT angefasst: Positionstexte, Betraege der Zeilen, Nummern, Datum, Status
-- und jeder andere Beleg. Die Kopfsummen werden nach genau der Formel der App
-- (src/lib/belegSummen.ts) aus den Positionen neu berechnet.

DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    'c6bc3d0c-02cf-4962-ab19-4b89a21070ac'::uuid,  -- A-2026-034
    '5ddfa026-5de8-4536-9a8d-b16ee4ee452b'::uuid,  -- A-2026-036
    'ab98d2dd-97e7-45b2-95d3-ce0cf284fc60'::uuid   -- A-2026-037
  ];
  v_treffer int;
  v_falsch  int;
BEGIN
  -- 1) Sicherung: Genau vier Zeilen, alle mit dem Praefix, alle in diesen drei
  --    Belegen, alle bisher ohne Kennzeichen. Sonst wird nichts geaendert.
  SELECT count(*) INTO v_treffer
    FROM public.invoice_items
   WHERE invoice_id = ANY(v_ids)
     AND upper(btrim(beschreibung)) LIKE 'INFOPOSITION:%'
     AND ist_info IS NOT TRUE;
  IF v_treffer <> 4 THEN
    RAISE EXCEPTION 'Abbruch: % Zeilen gefunden, erwartet waren 4 - es wurde nichts geaendert.', v_treffer;
  END IF;

  -- Und ausserhalb dieser drei Belege darf es keine weitere solche Zeile geben.
  SELECT count(*) INTO v_falsch
    FROM public.invoice_items
   WHERE NOT (invoice_id = ANY(v_ids))
     AND upper(btrim(beschreibung)) LIKE 'INFOPOSITION:%'
     AND ist_info IS NOT TRUE;
  IF v_falsch <> 0 THEN
    RAISE EXCEPTION 'Abbruch: % weitere ungekennzeichnete Infopositionen in anderen Belegen.', v_falsch;
  END IF;

  -- 2) Kennzeichen setzen.
  UPDATE public.invoice_items
     SET ist_info = true
   WHERE invoice_id = ANY(v_ids)
     AND upper(btrim(beschreibung)) LIKE 'INFOPOSITION:%'
     AND ist_info IS NOT TRUE;

  -- 3) Kopfsummen aus den Positionen neu berechnen - dieselbe Formel wie die
  --    App: Infopositionen und Detailzeilen zaehlen nicht; MwSt-freie Zeilen
  --    sind Brutto-Abzuege nach dem Bruttobetrag.
  WITH teile AS (
    SELECT i.id,
           coalesce(sum(CASE WHEN NOT coalesce(it.mwst_exempt,false) THEN
             CASE WHEN coalesce(it.ist_info,false) THEN 0
                  WHEN btrim(coalesce(it.gruppe,'')) <> '' AND NOT coalesce(it.ist_gruppensumme,false) THEN 0
                  ELSE coalesce(it.gesamtpreis,0) END END), 0) AS netto_pos,
           coalesce(sum(CASE WHEN coalesce(it.mwst_exempt,false) THEN
             CASE WHEN coalesce(it.ist_info,false) THEN 0
                  WHEN btrim(coalesce(it.gruppe,'')) <> '' AND NOT coalesce(it.ist_gruppensumme,false) THEN 0
                  ELSE coalesce(it.gesamtpreis,0) END END), 0) AS exempt
      FROM public.invoices i
      LEFT JOIN public.invoice_items it ON it.invoice_id = i.id
     WHERE i.id = ANY(v_ids)
     GROUP BY i.id
  ), gerechnet AS (
    SELECT i.id,
           round(t.netto_pos - CASE WHEN coalesce(i.rabatt_prozent,0) > 0
                                    THEN round(t.netto_pos * i.rabatt_prozent / 100, 2)
                                    ELSE coalesce(i.rabatt_betrag,0) END, 2) AS netto,
           t.exempt
      FROM public.invoices i JOIN teile t ON t.id = i.id
  )
  UPDATE public.invoices i
     SET netto_summe  = g.netto,
         mwst_betrag  = CASE WHEN coalesce(i.reverse_charge,false) THEN 0
                             ELSE round(g.netto * coalesce(i.mwst_satz,0) / 100, 2) END,
         brutto_summe = round(g.netto
                              + CASE WHEN coalesce(i.reverse_charge,false) THEN 0
                                     ELSE round(g.netto * coalesce(i.mwst_satz,0) / 100, 2) END
                              + g.exempt, 2)
    FROM gerechnet g
   WHERE i.id = g.id;

  -- 4) Kontrolle: Kommt genau heraus, was angekuendigt war? Sonst alles zurueck.
  SELECT count(*) INTO v_falsch FROM public.invoices
   WHERE (nummer = 'A-2026-034' AND (netto_summe <> 344962.86 OR brutto_summe <> 413955.43))
      OR (nummer = 'A-2026-036' AND (netto_summe <> 125817.18 OR brutto_summe <> 150980.62))
      OR (nummer = 'A-2026-037' AND (netto_summe <> 369354.46 OR brutto_summe <> 443225.35));
  IF v_falsch <> 0 THEN
    RAISE EXCEPTION 'Abbruch: % Beleg(e) ergaben nicht die angekuendigten Summen - alles zurueckgerollt.', v_falsch;
  END IF;
END $$;
