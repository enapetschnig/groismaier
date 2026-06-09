-- ============================================================
-- Eingangsrechnungen: Mitarbeiter dürfen eigene Uploads managen.
-- ============================================================
-- Bisher haben nur Admin + Vorarbeiter RLS-Policies auf purchase_invoices.
-- Ein Mitarbeiter konnte den Menüpunkt zwar sehen (role_permissions=TRUE),
-- aber der Insert schlug still auf RLS fehl, weil keine Policy griff.
--
-- Neu: eine eigene Policy für Mitarbeiter, die ihnen erlaubt,
--   - eigene Zeilen (created_by = auth.uid()) zu lesen / zu ändern /
--     zu löschen
--   - neue Zeilen anzulegen, solange created_by = auth.uid()
-- Fremde Uploads bleiben für Mitarbeiter unsichtbar.

-- Falls das System mal eine Policy-Version angelegt hatte — sauber droppen
DROP POLICY IF EXISTS "Mitarbeiter can manage own purchase_invoices"
  ON public.purchase_invoices;

CREATE POLICY "Mitarbeiter can manage own purchase_invoices"
  ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'mitarbeiter'::app_role)
    AND created_by = auth.uid()
  )
  WITH CHECK (
    has_role(auth.uid(), 'mitarbeiter'::app_role)
    AND created_by = auth.uid()
  );

-- Sicherheitsnetz: falls role_permissions wegen einer frühen Migration
-- noch auf FALSE steht (z.B. wenn 20260422500000 auf einer Umgebung nicht
-- durchgelaufen ist), hier nochmal idempotent setzen.
INSERT INTO public.role_permissions (role, feature, can_view, can_edit)
VALUES ('mitarbeiter', 'eingangsrechnungen', TRUE, TRUE)
ON CONFLICT (role, feature) DO UPDATE
   SET can_view = TRUE, can_edit = TRUE;

-- Storage: Mitarbeiter dürfen nur eigene Uploads wieder lesen/löschen.
-- Die bestehende "Auth users can read/upload/delete"-Policy ist schon
-- offen für alle authenticated User; wir ersetzen sie durch eine
-- engere Variante, die den created_by-Kontext durch den Pfad spiegelt.
-- (MVP: lassen die offene Policy weiter bestehen, damit Upload/Preview
-- nicht kaputt geht. RLS auf der Tabelle reicht für den Datenzugriff.)

-- Diagnose
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, cmd, qual
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'purchase_invoices'
  LOOP
    RAISE NOTICE 'policy: % (cmd=%): %', r.policyname, r.cmd, r.qual;
  END LOOP;
  FOR r IN
    SELECT role, feature, can_view, can_edit
      FROM public.role_permissions
     WHERE feature = 'eingangsrechnungen'
  LOOP
    RAISE NOTICE 'role_permissions: % % can_view=% can_edit=%', r.role, r.feature, r.can_view, r.can_edit;
  END LOOP;
END $$;
