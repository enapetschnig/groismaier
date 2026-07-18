-- Lohnnebenkosten-Faktor für die Projekt-Nachkalkulation. Der reine Brutto-
-- Stundenlohn unterschätzt die echten Lohnkosten stark (Lohnnebenkosten,
-- Nicht-Leistungszeiten). Faktor ~1,8 als Startwert, im Admin anpassbar.
INSERT INTO public.app_settings (key, value)
VALUES ('lohnnebenkosten_faktor', '1.8')
ON CONFLICT (key) DO NOTHING;
