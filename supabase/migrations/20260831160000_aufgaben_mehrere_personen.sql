-- Meldung a72804a9 (Florian, 31.08.): "Aufgaben an mehrere Personen zuweisen"
--
-- Zusaetzlich zur Hauptperson (zugewiesen_an) koennen weitere Personen auf
-- der Aufgabe stehen. Array statt Join-Tabelle: die RLS-Policies bleiben
-- einfach lesbar und die bestehende Team-Zuweisung unberuehrt.
ALTER TABLE public.aufgaben
  ADD COLUMN IF NOT EXISTS weitere_zugewiesene uuid[] NOT NULL DEFAULT '{}';

-- Sichtbarkeit + Aenderungsrecht auch fuer die weiteren Personen
DROP POLICY IF EXISTS "Aufgaben lesen" ON public.aufgaben;
CREATE POLICY "Aufgaben lesen" ON public.aufgaben FOR SELECT USING (
  has_role(auth.uid(), 'administrator'::app_role)
  OR erstellt_von = auth.uid()
  OR (
    status <> 'wartet_freigabe'
    AND (
      zugewiesen_an = auth.uid()
      OR auth.uid() = ANY(weitere_zugewiesene)
      OR (team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = aufgaben.team_id AND tm.user_id = auth.uid()
      ))
    )
  )
);

DROP POLICY IF EXISTS "Aufgaben aendern" ON public.aufgaben;
CREATE POLICY "Aufgaben aendern" ON public.aufgaben FOR UPDATE
USING (
  has_role(auth.uid(), 'administrator'::app_role)
  OR (erstellt_von = auth.uid() AND status = 'wartet_freigabe')
  OR (
    status <> 'wartet_freigabe'
    AND (
      zugewiesen_an = auth.uid()
      OR auth.uid() = ANY(weitere_zugewiesene)
      OR (team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = aufgaben.team_id AND tm.user_id = auth.uid()
      ))
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'administrator'::app_role)
  OR (erstellt_von = auth.uid() AND status = 'wartet_freigabe')
  OR (
    status IN ('offen', 'in_arbeit', 'erledigt')
    AND (
      zugewiesen_an = auth.uid()
      OR auth.uid() = ANY(weitere_zugewiesene)
      OR (team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = aufgaben.team_id AND tm.user_id = auth.uid()
      ))
    )
  )
);
