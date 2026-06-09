
-- Angebotspaket-Vorlagen (z.B. "Bad komplett", "Küche")
CREATE TABLE public.offer_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  beschreibung TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Positionen innerhalb eines Pakets
CREATE TABLE public.offer_package_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.offer_packages(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
  beschreibung TEXT NOT NULL,
  einheit TEXT DEFAULT 'Stk.',
  einzelpreis NUMERIC DEFAULT 0,
  default_menge NUMERIC DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.offer_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_package_items ENABLE ROW LEVEL SECURITY;

-- Policies for offer_packages
CREATE POLICY "Admins can manage offer packages" ON public.offer_packages FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "Users can view own offer packages" ON public.offer_packages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own offer packages" ON public.offer_packages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for offer_package_items
CREATE POLICY "Users can view package items" ON public.offer_package_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.offer_packages 
    WHERE id = offer_package_items.package_id 
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
  ));

CREATE POLICY "Users can manage package items" ON public.offer_package_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.offer_packages 
    WHERE id = offer_package_items.package_id 
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.offer_packages 
    WHERE id = offer_package_items.package_id 
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
  ));
