-- ============================================================================
-- Holzbau Lutz: Materialkalkulation
-- ----------------------------------------------------------------------------
-- Modell (nach der Excel "Z_Kalkulation Vorlage 2026"):
--   Materialkosten/EH = ek_preis * (1 + verschnitt_prozent/100) * (1 + aufschlag_prozent/100)
--   Lohnkosten/EH     = (arbeitszeit_minuten / 60) * stundensatz
--   Einzelpreis (VK)  = Materialkosten + befestigung_preis + sonstiges_preis + Lohnkosten
--
-- Diese Felder werden auf drei Ebenen gespeichert:
--   1. invoice_templates  — Material-/Leistungskatalog (Stamm-Kalkulation)
--   2. invoice_items       — Snapshot je Angebots-/Rechnungsposition (im Angebot
--                            anpassbar; Einzelpreis wird daraus neu berechnet)
--   3. invoices            — optionaler globaler Aufschlag-Override fürs Angebot
-- ============================================================================

-- 1) Material-/Leistungskatalog ------------------------------------------------
-- Hinweis: ek_netto, vk_netto, aufschlag_prozent, vk_preis_manuell existieren
-- bereits (material_sets_v2). EK = ek_netto. Wir ergänzen nur die Excel-
-- Dimensionen Verschnitt, Befestigung, Sonstiges und Lohn (Arbeitszeit·Satz).
ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS ist_kalkuliert       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verschnitt_prozent   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS befestigung_preis    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sonstiges_preis      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arbeitszeit_minuten  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stundensatz          numeric NOT NULL DEFAULT 52;

COMMENT ON COLUMN public.invoice_templates.ist_kalkuliert IS 'vk_netto/Einzelpreis wird aus Kalkulationsfeldern (ek_netto, Verschnitt, Aufschlag, Lohn, Zuschläge) berechnet';
COMMENT ON COLUMN public.invoice_templates.verschnitt_prozent IS 'Verschnitt-Zuschlag in % auf den EK (z.B. 15 = +15%)';
COMMENT ON COLUMN public.invoice_templates.aufschlag_prozent IS 'Material-Aufschlag (Marge) in % (z.B. 18 = +18%)';
COMMENT ON COLUMN public.invoice_templates.arbeitszeit_minuten IS 'Montage-/Arbeitszeit in Minuten pro Einheit';
COMMENT ON COLUMN public.invoice_templates.stundensatz IS 'Lohnsatz in EUR/h (Standard 52, Regie 50)';

-- 2) Positions-Snapshot (im Angebot anpassbar) --------------------------------
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS ist_kalkuliert       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kalkulation_template_id uuid REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ek_preis             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verschnitt_prozent   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aufschlag_prozent    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS befestigung_preis    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sonstiges_preis      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arbeitszeit_minuten  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stundensatz          numeric NOT NULL DEFAULT 52;

-- 3) Angebots-/Rechnungs-Override ---------------------------------------------
-- Wenn gesetzt (nicht NULL), überschreibt dieser Wert den Material-Aufschlag
-- aller kalkulierten Positionen des Dokuments (schneller Angebots-weiter Hebel).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS kalkulation_aufschlag_override numeric;

COMMENT ON COLUMN public.invoices.kalkulation_aufschlag_override IS 'Optionaler globaler Material-Aufschlag (%) für alle kalkulierten Positionen dieses Dokuments';
