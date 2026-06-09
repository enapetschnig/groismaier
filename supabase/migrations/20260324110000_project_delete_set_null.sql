-- Allow projects to be deleted even if invoices reference them
-- Invoices keep their data, project_id becomes NULL
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_project_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- Same for time_entries
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_project_id_fkey;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- Same for lieferscheine if exists
DO $$ BEGIN
  ALTER TABLE public.lieferscheine DROP CONSTRAINT IF EXISTS lieferscheine_project_id_fkey;
  ALTER TABLE public.lieferscheine ADD CONSTRAINT lieferscheine_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
