-- ============================================================================
--  BILDIDEEN — KI-Bildgenerierung (Kundenwunsch 02.09.2026)
-- ============================================================================
--
-- "Ein Menuepunkt, wo ich ein oder mehrere Fotos hochlade und er mir
--  generiert, wie dort z. B. ein Carport aussehen wuerde."
--
-- Jede Erzeugung wird mit Wunschtext, Ausgangsfotos und Ergebnis abgelegt -
-- so lassen sich Ideen spaeter wiederfinden und ins Projekt uebernehmen.

CREATE TABLE IF NOT EXISTS public.bildideen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  project_id    uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  wunsch        text NOT NULL,
  /* Der vollstaendige Auftrag ans Modell - fuer Nachvollziehbarkeit. */
  prompt        text NOT NULL,
  groesse       text NOT NULL DEFAULT '1536x1024',
  quelle_pfade  text[] NOT NULL DEFAULT '{}',
  ergebnis_pfad text NOT NULL,
  modell        text NOT NULL DEFAULT 'gpt-image-1',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bildideen_user ON public.bildideen (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bildideen_projekt ON public.bildideen (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE public.bildideen ENABLE ROW LEVEL SECURITY;

-- Eigene Bildideen sehen und anlegen; Administratoren alle.
DROP POLICY IF EXISTS "Bildideen lesen" ON public.bildideen;
CREATE POLICY "Bildideen lesen" ON public.bildideen FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role));
DROP POLICY IF EXISTS "Bildideen anlegen" ON public.bildideen;
CREATE POLICY "Bildideen anlegen" ON public.bildideen FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Bildideen aendern" ON public.bildideen;
CREATE POLICY "Bildideen aendern" ON public.bildideen FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role));
DROP POLICY IF EXISTS "Bildideen loeschen" ON public.bildideen;
CREATE POLICY "Bildideen loeschen" ON public.bildideen FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role));

-- Ablage: privater Bucket, Ordner = eigene user-id.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('bildideen', 'bildideen', false, 26214400)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Bildideen Datei hochladen" ON storage.objects;
CREATE POLICY "Bildideen Datei hochladen" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bildideen' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Bildideen Datei ansehen" ON storage.objects;
CREATE POLICY "Bildideen Datei ansehen" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bildideen'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR has_role(auth.uid(), 'administrator'::app_role)));
DROP POLICY IF EXISTS "Bildideen Datei loeschen" ON storage.objects;
CREATE POLICY "Bildideen Datei loeschen" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bildideen'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR has_role(auth.uid(), 'administrator'::app_role)));

-- Menuerecht: Administratoren sehen den Menuepunkt, alle anderen nicht -
-- unter Einstellungen -> Berechtigungen jederzeit aenderbar.
INSERT INTO public.role_permissions (role, feature, can_view, can_edit)
VALUES
  ('administrator', 'bildideen', true,  true),
  ('vorarbeiter',   'bildideen', false, false),
  ('mitarbeiter',   'bildideen', false, false)
ON CONFLICT (role, feature) DO NOTHING;

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Bildideen (KI)',
   'Neuer Menuepunkt auf der Startseite: Foto(s) der Baustelle hochladen, Wunsch tippen oder Vorlage waehlen (Carport, Terrasse, Fassade ...) - die KI zeigt, wie es dort aussehen wuerde. Ergebnisse lassen sich ins Projekt ablegen. Jedes Bild kostet ein paar Cent und dauert etwa eine Minute.');
