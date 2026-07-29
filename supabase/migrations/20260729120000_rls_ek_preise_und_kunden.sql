-- ============================================================================
-- RLS-Härtung, Teil 2: EK-Preise und Kundenstamm.
--
-- Gefunden mit einem empirischen Test (Rolle testweise auf 'mitarbeiter'
-- gesetzt, Transaktion zurückgerollt): Diese Tabellen prüfen nur
-- is_active_user() — also JEDER freigeschaltete Benutzer unabhängig von der
-- Rolle. Ein Zimmerer konnte damit lesen:
--   invoice_templates      → ek_netto aller 40 Artikel (Einkaufspreise!)
--   kalkulation_artikel    → ek/vk aller 68 Katalogartikel
--   kalkulation_kategorien → dazugehörige Gruppen
--   customers              → kompletter Kundenstamm
--
-- Laut role_permissions haben 'materialien' und 'kunden' ausschließlich
-- Administratoren. Die Policies bilden das jetzt auch tatsächlich ab.
--
-- Geprüft, dass keine Mitarbeiter-Maske diese Tabellen braucht:
--   Projekt-Material (MaterialList) arbeitet mit material_entries (Freitext),
--   Regiebericht-Material mit disturbance_materials (Freitext),
--   Einheiten kommen aus app_settings.einheiten,
--   MaterialCatalogDialog ist toter Code (nirgends importiert),
--   ProjectOverview zeigt Kundendaten ohnehin nur mit isAdmin.
-- ============================================================================

-- invoice_templates: Artikelstamm mit Einkaufspreisen
DROP POLICY IF EXISTS "Authenticated users can view invoice templates" ON public.invoice_templates;

CREATE POLICY "invoice_templates_admin_read" ON public.invoice_templates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

-- Kalkulations-Katalog (Alt-Bestand für Lack/Aufpreis + migrierte Artikel)
DROP POLICY IF EXISTS "kalk_art_read" ON public.kalkulation_artikel;
DROP POLICY IF EXISTS "kalk_kat_read" ON public.kalkulation_kategorien;

CREATE POLICY "kalk_art_read" ON public.kalkulation_artikel
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "kalk_kat_read" ON public.kalkulation_kategorien
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

-- Kundenstamm
DROP POLICY IF EXISTS "Active users can view all customers" ON public.customers;

CREATE POLICY "customers_admin_read" ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));
