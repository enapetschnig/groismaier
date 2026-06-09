-- ==============================================================
-- PDF-Paths für BTB, Ersttermin, Besprechungsprotokoll
-- + Protokoll-Fotos Tabelle + Bucket
-- ==============================================================

-- 1. pdf_path Spalten ------------------------------------------------
ALTER TABLE bautagesberichte
  ADD COLUMN IF NOT EXISTS pdf_path TEXT;

ALTER TABLE ersttermin_interessent
  ADD COLUMN IF NOT EXISTS pdf_path TEXT;

ALTER TABLE besprechungsprotokolle
  ADD COLUMN IF NOT EXISTS pdf_path TEXT;

-- 2. Besprechungsprotokoll-Fotos Tabelle -----------------------------
CREATE TABLE IF NOT EXISTS besprechungsprotokoll_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  besprechungsprotokoll_id UUID NOT NULL REFERENCES besprechungsprotokolle(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  beschreibung TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_besprechungsprotokoll_photos_proto
  ON besprechungsprotokoll_photos(besprechungsprotokoll_id);

ALTER TABLE besprechungsprotokoll_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_besprechungsprotokoll_photos"
  ON besprechungsprotokoll_photos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_besprechungsprotokoll_photos"
  ON besprechungsprotokoll_photos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_besprechungsprotokoll_photos"
  ON besprechungsprotokoll_photos FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth_delete_besprechungsprotokoll_photos"
  ON besprechungsprotokoll_photos FOR DELETE
  USING (auth.role() = 'authenticated');

-- 3. Storage-Bucket für Protokoll-Fotos ------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('besprechungsprotokoll-photos', 'besprechungsprotokoll-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_read_proto_photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'besprechungsprotokoll-photos' AND auth.role() = 'authenticated');

CREATE POLICY "auth_upload_proto_photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'besprechungsprotokoll-photos' AND auth.role() = 'authenticated');

CREATE POLICY "auth_update_proto_photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'besprechungsprotokoll-photos' AND auth.role() = 'authenticated');

CREATE POLICY "auth_delete_proto_photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'besprechungsprotokoll-photos' AND auth.role() = 'authenticated');
