-- ============================================================================
--  ÄNDERUNGSWÜNSCHE — direkt aus der App melden (Kundenwunsch 26.08.)
-- ============================================================================
--
-- Christian sieht beim Arbeiten, was ihn stört. Bisher musste er das später
-- irgendwo notieren; meist war es dann weg. Jetzt: ein Knopf auf jeder Seite,
-- Bildschirmfoto entsteht automatisch, dazu ein gesprochener oder getippter
-- Hinweis. Die Sprachnachricht wird HOCHGELADEN und im Hintergrund
-- abgeschrieben (Edge Function `sprache-zu-text`) — niemand wartet auf die KI.
--
-- Der fertige Text lässt sich im Adminbereich gesammelt kopieren und direkt
-- an die Entwicklungs-KI weitergeben.

CREATE TABLE IF NOT EXISTS public.aenderungswuensche (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_von  UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  /* Der getippte bzw. abgeschriebene Hinweis. Darf bei reiner Sprachnachricht
     zunächst leer sein — die Abschrift trägt ihn nach. */
  text          TEXT NOT NULL DEFAULT '',
  /* wunsch | fehler | frage */
  art           TEXT NOT NULL DEFAULT 'wunsch'
                CHECK (art IN ('wunsch', 'fehler', 'frage')),
  /* Wo war der Mensch, als es ihm auffiel. */
  seite         TEXT,
  /* Bild vom Bildschirm samt Einzeichnungen. */
  bild_pfad     TEXT,
  /* Die Sprachnachricht selbst — bleibt liegen, damit man sie zur Not
     anhören kann, wenn die Abschrift daneben liegt. */
  audio_pfad    TEXT,
  /* offen | laeuft | fertig | fehler — Stand der Abschrift. */
  abschrift     TEXT NOT NULL DEFAULT 'fertig'
                CHECK (abschrift IN ('offen', 'laeuft', 'fertig', 'fehler')),
  abschrift_fehler TEXT,
  /* neu | gesehen | umgesetzt | abgelehnt — Stand der Bearbeitung. */
  status        TEXT NOT NULL DEFAULT 'neu'
                CHECK (status IN ('neu', 'gesehen', 'umgesetzt', 'abgelehnt')),
  antwort       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aenderungswuensche_status_idx ON public.aenderungswuensche (status);
CREATE INDEX IF NOT EXISTS aenderungswuensche_zeit_idx ON public.aenderungswuensche (created_at DESC);

DROP TRIGGER IF EXISTS trg_aenderungswuensche_updated ON public.aenderungswuensche;
CREATE TRIGGER trg_aenderungswuensche_updated
  BEFORE UPDATE ON public.aenderungswuensche
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.aenderungswuensche ENABLE ROW LEVEL SECURITY;

-- Melden darf jeder Angemeldete, aber nur im eigenen Namen.
DROP POLICY IF EXISTS aenderungswuensche_anlegen ON public.aenderungswuensche;
CREATE POLICY aenderungswuensche_anlegen ON public.aenderungswuensche
  FOR INSERT TO authenticated
  WITH CHECK (erstellt_von = auth.uid());

-- Sehen: den eigenen Wunsch immer, alle nur als Administrator.
DROP POLICY IF EXISTS aenderungswuensche_lesen ON public.aenderungswuensche;
CREATE POLICY aenderungswuensche_lesen ON public.aenderungswuensche
  FOR SELECT TO authenticated
  USING (erstellt_von = auth.uid() OR public.has_role(auth.uid(), 'administrator'::app_role));

-- Ändern: der eigene Wunsch (die Abschrift trägt den Text nach) und alles
-- als Administrator (Status, Antwort).
DROP POLICY IF EXISTS aenderungswuensche_bearbeiten ON public.aenderungswuensche;
CREATE POLICY aenderungswuensche_bearbeiten ON public.aenderungswuensche
  FOR UPDATE TO authenticated
  USING (erstellt_von = auth.uid() OR public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (erstellt_von = auth.uid() OR public.has_role(auth.uid(), 'administrator'::app_role));

DROP POLICY IF EXISTS aenderungswuensche_loeschen ON public.aenderungswuensche;
CREATE POLICY aenderungswuensche_loeschen ON public.aenderungswuensche
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

-- ── Ablage für Bildschirmfotos und Sprachnachrichten ───────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('aenderungswuensche', 'aenderungswuensche', false, 26214400)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS aenderung_datei_hochladen ON storage.objects;
CREATE POLICY aenderung_datei_hochladen ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'aenderungswuensche'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS aenderung_datei_ansehen ON storage.objects;
CREATE POLICY aenderung_datei_ansehen ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'aenderungswuensche'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR public.has_role(auth.uid(), 'administrator'::app_role))
  );

DROP POLICY IF EXISTS aenderung_datei_loeschen ON storage.objects;
CREATE POLICY aenderung_datei_loeschen ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'aenderungswuensche'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR public.has_role(auth.uid(), 'administrator'::app_role))
  );

NOTIFY pgrst, 'reload schema';
