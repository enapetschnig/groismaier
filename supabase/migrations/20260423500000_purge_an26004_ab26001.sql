-- ============================================================
-- Einmaliger Cleanup: Angebot AN26004 und Auftragsbestätigung AB26001
-- löschen, Laufnummern in number_ranges freigeben.
-- ============================================================

DO $$
DECLARE
  r_angebot_id UUID;
  r_ab_id UUID;
  r_angebot_laufnummer INTEGER;
  r_ab_laufnummer INTEGER;
BEGIN
  -- Angebot finden: erlaubt Varianten wie AN26004 / AN-2026-004 / AN_2026_004
  SELECT id, laufnummer INTO r_angebot_id, r_angebot_laufnummer
  FROM public.invoices
  WHERE typ = 'angebot'
    AND (nummer IN ('AN26004','AN-2026-004','AN_2026_004','AN2026004')
         OR replace(replace(replace(nummer,'-',''),'_',''),' ','') = 'AN26004')
  LIMIT 1;

  IF r_angebot_id IS NOT NULL THEN
    DELETE FROM public.invoice_items WHERE invoice_id = r_angebot_id;
    DELETE FROM public.invoices WHERE id = r_angebot_id;
    RAISE NOTICE 'Angebot gelöscht: id=%, laufnummer=%', r_angebot_id, r_angebot_laufnummer;
  ELSE
    RAISE NOTICE 'Kein Angebot AN26004/AN_2026_004 gefunden.';
  END IF;

  -- Auftragsbestätigung finden
  SELECT id, laufnummer INTO r_ab_id, r_ab_laufnummer
  FROM public.invoices
  WHERE typ = 'auftragsbestaetigung'
    AND (nummer IN ('AB26001','AB-2026-001','AB_2026_001','AB2026001')
         OR replace(replace(replace(nummer,'-',''),'_',''),' ','') = 'AB26001')
  LIMIT 1;

  IF r_ab_id IS NOT NULL THEN
    DELETE FROM public.invoice_items WHERE invoice_id = r_ab_id;
    DELETE FROM public.invoices WHERE id = r_ab_id;
    RAISE NOTICE 'Auftragsbestätigung gelöscht: id=%, laufnummer=%', r_ab_id, r_ab_laufnummer;
  ELSE
    RAISE NOTICE 'Keine Auftragsbestätigung AB26001 gefunden.';
  END IF;

  -- Laufnummer in number_ranges auf die tatsächlich höchste laufnummer
  -- des Typs zurücksetzen (so bleiben evtl. bereits belegte Nummern
  -- erhalten und die nächste Vergabe nimmt die nächste freie).
  UPDATE public.number_ranges nr
  SET aktuelle_nummer = COALESCE(
    (SELECT MAX(laufnummer) FROM public.invoices WHERE typ = 'angebot'),
    0
  )
  WHERE typ = 'angebot';

  UPDATE public.number_ranges nr
  SET aktuelle_nummer = COALESCE(
    (SELECT MAX(laufnummer) FROM public.invoices WHERE typ = 'auftragsbestaetigung'),
    0
  )
  WHERE typ = 'auftragsbestaetigung';

  RAISE NOTICE 'Laufnummern für angebot + auftragsbestaetigung neu gesetzt.';
END $$;
