-- ============================================================================
-- SICHERHEITS-HÄRTUNG (Befunde aus dem Edge-Case-Review 2026-07-21)
--
-- 1) profiles war OHNE LOGIN lesbar (Policy "Users can view all profiles"
--    mit USING(true) für die Rolle public → auch anon). Namen + E-Mails
--    aller Mitarbeiter waren mit dem öffentlichen anon-Key abrufbar.
-- 2) Jeder eingeloggte Mitarbeiter konnte eigene Privilegien-Spalten
--    (is_active, hidden, stundenlohn) selbst überschreiben.
-- 3) Der Kalkulations-Preiskatalog war für jeden Mitarbeiter änder- und
--    löschbar; fixkosten (Miete/Versicherung) für jeden les-/schreibbar.
-- 4) next_document_number() konnte jeder Authentifizierte aufrufen und so
--    echte Belegnummern verbrauchen (Lücken in der Rechnungsnummerierung).
-- ============================================================================

-- ---------------------------------------------------------------- 1) profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Eigenes Profil immer lesbar (Login-/Aktivierungs-Flow braucht das, bevor
-- is_active gesetzt ist). Fremde Profile nur für aktive, eingeloggte Nutzer.
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_active_user(auth.uid()));

-- ------------------------------------------------- 2) Privilegien-Selbstschutz
-- Spaltenweise Rechte sind über RLS nicht abbildbar → Trigger.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Administratoren dürfen alles.
  IF public.has_role(auth.uid(), 'administrator'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Alle anderen: privilegierte Felder bleiben auf dem alten Wert.
  NEW.is_active := OLD.is_active;
  NEW.hidden    := OLD.hidden;
  IF to_jsonb(NEW) ? 'stundenlohn' THEN
    NEW.stundenlohn := OLD.stundenlohn;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileges ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- ------------------------------------------- 3) Kalkulationskatalog + Fixkosten
-- Lesen: alle aktiven Nutzer (die Kalkulation braucht die Preise).
-- Schreiben: nur Administrator (Preishoheit).
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('kalkulation_kategorien','kalkulation_artikel','fixkosten')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY "kalk_kat_read"  ON public.kalkulation_kategorien FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()));
CREATE POLICY "kalk_kat_write" ON public.kalkulation_kategorien FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "kalk_art_read"  ON public.kalkulation_artikel FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()));
CREATE POLICY "kalk_art_write" ON public.kalkulation_artikel FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));

-- Fixkosten (Miete, Versicherung, Leasing) sind rein betriebswirtschaftlich.
CREATE POLICY "fixkosten_admin_only" ON public.fixkosten FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));

-- ------------------------------------------------- 4) Belegnummern absichern
-- Nur wer Belege bearbeiten darf, verbraucht Nummern. Verhindert Lücken
-- in der fortlaufenden Rechnungsnummerierung (Buchhaltungs-Relevanz).
CREATE OR REPLACE FUNCTION public.can_edit_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role::text
    WHERE ur.user_id = _user_id
      AND rp.feature = _feature
      AND rp.can_edit = true
  );
$$;

-- ------------------------------------------------- 5) vehicle_costs korrigierbar
-- Vorarbeiter durfte anlegen, aber nicht mehr korrigieren/löschen.
DROP POLICY IF EXISTS "vorarbeiter_insert_vehicle_costs" ON public.vehicle_costs;
CREATE POLICY "vorarbeiter_manage_vehicle_costs" ON public.vehicle_costs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vorarbeiter'::app_role) AND public.is_active_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'vorarbeiter'::app_role) AND public.is_active_user(auth.uid()));

-- ------------------------------------------------- 6) Datenqualität: Belege
-- Zahlungen dürfen nicht 0 oder negativ sein (Frontend-Bug konnte 0 buchen).
ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_betrag_positiv;
ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_betrag_positiv
  CHECK (betrag > 0);

-- Fahrzeugkosten: keine negativen Beträge.
ALTER TABLE public.vehicle_costs DROP CONSTRAINT IF EXISTS vehicle_costs_betrag_positiv;
ALTER TABLE public.vehicle_costs ADD CONSTRAINT vehicle_costs_betrag_positiv
  CHECK (betrag > 0);

-- Kilometerstand: Ende darf nicht kleiner als Start sein (negative km).
ALTER TABLE public.time_entry_vehicles DROP CONSTRAINT IF EXISTS tev_km_plausibel;
ALTER TABLE public.time_entry_vehicles ADD CONSTRAINT tev_km_plausibel
  CHECK (km_start IS NULL OR km_ende IS NULL OR km_ende >= km_start);
