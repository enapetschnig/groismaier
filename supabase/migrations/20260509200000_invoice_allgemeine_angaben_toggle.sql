-- ============================================================
-- Allgemeine Angaben: Toggle "auf PDF anzeigen"
-- ============================================================
-- Nachbesserung zur Migration 20260509100000: die "Allgemeine Angaben"-
-- Tabelle soll im PDF nicht automatisch erscheinen, sobald ein Feld
-- einen Wert hat — sondern erst, wenn der User sie explizit per
-- Toggle aktiviert. Default false → bestehende Dokumente verlieren
-- die Tabelle in der Anzeige (Werte bleiben in der DB), bis der User
-- den Toggle bewusst einschaltet.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS allgemeine_angaben_aktiv BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoices.allgemeine_angaben_aktiv IS
  'Steuert, ob die "Allgemeine Angaben"-Tabelle im PDF/HTML gerendert wird. Wenn false, werden die zugehörigen Felder (leistungsbeschreibung, ausfuehrungsort, ausfuehrungs_kw, ausfuehrende_firma, ausfuehrende_firma_freitext) zwar in der DB gespeichert, aber NICHT im Dokument angezeigt. Default false: User aktiviert die Tabelle bewusst pro Dokument.';
