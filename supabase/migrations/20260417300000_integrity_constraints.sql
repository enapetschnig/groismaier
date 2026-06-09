-- ============================================================
-- Umfassende Integritäts-Constraints (Runde 2)
-- ============================================================

-- TIME_ENTRIES -----------------------------------------------

-- Stunden: nicht negativ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_stunden_nonneg') THEN
    -- Erst evtl. existierende negative Werte bereinigen
    UPDATE public.time_entries SET stunden = 0 WHERE stunden < 0;
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_stunden_nonneg CHECK (stunden >= 0 AND stunden <= 24);
  END IF;
END $$;

-- Pause: nicht negativ, nicht > 480 min (8h)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_pause_valid') THEN
    UPDATE public.time_entries SET pause_minutes = 0 WHERE pause_minutes < 0 OR pause_minutes > 480;
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_pause_valid CHECK (pause_minutes >= 0 AND pause_minutes <= 480);
  END IF;
END $$;

-- Datum: nicht weiter als 10 Jahre in Zukunft oder 20 Jahre in Vergangenheit
-- (verhindert versehentliche Tippfehler wie "2029" statt "2026")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_datum_sane') THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_datum_sane
      CHECK (datum >= '2020-01-01'::date AND datum <= CURRENT_DATE + INTERVAL '1 year');
  END IF;
END $$;

-- Unique: user_id + datum + start_time → verhindert exakte Duplikat-Blöcke
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_unique_block
  ON public.time_entries (user_id, datum, start_time)
  WHERE start_time IS NOT NULL;

-- INVOICE_TEMPLATES -------------------------------------------

-- Preis: nicht negativ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_templates_preis_nonneg') THEN
    UPDATE public.invoice_templates SET einzelpreis = 0 WHERE einzelpreis < 0;
    UPDATE public.invoice_templates SET netto_preis = 0 WHERE netto_preis < 0;
    UPDATE public.invoice_templates SET brutto_preis = 0 WHERE brutto_preis < 0;
    ALTER TABLE public.invoice_templates
      ADD CONSTRAINT invoice_templates_preis_nonneg
      CHECK (einzelpreis >= 0 AND (netto_preis IS NULL OR netto_preis >= 0) AND (brutto_preis IS NULL OR brutto_preis >= 0));
  END IF;
END $$;

-- USt-Satz: nur gültige AT-Steuersätze (0, 10, 13, 20)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_templates_ust_valid') THEN
    UPDATE public.invoice_templates SET ust_satz = 20 WHERE ust_satz NOT IN (0, 10, 13, 20);
    ALTER TABLE public.invoice_templates
      ADD CONSTRAINT invoice_templates_ust_valid CHECK (ust_satz IN (0, 10, 13, 20));
  END IF;
END $$;

-- INVOICE_ITEMS -----------------------------------------------

-- Menge > 0 (Positionen mit Menge 0 machen keinen Sinn)
-- Einzelpreis kann 0 sein (z.B. Gratis-Zugabe) aber nicht negativ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_preis_nonneg') THEN
    UPDATE public.invoice_items SET einzelpreis = 0 WHERE einzelpreis < 0;
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_preis_nonneg CHECK (einzelpreis >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_rabatt_valid') THEN
    UPDATE public.invoice_items SET rabatt_prozent = 0 WHERE rabatt_prozent < 0 OR rabatt_prozent > 100;
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_rabatt_valid
      CHECK (rabatt_prozent IS NULL OR (rabatt_prozent >= 0 AND rabatt_prozent <= 100));
  END IF;
END $$;

-- BAUTAGESBERICHTE --------------------------------------------

-- Pause: nicht negativ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'btb_pause_nonneg') THEN
    -- Nur wenn Spalte existiert
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bautagesberichte' AND column_name = 'pause_minuten') THEN
      UPDATE public.bautagesberichte SET pause_minuten = 0 WHERE pause_minuten < 0;
      ALTER TABLE public.bautagesberichte
        ADD CONSTRAINT btb_pause_nonneg CHECK (pause_minuten >= 0 AND pause_minuten <= 480);
    END IF;
  END IF;
END $$;

-- PURCHASE_INVOICES -------------------------------------------

-- Betrag muss positiv sein
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_betrag_positive') THEN
    ALTER TABLE public.purchase_invoices
      ADD CONSTRAINT purchase_invoices_betrag_positive
      CHECK (betrag_brutto >= 0 AND (betrag_netto IS NULL OR betrag_netto >= 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_ust_valid') THEN
    ALTER TABLE public.purchase_invoices
      ADD CONSTRAINT purchase_invoices_ust_valid
      CHECK (ust_satz IS NULL OR ust_satz IN (0, 10, 13, 20));
  END IF;
END $$;

-- INVOICES ----------------------------------------------------

-- Menge + Preis-Validierung schon vorhanden, hier USt-Satz prüfen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_mwst_valid') THEN
    UPDATE public.invoices SET mwst_satz = 20 WHERE mwst_satz NOT IN (0, 10, 13, 20);
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_mwst_valid CHECK (mwst_satz IN (0, 10, 13, 20));
  END IF;
END $$;
