-- ============================================================================
-- Aufgaben / ToDo-Liste (Kundenwunsch 19.08.2026):
-- "ein Bereich, wo ich zB wie bei einem Regiebericht eine Aufgabe definieren
--  kann, ein Bild davon vielleicht dazu mache und es einer Person oder dem
--  Team zuweisen kann. [...] Ein Zeitraum bis wann es erledigt werden muss
--  [...] Den Status sehe ich als Admin am Homebildschirm [...] die
--  Mitarbeiter sollen das auch machen koennen, deren erstellte Aufgaben
--  bekomme ich dann aber zur Freigabe vorgelegt - erst danach geht sie an
--  die ausgewaehlte Person."
--
-- Status-Modell:
--   wartet_freigabe  von einem Mitarbeiter erstellt, noch nicht freigegeben
--                    (nur Ersteller + Admin sehen die Aufgabe)
--   offen            freigegeben bzw. vom Admin erstellt
--   in_arbeit        von der zugewiesenen Person begonnen
--   erledigt         abgeschlossen (erledigt_am gesetzt)
--
-- Zuweisung: entweder eine Person (zugewiesen_an) ODER ein Team (team_id) -
-- Teammitglieder sehen Team-Aufgaben ueber team_members.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.aufgaben (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  erstellt_von uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titel text NOT NULL,
  beschreibung text,
  zugewiesen_an uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  faellig_am date,
  status text NOT NULL DEFAULT 'offen'
    CHECK (status IN ('wartet_freigabe', 'offen', 'in_arbeit', 'erledigt')),
  erledigt_am timestamptz
);

CREATE INDEX IF NOT EXISTS idx_aufgaben_status ON public.aufgaben (status);
CREATE INDEX IF NOT EXISTS idx_aufgaben_zugewiesen ON public.aufgaben (zugewiesen_an);
CREATE INDEX IF NOT EXISTS idx_aufgaben_team ON public.aufgaben (team_id);

DROP TRIGGER IF EXISTS aufgaben_updated_at ON public.aufgaben;
CREATE TRIGGER aufgaben_updated_at
  BEFORE UPDATE ON public.aufgaben
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fotos wie bei den Regieberichten (eigene Tabelle + eigener Bucket)
CREATE TABLE IF NOT EXISTS public.aufgaben_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aufgabe_id uuid NOT NULL REFERENCES public.aufgaben(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aufgaben_fotos_aufgabe ON public.aufgaben_fotos (aufgabe_id);

ALTER TABLE public.aufgaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aufgaben_fotos ENABLE ROW LEVEL SECURITY;

-- Sichtbarkeit: Admin alles; Ersteller die eigenen; zugewiesene Person /
-- Teammitglieder erst NACH der Freigabe (Kern des Freigabe-Wunsches).
DROP POLICY IF EXISTS "Aufgaben lesen" ON public.aufgaben;
CREATE POLICY "Aufgaben lesen" ON public.aufgaben FOR SELECT USING (
  has_role(auth.uid(), 'administrator'::app_role)
  OR erstellt_von = auth.uid()
  OR (
    status <> 'wartet_freigabe'
    AND (
      zugewiesen_an = auth.uid()
      OR (team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = aufgaben.team_id AND tm.user_id = auth.uid()
      ))
    )
  )
);

-- Anlegen: jeder fuer sich selbst; Nicht-Admins IMMER als wartet_freigabe
-- (die Freigabe kann sich niemand selbst geben, auch nicht per API).
DROP POLICY IF EXISTS "Aufgaben anlegen" ON public.aufgaben;
CREATE POLICY "Aufgaben anlegen" ON public.aufgaben FOR INSERT WITH CHECK (
  erstellt_von = auth.uid()
  AND (
    has_role(auth.uid(), 'administrator'::app_role)
    OR status = 'wartet_freigabe'
  )
);

-- Aendern: Admin alles (inkl. Freigabe); Ersteller nur solange die Aufgabe
-- auf Freigabe wartet (und ohne den Status zu wechseln); zugewiesene Person /
-- Team nach Freigabe (Statuswechsel offen -> in_arbeit -> erledigt).
DROP POLICY IF EXISTS "Aufgaben aendern" ON public.aufgaben;
CREATE POLICY "Aufgaben aendern" ON public.aufgaben FOR UPDATE
USING (
  has_role(auth.uid(), 'administrator'::app_role)
  OR (erstellt_von = auth.uid() AND status = 'wartet_freigabe')
  OR (
    status <> 'wartet_freigabe'
    AND (
      zugewiesen_an = auth.uid()
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
      OR (team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = aufgaben.team_id AND tm.user_id = auth.uid()
      ))
    )
  )
);

-- Loeschen: Admin immer; Ersteller nur vor der Freigabe.
DROP POLICY IF EXISTS "Aufgaben loeschen" ON public.aufgaben;
CREATE POLICY "Aufgaben loeschen" ON public.aufgaben FOR DELETE USING (
  has_role(auth.uid(), 'administrator'::app_role)
  OR (erstellt_von = auth.uid() AND status = 'wartet_freigabe')
);

-- Fotos: sichtbar zu jeder Aufgabe, die man selbst sehen darf (die
-- Unterabfrage laeuft unter der RLS des Aufrufers); hochladen ebenso.
DROP POLICY IF EXISTS "Aufgaben-Fotos lesen" ON public.aufgaben_fotos;
CREATE POLICY "Aufgaben-Fotos lesen" ON public.aufgaben_fotos FOR SELECT USING (
  aufgabe_id IN (SELECT id FROM public.aufgaben)
);

DROP POLICY IF EXISTS "Aufgaben-Fotos anlegen" ON public.aufgaben_fotos;
CREATE POLICY "Aufgaben-Fotos anlegen" ON public.aufgaben_fotos FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND aufgabe_id IN (SELECT id FROM public.aufgaben)
);

DROP POLICY IF EXISTS "Aufgaben-Fotos loeschen" ON public.aufgaben_fotos;
CREATE POLICY "Aufgaben-Fotos loeschen" ON public.aufgaben_fotos FOR DELETE USING (
  has_role(auth.uid(), 'administrator'::app_role)
  OR user_id = auth.uid()
  OR aufgabe_id IN (SELECT id FROM public.aufgaben WHERE erstellt_von = auth.uid())
);

-- Storage-Bucket wie disturbance-photos (oeffentlich lesbar, Upload/Loeschen
-- nur angemeldet)
INSERT INTO storage.buckets (id, name, public)
VALUES ('aufgaben-fotos', 'aufgaben-fotos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Aufgaben-Fotos hochladen (Storage)" ON storage.objects;
CREATE POLICY "Aufgaben-Fotos hochladen (Storage)" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'aufgaben-fotos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Aufgaben-Fotos lesen (Storage)" ON storage.objects;
CREATE POLICY "Aufgaben-Fotos lesen (Storage)" ON storage.objects FOR SELECT
USING (bucket_id = 'aufgaben-fotos');

DROP POLICY IF EXISTS "Aufgaben-Fotos loeschen (Storage)" ON storage.objects;
CREATE POLICY "Aufgaben-Fotos loeschen (Storage)" ON storage.objects FOR DELETE
USING (bucket_id = 'aufgaben-fotos' AND auth.uid() IS NOT NULL);
