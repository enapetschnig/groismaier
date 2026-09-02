-- Pruefbefund 02.09.2026: Eine Aufgabe, die jemand SICH SELBST zuweist
-- (z. B. der Nachfrage-Termin nach dem Angebotsversand), landete bei
-- Nicht-Admins in "wartet_freigabe" und war damit unter "Meine Aufgaben"
-- unsichtbar, bis ein Admin sie freigab. Eine Erinnerung an sich selbst
-- braucht keine Freigabe.
DROP POLICY IF EXISTS "Aufgaben anlegen" ON public.aufgaben;
CREATE POLICY "Aufgaben anlegen" ON public.aufgaben FOR INSERT WITH CHECK (
  erstellt_von = auth.uid()
  AND (
    has_role(auth.uid(), 'administrator'::app_role)
    OR status = 'wartet_freigabe'
    OR (status = 'offen' AND zugewiesen_an = auth.uid())
  )
);
