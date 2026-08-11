-- Kundenwunsch Zeiterfassung:
--   1. „Lagerwerkstatt" heißt jetzt „Lager – Werkstatt" (Anzeige-Label;
--      der gespeicherte Wert bleibt, keine Buchung ändert sich).
--   2. Zwei neue Kostenstellen: „Büroarbeit – Chef" und „Büro/Verwaltung".
UPDATE public.admin_config_options
  SET label = 'Lager – Werkstatt'
  WHERE kategorie = 'kostenstelle' AND wert = 'lagerwerkstatt';

INSERT INTO public.admin_config_options (kategorie, wert, label, sort_order, is_active)
VALUES
  ('kostenstelle', 'buero_chef', 'Büroarbeit – Chef', 70, true),
  ('kostenstelle', 'buero_verwaltung', 'Büro/Verwaltung', 80, true)
ON CONFLICT DO NOTHING;
