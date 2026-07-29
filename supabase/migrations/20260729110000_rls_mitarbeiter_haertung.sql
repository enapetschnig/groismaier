-- ============================================================================
-- RLS-Härtung vor der Freigabe von Mitarbeiterzugängen.
--
-- Ausgangslage: Die Registrierung ist selbstbedient (handle_new_user legt ein
-- INAKTIVES Profil ohne Rolle an, der Admin schaltet frei). Mehrere Tabellen
-- standen aber auf USING (true) für die Rolle `authenticated` — also offen für
-- JEDEN, der sich registriert hat, selbst ohne Freischaltung und ohne Rolle.
--
-- Empirisch geprüft (simulierter Login ohne Rolle): 85 app_settings-Zeilen und
-- alle Kalkulationen waren lesbar — darunter kalk_selbstkosten_lohn,
-- kalk_mittellohn, bank_iban/bic/kontoinhaber und cron_webhook_secret.
-- invoice_payments und mahnung_history waren sogar les- UND schreibbar.
--
-- Diese Migration schließt das, ohne den Mitarbeitern etwas wegzunehmen, das
-- sie für ihre Arbeit brauchen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. app_settings — Betriebsgeheimnisse raus aus der Allgemeinheit
--
--    Nicht-Admins brauchen aus dieser Tabelle genau einen Schlüssel:
--    `einheiten` (Mengeneinheiten-Auswahl in Projekt-Material, Regiebericht-
--    Material und Materialliste, src/hooks/useEinheiten.ts). Alles andere —
--    Bankverbindung, Firmen-UID, Kalkulations-Sätze, Finanzplanung, Nummern-
--    kreise, Webhook-Secret — geht sie nichts an.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.app_settings;

CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::app_role)
    -- Für alle anderen nur ausdrücklich unbedenkliche Schlüssel.
    OR key IN ('einheiten')
  );

-- ---------------------------------------------------------------------------
-- 2. kalkulationen — enthalten EK-Preise, Aufschläge und den Verdienst
--
--    Die Aufbau-Kalkulation liegt hinter der Berechtigung „materialien", die
--    laut role_permissions ausschließlich Administratoren haben. Bisher konnte
--    aber jeder angemeldete Benutzer alle Kalkulationen lesen, ändern und
--    sogar LÖSCHEN.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "kalk_select" ON public.kalkulationen;
DROP POLICY IF EXISTS "kalk_insert" ON public.kalkulationen;
DROP POLICY IF EXISTS "kalk_update" ON public.kalkulationen;
DROP POLICY IF EXISTS "kalk_delete" ON public.kalkulationen;

CREATE POLICY "kalkulationen_admin_only" ON public.kalkulationen
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));

-- ---------------------------------------------------------------------------
-- 3. invoice_payments — Zahlungseingänge waren les- UND schreibbar
--
--    Besonders heikel: Ohne diese Sperre könnte jeder angemeldete Benutzer
--    Zahlungen erfinden oder löschen. Das verfälscht Offene Posten und die
--    Ist-Zahlen der Finanzplanung.
-- ---------------------------------------------------------------------------
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'invoice_payments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.invoice_payments', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "invoice_payments_admin_only" ON public.invoice_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));

-- ---------------------------------------------------------------------------
-- 4. mahnung_history — Mahnhistorie, ebenfalls les- und schreibbar
-- ---------------------------------------------------------------------------
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'mahnung_history'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.mahnung_history', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "mahnung_history_admin_only" ON public.mahnung_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));

-- ---------------------------------------------------------------------------
-- 5. document_texts und invoice_template_components — Beleg-Stammdaten
--
--    Textbausteine und Set-Stücklisten (mit Mengen) gehören zur Belegwelt und
--    werden ausschließlich im Beleg-Editor und im Artikelstamm gebraucht —
--    beides rein administrativ.
-- ---------------------------------------------------------------------------
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename IN ('document_texts', 'invoice_template_components')
             AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY "document_texts_admin_read" ON public.document_texts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "invoice_template_components_admin_read" ON public.invoice_template_components
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

-- ---------------------------------------------------------------------------
-- Bewusst UNVERÄNDERT offen (Mitarbeiter brauchen sie, nichts Vertrauliches):
--   austrian_holidays  — Feiertagskalender
--   teams, team_members — Teamzuordnung
--   vehicles           — Fahrzeugauswahl beim Buchen (ohne Kosten;
--                        vehicle_costs bleibt admin-geschützt)
-- ---------------------------------------------------------------------------
