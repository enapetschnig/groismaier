-- ============================================================================
-- Regiebericht-Material: Rechte am BERICHT, nicht an der einzelnen Zeile.
--
-- Bisher galt für disturbance_materials:
--   SELECT: jeder aktive Benutzer (alle Materialzeilen aller Berichte)
--   UPDATE/DELETE: nur auth.uid() = user_id (Ersteller der ZEILE)
--
-- Folge im Alltag: Trägt Mitarbeiter A eine Materialzeile in einen Bericht
-- ein und öffnet Kollege B denselben Bericht, kann B die Zeile im Formular
-- ändern und bekommt "Gespeichert" gemeldet — geschrieben wird nichts.
-- Schlimmer: Das Formular synchronisiert per Löschen-und-Neuanlegen; das
-- Löschen scheitert still, das Einfügen klappt, und die fremde Zeile steht
-- danach doppelt im Bericht.
--
-- Neue Regel: Wer den Bericht bearbeiten darf, darf auch dessen Material
-- pflegen. Lesen wird gleichzeitig auf die Berichte eingegrenzt, die den
-- Benutzer etwas angehen.
-- ============================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'disturbance_materials'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.disturbance_materials', p.policyname);
  END LOOP;
END $$;

-- Ein Bericht "gehört" jemandem, wenn er ihn erstellt hat oder als beteiligter
-- Mitarbeiter eingetragen ist.
CREATE OR REPLACE FUNCTION public.darf_regiebericht_bearbeiten(_disturbance_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'administrator'::app_role)
      OR EXISTS (SELECT 1 FROM public.disturbances d
                  WHERE d.id = _disturbance_id AND d.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.disturbance_workers w
                  WHERE w.disturbance_id = _disturbance_id AND w.user_id = auth.uid());
$$;

CREATE POLICY "disturbance_materials_read" ON public.disturbance_materials
  FOR SELECT TO authenticated
  USING (public.darf_regiebericht_bearbeiten(disturbance_id));

CREATE POLICY "disturbance_materials_write" ON public.disturbance_materials
  FOR ALL TO authenticated
  USING (public.darf_regiebericht_bearbeiten(disturbance_id))
  WITH CHECK (public.darf_regiebericht_bearbeiten(disturbance_id));
