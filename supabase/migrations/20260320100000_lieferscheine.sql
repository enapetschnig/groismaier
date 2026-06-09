-- Lieferscheine table
CREATE TABLE IF NOT EXISTS public.lieferscheine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  datum DATE DEFAULT CURRENT_DATE,
  notizen TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add lieferschein_id to material_entries
ALTER TABLE public.material_entries
  ADD COLUMN IF NOT EXISTS lieferschein_id UUID REFERENCES public.lieferscheine(id) ON DELETE CASCADE;

-- RLS for lieferscheine
ALTER TABLE public.lieferscheine ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lieferscheine_select" ON public.lieferscheine
  FOR SELECT USING (is_active_user(auth.uid()));

CREATE POLICY "lieferscheine_insert" ON public.lieferscheine
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

CREATE POLICY "lieferscheine_update" ON public.lieferscheine
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

CREATE POLICY "lieferscheine_delete" ON public.lieferscheine
  FOR DELETE USING (
    (auth.uid() = user_id AND is_active_user(auth.uid()))
    OR
    (is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator'
    ))
  );
