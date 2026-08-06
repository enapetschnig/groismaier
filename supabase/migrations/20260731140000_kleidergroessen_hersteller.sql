-- ============================================================================
-- Kleidergrößen je Hersteller (Kundenwunsch): „Kleidergröße bei Hersteller
-- Strauß, FHB, Würth … weil wir manche Hosen bei verschiedenen Herstellern
-- kaufen."
--
-- Die Größen fallen je Hersteller unterschiedlich aus — EIN Feld je
-- Mitarbeiter reicht nicht. Die bisherigen Felder kleidungsgroesse/
-- schuhgroesse bleiben als allgemeine Angabe bestehen; hier kommen beliebig
-- viele Hersteller-Einträge dazu.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.employee_groessen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  hersteller text NOT NULL,
  -- z. B. 'hose', 'jacke', 'shirt', 'schuhe' — frei erweiterbar.
  kleidungsstueck text NOT NULL DEFAULT 'hose',
  groesse text NOT NULL,
  notiz text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_groessen_emp_idx ON public.employee_groessen (employee_id);

ALTER TABLE public.employee_groessen ENABLE ROW LEVEL SECURITY;

-- Lesen: alle aktiven (die Größen-Übersicht dient der Bestellung durch das
-- Büro; nichts Vertrauliches). Schreiben: Admin/Vorarbeiter ODER der
-- Mitarbeiter selbst für den eigenen Datensatz.
DROP POLICY IF EXISTS groessen_read ON public.employee_groessen;
CREATE POLICY groessen_read ON public.employee_groessen
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS groessen_write ON public.employee_groessen;
CREATE POLICY groessen_write ON public.employee_groessen
  FOR ALL
  USING (
    has_role(auth.uid(), 'administrator'::app_role)
    OR has_role(auth.uid(), 'vorarbeiter'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'administrator'::app_role)
    OR has_role(auth.uid(), 'vorarbeiter'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );
