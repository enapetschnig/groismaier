-- Maschinen-Prüfbuch (Kundenwunsch): wie der Zulassungsschein beim Fahrzeug —
-- Foto/PDF des Prüfbuchs (jährliche Überprüfungen) je Maschine hinterlegen,
-- die KI liest Maschinendaten (Bezeichnung, Hersteller, Seriennummer) heraus.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS pruefbuch_path text;
