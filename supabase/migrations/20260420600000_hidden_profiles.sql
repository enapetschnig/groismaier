-- ============================================================
-- Profile-Flag "hidden": User werden überall in Mitarbeiter-Listen
-- ausgeblendet (Plantafel, Zeiterfassung, Admin-Liste, Stundenauswertung,
-- Projekt-Ansichten etc.), bleiben aber voll funktionsfähig im
-- Backend (Login, eigene Zeit-Einträge, eigene Rechnungen).
--
-- Nützlich für Admins/Inhaber, die sich selbst nicht in
-- Mitarbeiter-Dropdowns erscheinen möchten.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_hidden_idx
  ON public.profiles (hidden)
  WHERE hidden = true;

COMMENT ON COLUMN public.profiles.hidden IS
  'Wenn true, wird dieser User in allen Mitarbeiter-Listen und -Dropdowns ausgeblendet. Auth + eigene Daten bleiben unverändert.';
