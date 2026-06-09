ALTER TABLE public.invoice_templates ADD COLUMN artikelnummer text;

ALTER TABLE public.invoices ADD COLUMN gueltig_bis date;
ALTER TABLE public.invoices ADD COLUMN rabatt_prozent numeric DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN rabatt_betrag numeric DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN mahnstufe integer DEFAULT 0;