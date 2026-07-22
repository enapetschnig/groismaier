-- ============================================================================
-- Beleg ↔ Auftragskalkulation: dauerhafte Verknüpfung
--
-- Kundenwunsch: „Wollte ich natürlich auch die Kalkulation nochmal anpassen
-- können." — dazu muss ein Angebot wissen, aus WELCHER Kalkulation es
-- entstanden ist. Erst dann kann der Beleg-Editor die Kalkulation öffnen bzw.
-- die Positionen neu übernehmen, und die Kalkulation kann warnen, dass zu ihr
-- bereits ein Angebot existiert (statt versehentlich ein zweites anzulegen).
--
-- ON DELETE SET NULL: wird eine Kalkulation gelöscht, bleibt das Angebot
-- bestehen (es ist ein eigenständiger Beleg) — nur die Rückverknüpfung fällt
-- weg. Der Editor blendet den Hinweis dann still aus.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS kalkulation_id UUID
    REFERENCES public.kalkulationen(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.kalkulation_id IS
  'Auftragskalkulation, aus der dieser Beleg übernommen wurde (NULL = ohne Kalkulationsherkunft).';

-- Für die Rückfrage „existiert zu dieser Kalkulation schon ein Angebot?"
-- (Lookup je Kalkulation) — partiell, weil die weit überwiegende Mehrheit der
-- Belege gar keine Kalkulationsherkunft hat.
CREATE INDEX IF NOT EXISTS idx_invoices_kalkulation_id
  ON public.invoices(kalkulation_id)
  WHERE kalkulation_id IS NOT NULL;
