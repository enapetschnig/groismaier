-- ============================================================
-- Material-Sets v2: EK/VK-Split, Set-Kalkulation, Snapshot
-- ============================================================
-- 1) Pro Material: ek_netto (Einkauf) + vk_netto (Verkauf).
--    Backfill: EK = VK aus bestehenden Preisen, Marge startet bei 0 %.
-- 2) Pro Set: bezugseinheit + aufschlag_prozent + vk_preis_manuell
--    (TRUE = Override, FALSE = Auto-Kalkulation aus Komponenten).
-- 3) Rechnungs-Positionen bekommen set_template_id + set_snapshot
--    (JSONB), damit Summary-Zeilen in der Rechnung self-contained
--    sind — auch wenn das Set später geändert oder gelöscht wird.

-- ------------------------------------------------------------
-- Block 1: invoice_templates erweitern
-- ------------------------------------------------------------
ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS ek_netto NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS vk_netto NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS bezugseinheit TEXT,
  ADD COLUMN IF NOT EXISTS aufschlag_prozent NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vk_preis_manuell BOOLEAN DEFAULT FALSE;

-- Backfill: EK = VK aus netto_preis bzw. einzelpreis.
-- Nur dort setzen, wo noch NULL — damit mehrfaches Ausführen idempotent bleibt.
UPDATE public.invoice_templates
   SET ek_netto = COALESCE(netto_preis, einzelpreis, 0)
 WHERE ek_netto IS NULL;

UPDATE public.invoice_templates
   SET vk_netto = COALESCE(netto_preis, einzelpreis, 0)
 WHERE vk_netto IS NULL;

-- Default für neu angelegte Materialien: vk_netto = 0 erlaubt, aber kein NULL.
-- (Keine NOT NULL-Constraint, damit Frontend Schritt-für-Schritt Insert machen kann.)

COMMENT ON COLUMN public.invoice_templates.ek_netto IS
  'Einkaufspreis netto. Basis für Marge und Set-Kalkulation.';
COMMENT ON COLUMN public.invoice_templates.vk_netto IS
  'Verkaufspreis netto. Primary-Wert für Rechnungszeilen. einzelpreis/netto_preis werden beim Speichern gespiegelt (Legacy).';
COMMENT ON COLUMN public.invoice_templates.bezugseinheit IS
  'Nur bei ist_set=TRUE: z.B. m², lfm, Stk. Definiert, worauf sich die Komponenten-Mengen beziehen.';
COMMENT ON COLUMN public.invoice_templates.aufschlag_prozent IS
  'Nur bei ist_set=TRUE: Aufschlag in % auf die Σ EK der Komponenten für Auto-VK.';
COMMENT ON COLUMN public.invoice_templates.vk_preis_manuell IS
  'TRUE = vk_netto ist ein manueller Override, FALSE = vk_netto wird aus Komponenten+Aufschlag errechnet.';

-- ------------------------------------------------------------
-- Block 2: invoice_items — Set-Snapshot
-- ------------------------------------------------------------
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS set_template_id UUID REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS set_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_invoice_items_set_template
  ON public.invoice_items(set_template_id) WHERE set_template_id IS NOT NULL;

COMMENT ON COLUMN public.invoice_items.set_template_id IS
  'Wenn gesetzt: diese Zeile ist eine Set-Summary-Zeile. Zeigt auf das Set im Katalog. ON DELETE SET NULL, damit die Rechnung beim Löschen des Sets nicht kaputtgeht — Snapshot reicht.';
COMMENT ON COLUMN public.invoice_items.set_snapshot IS
  'JSON-Dump der Stückliste zum Zeitpunkt der Rechnungserstellung. Schema: {bezugseinheit, aufschlag_prozent, komponenten:[{name,einheit,menge,ek,vk}]}. Wird NICHT auf PDF/HTML gerendert — nur interne Nachkalkulation.';
