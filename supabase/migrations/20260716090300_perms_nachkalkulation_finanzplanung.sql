-- Feature-Rechte für die neuen Module Nachkalkulation & Firmenzahlen und Finanzplanung
INSERT INTO public.role_permissions (role, feature, can_view, can_edit)
VALUES
  ('administrator', 'nachkalkulation', true,  true),
  ('vorarbeiter',   'nachkalkulation', false, false),
  ('mitarbeiter',   'nachkalkulation', false, false),
  ('administrator', 'finanzplanung',   true,  true),
  ('vorarbeiter',   'finanzplanung',   false, false),
  ('mitarbeiter',   'finanzplanung',   false, false)
ON CONFLICT (role, feature) DO NOTHING;
