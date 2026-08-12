-- ============================================================================
-- Maschinen im Regiebericht (Kundenwunsch): „auch die Möglichkeit rein,
-- Maschinen buchen zu können (Material geht schon), z. B. Kreissäge,
-- Plattensäge in der Werkstatt, Handwerkzeug".
--
-- Der Maschinenstamm liegt dort, wo Maschinen ohnehin gepflegt werden:
-- im KFZ- und Maschinen-Manager (vehicles, art='maschine'). Dort bekommen sie
-- jetzt einen Verrechnungssatz. Gebucht wird je Regiebericht in einer eigenen
-- Tabelle — Aufbau bewusst identisch zu disturbance_materials.
-- ============================================================================

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS verrechnungssatz numeric,
  ADD COLUMN IF NOT EXISTS verrechnungseinheit text DEFAULT 'h';

COMMENT ON COLUMN public.vehicles.verrechnungssatz IS
  'Satz für die Weiterverrechnung im Regiebericht (z. B. 45.00 je Stunde).';

CREATE TABLE IF NOT EXISTS public.disturbance_maschinen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disturbance_id uuid NOT NULL REFERENCES public.disturbances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  -- Freitext, damit auch nicht angelegtes Gerät („Handwerkzeug") gebucht werden kann.
  maschine text NOT NULL,
  -- Verknüpfung zum Stamm, wenn aus der Liste gewählt (bleibt bei Freitext leer).
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  menge text,
  einheit text DEFAULT 'h',
  einzelpreis numeric,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disturbance_maschinen_bericht_idx
  ON public.disturbance_maschinen (disturbance_id);

ALTER TABLE public.disturbance_maschinen ENABLE ROW LEVEL SECURITY;

-- Rechte exakt wie bei disturbance_materials (dieselbe Helferfunktion).
CREATE POLICY "disturbance_maschinen_read"
  ON public.disturbance_maschinen FOR SELECT
  USING (darf_regiebericht_bearbeiten(disturbance_id));

CREATE POLICY "disturbance_maschinen_write"
  ON public.disturbance_maschinen FOR ALL
  USING (darf_regiebericht_bearbeiten(disturbance_id))
  WITH CHECK (darf_regiebericht_bearbeiten(disturbance_id));
