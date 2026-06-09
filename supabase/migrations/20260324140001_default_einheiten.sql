-- Default Einheiten als app_setting
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('einheiten', 'Stk.,m²,lfm,Std.,Pauschal,kg,Liter,Tube,Sack,Karton,Palette,Rolle,Dose,Eimer', now())
ON CONFLICT (key) DO NOTHING;
