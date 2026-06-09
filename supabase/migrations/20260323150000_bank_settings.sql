-- Bank settings
INSERT INTO public.app_settings (key, value) VALUES ('bank_kontoinhaber', 'Gottfried Tilger') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_settings (key, value) VALUES ('bank_iban', 'AT61 2081 5000 0423 1474') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_settings (key, value) VALUES ('bank_bic', 'STSPAT2GXXX') ON CONFLICT (key) DO NOTHING;
