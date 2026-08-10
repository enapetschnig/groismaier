-- ============================================================================
-- Beleg-Vorschläge aus dem Mail-Postfach (Kundenwunsch): Die ER-Maske schlägt
-- Mails mit Anhängen aus buchhaltung@/office@ vor. Damit Übernommenes und
-- Ausgeblendetes nicht wieder auftaucht, merken wir uns die Mail-IDs.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mail_belege_verarbeitet (
  mail_id text PRIMARY KEY,
  postfach text NOT NULL,
  aktion text NOT NULL DEFAULT 'uebernommen' CHECK (aktion IN ('uebernommen', 'ausgeblendet')),
  purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mail_belege_verarbeitet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins verwalten Mail-Beleg-Status"
  ON public.mail_belege_verarbeitet FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
