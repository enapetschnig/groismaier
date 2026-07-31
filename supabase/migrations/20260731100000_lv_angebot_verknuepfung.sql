-- ============================================================================
-- Ausschreibung → Angebot (Kundenwunsch): „einfach bepreisen — das wird dann
-- ein Angebot und kann zur Rechnung werden."
--
-- Die Verknüpfung merkt sich, welches Angebot aus dem LV entstanden ist;
-- ab da läuft alles über die normale Belegkette (Angebot → AB → Rechnung).
-- ============================================================================
ALTER TABLE public.lv_ausschreibungen
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
