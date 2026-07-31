-- ============================================================================
-- Doppelte Kategorienamen verhindern (Review-Befund): Der Duplikatschutz war
-- rein clientseitig — zwei Masken (Artikelliste + Kalkulations-Einstellungen)
-- oder zwei Tabs konnten gleichnamige Kategorien anlegen; das Löschen traf
-- dann nur die erste Zeile und der Name blieb „unlöschbar" stehen.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS kalkulation_kategorien_typ_name_idx
  ON public.kalkulation_kategorien (typ, lower(name));
