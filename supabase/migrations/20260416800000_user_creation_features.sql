-- Username field + must_change_password flag + extended profile fields
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefon TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plz TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ort TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS geburtsdatum DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sv_nummer TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS eintrittsdatum DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stundenlohn NUMERIC;
