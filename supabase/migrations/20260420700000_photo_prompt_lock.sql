-- ============================================================
-- Atomare Sperre: nur genau EIN WhatsApp-Foto-Prompt pro User
-- innerhalb eines Zeitfensters — auch bei parallelen Webhooks
-- (WAPI schickt bei Multi-Foto-Upload oft alle gleichzeitig).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.photo_prompt_locks (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.photo_prompt_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_photo_prompt_locks" ON public.photo_prompt_locks
  FOR ALL USING (true) WITH CHECK (true);

-- Atomare Claim-Function: wenn keine Sperre existiert oder die letzte
-- älter als ttl_seconds ist → zurückgeben ob der Caller den Prompt
-- senden darf. Die Function nutzt INSERT ... ON CONFLICT DO UPDATE
-- mit WHERE-Klausel, die Postgres serialisiert → sicher gegen Race.
CREATE OR REPLACE FUNCTION public.try_claim_photo_prompt(
  p_user_id UUID,
  p_ttl_seconds INT DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_count INT;
BEGIN
  -- Upsert: neue Sperre oder Update wenn alte Sperre abgelaufen
  INSERT INTO photo_prompt_locks (user_id, acquired_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET acquired_at = now()
    WHERE photo_prompt_locks.acquired_at < now() - (p_ttl_seconds || ' seconds')::interval;

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count > 0;
END;
$$;
