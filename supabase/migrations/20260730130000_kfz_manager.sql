-- ============================================================================
-- Aus „Fahrzeuge" wird der KFZ-Manager (Kundenwunsch).
--
--   „Beim Fahrzeuge sollte eigentlich KFZ-Manager heißen, wo man auch
--    Maschinen hinzufügen kann. Also, wenn ich was Neues hinzufüge, kann ich
--    auswählen zwischen Fahrzeug und Maschine, und da kann ich auch die
--    Kostenstellen erstellen."
--
-- Zwei Dinge kommen dazu:
--
-- 1) `art` unterscheidet Fahrzeug und Maschine. Bewusst KEINE eigene Tabelle:
--    Kran, Stapler und Säge brauchen exakt dasselbe wie ein Bus — Stunden aus
--    der Zeiterfassung, Kosten je Kostenzeile, aktiv/inaktiv. Eine zweite
--    Tabelle hätte jede Auswertung verdoppelt. Das Pickerl bleibt am
--    Fahrzeug; bei Maschinen wird es in der Maske schlicht nicht angezeigt.
--
-- 2) `kostenstelle` verbindet ein Gerät mit der Auswahl in der Zeiterfassung.
--    Damit kann der Chef im KFZ-Manager festlegen, worauf Stunden für dieses
--    Gerät gebucht werden — bisher gab es dort nur Baustelle, Werkstatt,
--    Lagerwerkstatt und Lagerplatz, also nichts für Fuhrpark oder Maschinen.
-- ============================================================================
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS art text NOT NULL DEFAULT 'fahrzeug',
  ADD COLUMN IF NOT EXISTS kostenstelle text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vehicles'::regclass AND conname = 'vehicles_art_check'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_art_check CHECK (art IN ('fahrzeug', 'maschine'));
  END IF;
END $$;

COMMENT ON COLUMN public.vehicles.art IS
  'fahrzeug oder maschine — steuert Typliste, Pickerl-Felder und Filter im KFZ-Manager.';
COMMENT ON COLUMN public.vehicles.kostenstelle IS
  'Auf welche Kostenstelle Stunden für dieses Gerät gebucht werden (admin_config_options.wert, kategorie=kostenstelle).';

-- ---------------------------------------------------------------------------
-- Die beiden fehlenden Kostenstellen aus der Besprechung. Ohne sie landen
-- Fuhrpark- und Maschinenstunden heute unter „Werkstatt".
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_config_options (kategorie, wert, label, sort_order, is_active)
VALUES
  ('kostenstelle', 'fuhrpark',  'Fuhrpark',  50, true),
  ('kostenstelle', 'maschinen', 'Maschinen', 60, true)
ON CONFLICT DO NOTHING;

-- Bestand: alles, was bisher da war, sind Fahrzeuge (Anhänger, Firmenbus, PKW).
UPDATE public.vehicles SET art = 'fahrzeug' WHERE art IS NULL;
