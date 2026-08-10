-- ============================================================================
-- Lernende Mail-Zuordnung (Kundenwunsch): „dass er checkt, was an welchen
-- Kunden gehört, auch wenn beim Kunden nicht die genaue Mail hinterlegt ist."
--
-- Je Kunde können beliebig viele Mailadressen bekannt sein. Befüllt wird die
-- Tabelle (a) aus dem Stammsatz und (b) von einem KI-Lauf, der unbekannte
-- Absender aus den Postfächern gegen die Kundenliste abgleicht (Anzeigename,
-- Ort, Betreffs). Der Mail-Verkehr in der Kundenmaske sucht dann über ALLE
-- bekannten Adressen plus den Namen.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kunden_mail_adressen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  adresse text NOT NULL UNIQUE,
  anzeigename text,
  quelle text NOT NULL DEFAULT 'ki' CHECK (quelle IN ('stammsatz', 'ki', 'manuell')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kunden_mail_adressen_kunde_idx ON public.kunden_mail_adressen (customer_id);

ALTER TABLE public.kunden_mail_adressen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins verwalten Kunden-Mailadressen"
  ON public.kunden_mail_adressen FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
