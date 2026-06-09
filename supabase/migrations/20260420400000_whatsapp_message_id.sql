-- ============================================================
-- WhatsApp-Messages: wapi_message_id für robuste Deduplication
-- ============================================================
-- Der bisherige Dedup-Check verglich den message_body — bei zwei
-- reinen Bildern (body = "[image]") wurde das zweite fälschlich
-- als Duplikat verworfen. Mit der eindeutigen WAPI-Message-ID
-- funktioniert es zuverlässig.

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS wapi_message_id TEXT;

-- Eindeutiger Index, damit auch Race-Conditions nicht zu
-- doppelten Einträgen führen (Insert würde auf Conflict failen).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wapi_message_id_unique
  ON public.whatsapp_messages (wapi_message_id)
  WHERE wapi_message_id IS NOT NULL;

-- Index für schnelle Pending-Photo-Queries
CREATE INDEX IF NOT EXISTS whatsapp_messages_pending_photos_idx
  ON public.whatsapp_messages (phone, message_type, processed, created_at)
  WHERE message_type = 'pending_photo';
