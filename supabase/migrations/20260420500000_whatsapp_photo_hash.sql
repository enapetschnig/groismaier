-- ============================================================
-- Content-Hash für Fotos → Duplikat-Erkennung
-- ============================================================
-- Wenn derselbe Bild-Inhalt (gleicher SHA-256) schon einem
-- Projekt zugeordnet wurde, soll der Bot beim nächsten Versuch
-- erkennen "bereits hochgeladen" und nicht doppelt ablegen.

-- Hash für Dokumente (Projekt-Fotos, Ersttermin-Fotos etc.)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE INDEX IF NOT EXISTS documents_file_hash_idx
  ON public.documents (project_id, file_hash)
  WHERE file_hash IS NOT NULL;

-- Hash auch am pending-photo-Eintrag speichern, damit wir beim
-- späteren Zuordnen den gleichen Wert in documents eintragen
-- können.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS photo_hash TEXT;
