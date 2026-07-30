-- ============================================================================
-- Kundenliste für Mitarbeiter lesbar (Kundenwunsch, Regiebericht):
--
--   „Beim Regiebericht soll der Mitarbeiter schon Zugriff auf die Kundenliste
--    haben … der Mitarbeiter sollte im Projekt schon den Kunden sehen und
--    auch auswählen können!"
--
-- Die RLS-Härtung vom 29.07. hatte customers komplett auf Administratoren
-- eingeschränkt. Das war für Kalkulations-/Margendaten richtig, trifft hier
-- aber die falsche Tabelle: customers enthält Stammdaten (Name, Adresse,
-- Kontakt), die der Monteur am Bau für den Regiebericht ohnehin sieht und
-- eintippen müsste. Vertraulich bleiben Preise — die stehen NICHT hier,
-- sondern in kalkulationen/invoice_templates (weiterhin eingeschränkt).
--
-- Anlegen dürfen Mitarbeiter über die bestehende Policy
-- „Users can insert own customers" (user_id = auth.uid()) bereits.
-- Ändern/Löschen fremder Kunden bleibt Administratoren vorbehalten.
-- ============================================================================
DROP POLICY IF EXISTS customers_admin_read ON public.customers;

CREATE POLICY customers_read ON public.customers
  FOR SELECT
  USING (is_active_user(auth.uid()));
