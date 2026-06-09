-- ============================================================
-- Customers: wichtige_daten (Liste von Datums-Einträgen)
-- ============================================================
-- Pro Kunde können beliebig viele wichtige Daten hinterlegt werden:
-- Geburtstag, Tag der Projektübergabe, Garantie-Ende, ...
-- Schema einer Zeile: { label: string, datum: string (YYYY-MM-DD), notiz?: string }

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS wichtige_daten JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.customers.wichtige_daten IS
  'Liste {label, datum, notiz?} mit kundenspezifischen wichtigen Daten (Geburtstag, Projektübergabe, …). Frei erweiterbar pro Kunde.';
