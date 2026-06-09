-- ============================================================
-- Allgemeine Angaben für Angebot + Auftragsbestätigung
-- ============================================================
-- Neue Spalten in invoices, die ausschließlich für die zweispaltige
-- "Allgemeine Angaben"-Tabelle in Angebots- und AB-PDFs/Previews
-- gelesen werden. Alle Spalten sind nullable; bestehende Dokumente
-- bleiben unverändert. Der Zeitraum wird über die bereits vorhandenen
-- leistungsdatum/leistungsdatum_bis-Spalten abgedeckt — alternativ
-- kann ausfuehrungs_kw eine Kalenderwoche-Notation aufnehmen
-- (z. B. "KW 19/2026"). Wenn ausfuehrungs_kw gesetzt ist, hat sie
-- Vorrang im Render.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS leistungsbeschreibung TEXT,
  ADD COLUMN IF NOT EXISTS ausfuehrungsort TEXT,
  ADD COLUMN IF NOT EXISTS ausfuehrungs_kw TEXT,
  ADD COLUMN IF NOT EXISTS ausfuehrende_firma TEXT,
  ADD COLUMN IF NOT EXISTS ausfuehrende_firma_freitext TEXT;

COMMENT ON COLUMN public.invoices.leistungsbeschreibung IS
  'Freitext-Kurzbeschreibung der zu erbringenden Leistung. Wird in der Allgemeine-Angaben-Tabelle bei Angebot/AB gerendert.';
COMMENT ON COLUMN public.invoices.ausfuehrungsort IS
  'Adresse des Leistungs-/Durchführungsorts. Wird beim Projekt-Wechsel automatisch aus projects.adresse/plz/ort vorbefüllt, ist aber editierbar.';
COMMENT ON COLUMN public.invoices.ausfuehrungs_kw IS
  'Kalenderwoche (z. B. "KW 19/2026") als Alternative zum Datumsbereich aus leistungsdatum/leistungsdatum_bis. Wenn gesetzt, hat sie Vorrang im Render der Allgemeine-Angaben-Tabelle.';
COMMENT ON COLUMN public.invoices.ausfuehrende_firma IS
  'ID einer der vordefinierten ausführenden Firmen (montipro/bks/gartenmacher/fensterwerk) oder "freitext" für eine Fremdfirma. Quelle der Hardcoded-Adressen: src/lib/executingCompanies.ts.';
COMMENT ON COLUMN public.invoices.ausfuehrende_firma_freitext IS
  'Mehrzeiliger Freitext (Firmenname + Adresse), der gerendert wird, wenn ausfuehrende_firma="freitext".';
