-- ============================================================================
-- Aufbau-Vorlagen (Kundenwunsch): „Bei Aufbauten bitte auch die Möglichkeit
-- einbauen, vorgespeicherte Aufbauten einzufügen … die kann man dann, falls
-- nötig, anpassen."
--
-- Ein einzelner Aufbau (Wand-/Dach-/Deckenaufbau mit Materialzeilen,
-- Arbeitszeit, Fahrten …) wird als JSON gespeichert und in jede Kalkulation
-- als neuer, frei anpassbarer Aufbau eingefügt. Ergänzt die bestehenden
-- Kalkulations-Vorlagen (ganze Kalkulation, kalkulationen.ist_vorlage).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.aufbau_vorlagen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Das KalkModule-Objekt (ohne laufende id) — dasselbe Format wie in
  -- kalkulationen.daten.modules[n].
  daten jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aufbau_vorlagen ENABLE ROW LEVEL SECURITY;

-- Gleiche Linie wie kalkulationen: nur Administratoren (Preise/Margen).
DROP POLICY IF EXISTS admin_all_aufbau_vorlagen ON public.aufbau_vorlagen;
CREATE POLICY admin_all_aufbau_vorlagen ON public.aufbau_vorlagen
  FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
