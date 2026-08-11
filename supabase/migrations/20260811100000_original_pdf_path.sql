-- Alt-Belege aus KingBill: Pfad zum originalen PDF (Bucket invoice-pdfs,
-- Ordner alt-angebote/). Das Original bleibt so dauerhaft abrufbar, auch
-- wenn die App das Dokument aus den importierten Daten neu rendern kann.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS original_pdf_path text;
