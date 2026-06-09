-- ============================================================
-- Admin-Zeitbearbeitung: Audit-Felder + volle RLS-Rechte
-- ============================================================
-- Bisher konnte ein Admin zwar alle Zeit-Einträge LESEN
-- (SELECT-Policy "Admins can view all time entries"), aber nicht
-- ändern, einfügen oder löschen für fremde Mitarbeiter. Ergebnis: ein
-- vergessener Eintrag konnte nur vom Mitarbeiter selbst nachgetragen
-- werden.
--
-- Diese Migration:
-- 1. Fügt zwei Audit-Spalten an time_entries (nachgetragen_von,
--    nachgetragen_am), damit Admin-Nachträge im UI erkennbar bleiben.
-- 2. Ergänzt Admin-Policies für INSERT/UPDATE/DELETE auf time_entries
--    und time_entry_vehicles — mit der Einschränkung, dass der Admin
--    ein aktiver User sein muss (is_active_user).

-- ------------------------------------------------------------
-- 1) Audit-Spalten
-- ------------------------------------------------------------
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS nachgetragen_von UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nachgetragen_am TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_time_entries_nachgetragen
  ON public.time_entries(nachgetragen_von)
  WHERE nachgetragen_von IS NOT NULL;

COMMENT ON COLUMN public.time_entries.nachgetragen_von IS
  'User-ID des Admins, der diesen Eintrag stellvertretend für den Mitarbeiter angelegt hat. NULL = normaler Selbst-Eintrag.';
COMMENT ON COLUMN public.time_entries.nachgetragen_am IS
  'Zeitpunkt des Admin-Nachtrags (als Audit-Marker). NULL bei Selbst-Einträgen.';

-- ------------------------------------------------------------
-- 2) Admin-Policies: INSERT / UPDATE / DELETE auf time_entries
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert all time entries" ON public.time_entries;
CREATE POLICY "Admins can insert all time entries" ON public.time_entries
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'administrator')
    AND is_active_user(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update all time entries" ON public.time_entries;
CREATE POLICY "Admins can update all time entries" ON public.time_entries
  FOR UPDATE USING (
    has_role(auth.uid(), 'administrator')
    AND is_active_user(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete all time entries" ON public.time_entries;
CREATE POLICY "Admins can delete all time entries" ON public.time_entries
  FOR DELETE USING (
    has_role(auth.uid(), 'administrator')
    AND is_active_user(auth.uid())
  );

-- ------------------------------------------------------------
-- 3) Admin-Policies: time_entry_vehicles (KFZ-Einträge)
-- ------------------------------------------------------------
-- Die bestehende "tev_owner_all"-Policy gilt für den jeweiligen User-
-- Eintrag; Admin braucht separaten Pfad, damit KFZ-Rows zu fremden
-- time_entries verwaltet werden können.
DROP POLICY IF EXISTS "tev_admin_all" ON public.time_entry_vehicles;
CREATE POLICY "tev_admin_all" ON public.time_entry_vehicles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));
