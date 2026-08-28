-- ============================================================================
--  ÄNDERUNGSWÜNSCHE ANS EPOWER-COCKPIT SCHICKEN (Push, 28.08.2026)
-- ============================================================================
--
-- Architektur-Entscheid: Die App SCHICKT (DB-Trigger via pg_net), das Cockpit
-- sammelt nur ein — so braucht das Cockpit KEINE Supabase-Schlüssel der Apps.
-- Bilder/Ton bleiben im privaten Bucket; dafür gibt es die Edge Function
-- `wunsch-datei`, die dem Cockpit gegen dasselbe Geheimnis eine signierte
-- URL ausstellt.
--
-- Der Trigger ist INAKTIV, solange die Verbindung nicht eingetragen ist
-- (Tabelle cockpit_verbindung leer) — gefahrlos ausrollbar, bevor das
-- Cockpit-Gegenstück existiert. Aktivieren später per einmaligem INSERT.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Verbindungsdaten: bewusst NICHT in app_settings (die liest der Client) —
-- eigene Tabelle ohne Policies, nur service_role/SECURITY DEFINER kommt ran.
CREATE TABLE IF NOT EXISTS public.cockpit_verbindung (
  einzig    boolean PRIMARY KEY DEFAULT true CHECK (einzig),  -- genau 1 Zeile
  url       text NOT NULL,          -- z.B. https://<cockpit>/api/wuensche/eingang
  secret    text NOT NULL,          -- gemeinsames Geheimnis mit dem Cockpit
  app_key   text NOT NULL DEFAULT 'groismaier'
);
ALTER TABLE public.cockpit_verbindung ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.wunsch_ans_cockpit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v public.cockpit_verbindung%ROWTYPE;
  melder text;
BEGIN
  SELECT * INTO v FROM public.cockpit_verbindung LIMIT 1;
  IF v IS NULL THEN
    RETURN NEW;                     -- Verbindung nicht eingerichtet: still
  END IF;

  SELECT NULLIF(TRIM(CONCAT(p.vorname, ' ', p.nachname)), '')
    INTO melder FROM public.profiles p WHERE p.id = NEW.erstellt_von;

  PERFORM net.http_post(
    url := v.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-app-key', v.app_key,
      'x-cockpit-secret', v.secret
    ),
    body := jsonb_build_object(
      'id',             NEW.id,
      'art',            NEW.art,
      'status',         NEW.status,
      'text',           NEW.text,
      'antwort',        NEW.antwort,
      'seite',          NEW.seite,
      'bild_pfad',      NEW.bild_pfad,
      'audio_pfad',     NEW.audio_pfad,
      'melder',         COALESCE(melder, ''),
      'erstellt_am',    NEW.created_at,
      'aktualisiert_am', NEW.updated_at
    )
  );
  RETURN NEW;
END;
$$;

-- INSERT und die relevanten UPDATEs: `text` ändert sich, wenn die Abschrift
-- der Sprachnachricht nachträgt; status/antwort, wenn der Wunsch bearbeitet
-- wird — beides soll im Cockpit ankommen.
DROP TRIGGER IF EXISTS trg_wunsch_cockpit ON public.aenderungswuensche;
CREATE TRIGGER trg_wunsch_cockpit
  AFTER INSERT OR UPDATE OF status, antwort, text, bild_pfad, audio_pfad
  ON public.aenderungswuensche
  FOR EACH ROW EXECUTE FUNCTION public.wunsch_ans_cockpit();
