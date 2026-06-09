-- Material entries: project_id optional machen (Entnahme ohne Projekt)
ALTER TABLE public.material_entries
  ALTER COLUMN project_id DROP NOT NULL;

-- Foreign key constraint bleibt bestehen (ON DELETE CASCADE), aber NULL ist jetzt erlaubt
