-- ============================================================================
-- Zwei Review-Befunde am Ausschreibungs-Modul:
--
-- 1) Vorbemerkungen (LG-/ULG-Vertragstext, z. B. „Es gelten die AVB …" oder
--    einkalkulierte Dachneigungen) wurden geparst, aber beim Import verworfen
--    — wer in der App bepreist, sah preisrelevanten Vertragstext nicht.
--    Sie wandern jetzt als JSON mit in den Kopf.
--
-- 2) Der Import läuft in 200er-Blöcken. Bricht er mittendrin ab (Netz weg,
--    Tab zu), blieb ein Torso-LV stehen, das wie ein vollständiges aussah.
--    `import_fertig` wird erst NACH dem letzten Block gesetzt; die Liste
--    kennzeichnet unfertige Importe und bietet nur Löschen an.
-- ============================================================================
ALTER TABLE public.lv_ausschreibungen
  ADD COLUMN IF NOT EXISTS vorbemerkungen jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS import_fertig boolean NOT NULL DEFAULT false;

-- Bestand (falls schon importiert wurde): als fertig markieren.
UPDATE public.lv_ausschreibungen SET import_fertig = true;
