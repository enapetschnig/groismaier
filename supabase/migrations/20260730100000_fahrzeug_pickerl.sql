-- ============================================================================
-- Fahrzeuge: Pickerl-/Prüftermin mit Erinnerung (Kundenwunsch).
--
-- Bisher gab es dafür GAR KEIN Feld — „Pickerl" stand nur als Beispieltext im
-- Notizfeld. Damit war weder eine Auswertung noch eine Erinnerung möglich.
--
-- Der Vorlauf ist je Fahrzeug einstellbar (Kundenwunsch: „ein Monat oder zwei
-- Wochen"), mit 30 Tagen als Vorgabe.
-- ============================================================================
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS pickerl_faellig_am date,
  ADD COLUMN IF NOT EXISTS pickerl_erinnerung_tage integer NOT NULL DEFAULT 30,
  -- Wann war die letzte Überprüfung? Nur zur Dokumentation.
  ADD COLUMN IF NOT EXISTS pickerl_letzte_pruefung date;

COMMENT ON COLUMN public.vehicles.pickerl_faellig_am IS
  'Nächster Termin für die wiederkehrende Begutachtung (§ 57a, „Pickerl").';
COMMENT ON COLUMN public.vehicles.pickerl_erinnerung_tage IS
  'Wie viele Tage vorher auf der Startseite erinnert wird.';

-- Schneller Zugriff auf die anstehenden Termine.
CREATE INDEX IF NOT EXISTS vehicles_pickerl_idx
  ON public.vehicles (pickerl_faellig_am)
  WHERE pickerl_faellig_am IS NOT NULL;
