-- ============================================================
-- Material-Katalog: Foto-Upload + Material-Sets (Stücklisten)
-- ============================================================
-- Erweitert invoice_templates um:
--   1. foto_path (Storage-Pfad zum Katalog-Foto)
--   2. ist_set (Flag: dieses Template ist eine Stückliste)
-- und legt die Komponenten-Tabelle invoice_template_components an.

-- 1) Foto-Pfad (Storage-Pfad im project-materials-Bucket, nicht signed URL)
ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS foto_path TEXT;

-- 2) Set-Flag
ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS ist_set BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_invoice_templates_ist_set
  ON public.invoice_templates(ist_set) WHERE ist_set = TRUE;

-- 3) Komponenten-Tabelle: Stückliste für Sets
CREATE TABLE IF NOT EXISTS public.invoice_template_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_template_id UUID NOT NULL REFERENCES public.invoice_templates(id) ON DELETE CASCADE,
  component_template_id UUID NOT NULL REFERENCES public.invoice_templates(id) ON DELETE RESTRICT,
  menge NUMERIC NOT NULL DEFAULT 1 CHECK (menge > 0),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_ref CHECK (parent_template_id <> component_template_id),
  UNIQUE (parent_template_id, component_template_id)
);

CREATE INDEX IF NOT EXISTS idx_itc_parent ON public.invoice_template_components(parent_template_id);

-- 4) Trigger: Verschachtelte Sets verhindern (MVP). Ein Set darf nur
--    "einfache" Materialien als Komponenten haben — nicht wieder ein Set.
CREATE OR REPLACE FUNCTION public.enforce_no_nested_sets() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.invoice_templates
     WHERE id = NEW.component_template_id
       AND ist_set = TRUE
  ) THEN
    RAISE EXCEPTION 'Sets können keine anderen Sets als Komponenten haben';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS itc_no_nested_sets ON public.invoice_template_components;
CREATE TRIGGER itc_no_nested_sets
  BEFORE INSERT OR UPDATE ON public.invoice_template_components
  FOR EACH ROW EXECUTE FUNCTION public.enforce_no_nested_sets();

-- 5) RLS — analog zu den bestehenden Policies auf invoice_templates:
--    User kann seine eigenen Template-Komponenten verwalten,
--    Administratoren können alles.
ALTER TABLE public.invoice_template_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Template components owner manage" ON public.invoice_template_components;
CREATE POLICY "Template components owner manage"
  ON public.invoice_template_components
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoice_templates t
       WHERE t.id = parent_template_id
         AND (t.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoice_templates t
       WHERE t.id = parent_template_id
         AND (t.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

-- 6) Read-Policy: auch alle Authenticated dürfen Komponenten lesen
--    (analog zu invoice_templates.SELECT-Policy — Katalog ist für alle
--    sichtbar).
DROP POLICY IF EXISTS "Template components read all" ON public.invoice_template_components;
CREATE POLICY "Template components read all"
  ON public.invoice_template_components
  FOR SELECT TO authenticated
  USING (TRUE);

COMMENT ON COLUMN public.invoice_templates.foto_path IS
  'Storage-Pfad im project-materials-Bucket (z.B. material-fotos/<uuid>.jpg). NULL = kein Foto.';
COMMENT ON COLUMN public.invoice_templates.ist_set IS
  'Wenn TRUE, ist dieses Template eine Stückliste. Komponenten stehen in invoice_template_components. Preis wird aus Komponenten summiert (nicht automatisch, User triggert "Preis neu berechnen").';
COMMENT ON TABLE public.invoice_template_components IS
  'Komponenten eines Material-Sets. Parent = das Set (ist_set=TRUE), Component = ein Einzelmaterial (ist_set=FALSE, Trigger erzwingt das).';
