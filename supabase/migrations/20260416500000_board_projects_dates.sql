-- Add start/end dates directly to board_projects (independent of project table)
ALTER TABLE public.board_projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.board_projects ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.board_projects ADD COLUMN IF NOT EXISTS beschreibung TEXT;
