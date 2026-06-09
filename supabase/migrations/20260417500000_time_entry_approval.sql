-- Zeiterfassung: Freigabe-Workflow
-- approved=true: Eintrag wurde vom Admin freigegeben und kann nicht mehr vom Mitarbeiter editiert werden
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

-- Index für schnelle Filterung
CREATE INDEX IF NOT EXISTS idx_time_entries_approved ON public.time_entries(approved);

-- RLS-Regel: Mitarbeiter kann eigene unapproved entries bearbeiten, aber keine approved
-- (admin policy bleibt unverändert)
DROP POLICY IF EXISTS "Users can update own unapproved entries" ON public.time_entries;
CREATE POLICY "Users can update own unapproved entries"
  ON public.time_entries FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND (approved IS NULL OR approved = false)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (approved IS NULL OR approved = false)
  );

DROP POLICY IF EXISTS "Users can delete own unapproved entries" ON public.time_entries;
CREATE POLICY "Users can delete own unapproved entries"
  ON public.time_entries FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND (approved IS NULL OR approved = false)
  );
