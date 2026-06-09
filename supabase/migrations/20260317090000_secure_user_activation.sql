-- ============================================================
-- SECURE USER ACTIVATION: Admin must approve new registrations
-- ============================================================

-- 1. Helper function: check if user is active
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- 2. Update handle_new_user: new users are INACTIVE by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_whitelisted BOOLEAN;
BEGIN
  is_whitelisted := NEW.email IN ('napetschnig.chris@gmail.com');

  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'vorname', ''),
    COALESCE(NEW.raw_user_meta_data->>'nachname', ''),
    is_whitelisted
  );

  -- Only whitelisted admins get a role immediately
  IF is_whitelisted THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  -- All others: no role until admin activates them

  RETURN NEW;
END;
$$;

-- 3. Update ensure_user_profile: same logic
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_meta jsonb;
  is_whitelisted boolean;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    RETURN json_build_object('success', true, 'action', 'existing');
  END IF;

  SELECT email, raw_user_meta_data
  INTO user_email, user_meta
  FROM auth.users
  WHERE id = current_user_id;

  is_whitelisted := user_email IN ('napetschnig.chris@gmail.com');

  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  VALUES (
    current_user_id,
    COALESCE(user_meta->>'vorname', ''),
    COALESCE(user_meta->>'nachname', ''),
    is_whitelisted
  );

  IF is_whitelisted THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (current_user_id, 'administrator')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN json_build_object(
    'success', true,
    'action', 'created',
    'activated', is_whitelisted
  );
END;
$$;

-- 4. RPC to activate user (admin only)
CREATE OR REPLACE FUNCTION public.activate_user(
  _user_id UUID,
  _role app_role
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is an active administrator
  IF NOT (
    is_active_user(auth.uid())
    AND has_role(auth.uid(), 'administrator')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Activate user
  UPDATE public.profiles SET is_active = true WHERE id = _user_id;

  -- Remove existing roles and assign the chosen one
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);

  RETURN json_build_object('success', true);
END;
$$;


-- ============================================================
-- 5. RLS POLICY UPDATES: Add is_active_user() check
-- ============================================================
-- Strategy: Drop and recreate policies with is_active_user() gate
-- Exceptions: profiles SELECT, user_roles SELECT stay open

-- ---- PROJECTS ----
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;
CREATE POLICY "Authenticated users can view projects" ON public.projects
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert projects" ON public.projects;
CREATE POLICY "Authenticated users can insert projects" ON public.projects
  FOR INSERT WITH CHECK (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
CREATE POLICY "Admins can update projects" ON public.projects
  FOR UPDATE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
CREATE POLICY "Admins can delete projects" ON public.projects
  FOR DELETE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- ---- TIME_ENTRIES ----
DROP POLICY IF EXISTS "Users can view own time entries" ON public.time_entries;
CREATE POLICY "Users can view own time entries" ON public.time_entries
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all time entries" ON public.time_entries;
CREATE POLICY "Admins can view all time entries" ON public.time_entries
  FOR SELECT USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own time entries" ON public.time_entries;
CREATE POLICY "Users can insert own time entries" ON public.time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own time entries" ON public.time_entries;
CREATE POLICY "Users can update own time entries" ON public.time_entries
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own time entries" ON public.time_entries;
CREATE POLICY "Users can delete own time entries" ON public.time_entries
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

-- ---- DOCUMENTS ----
DROP POLICY IF EXISTS "Authenticated users can view documents" ON public.documents;
CREATE POLICY "Authenticated users can view documents" ON public.documents
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert documents" ON public.documents;
CREATE POLICY "Users can insert documents" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all documents" ON public.documents;
CREATE POLICY "Admins can delete all documents" ON public.documents
  FOR DELETE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- ---- REPORTS ----
DROP POLICY IF EXISTS "Authenticated users can view reports" ON public.reports;
CREATE POLICY "Authenticated users can view reports" ON public.reports
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert reports" ON public.reports;
CREATE POLICY "Users can insert reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own reports" ON public.reports;
CREATE POLICY "Users can update own reports" ON public.reports
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all reports" ON public.reports;
CREATE POLICY "Admins can update all reports" ON public.reports
  FOR UPDATE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- ---- EMPLOYEES ----
DROP POLICY IF EXISTS "Admins can view all employees" ON public.employees;
CREATE POLICY "Admins can view all employees" ON public.employees
  FOR SELECT USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can view own employee data" ON public.employees;
CREATE POLICY "Users can view own employee data" ON public.employees
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert employees" ON public.employees;
CREATE POLICY "Admins can insert employees" ON public.employees
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update employees" ON public.employees;
CREATE POLICY "Admins can update employees" ON public.employees
  FOR UPDATE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete employees" ON public.employees;
CREATE POLICY "Admins can delete employees" ON public.employees
  FOR DELETE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- ---- DISTURBANCES ----
DROP POLICY IF EXISTS "Users can view own disturbances" ON public.disturbances;
CREATE POLICY "Users can view own disturbances" ON public.disturbances
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all disturbances" ON public.disturbances;
CREATE POLICY "Admins can view all disturbances" ON public.disturbances
  FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own disturbances" ON public.disturbances;
CREATE POLICY "Users can insert own disturbances" ON public.disturbances
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own disturbances" ON public.disturbances;
CREATE POLICY "Users can update own disturbances" ON public.disturbances
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all disturbances" ON public.disturbances;
CREATE POLICY "Admins can update all disturbances" ON public.disturbances
  FOR UPDATE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own disturbances" ON public.disturbances;
CREATE POLICY "Users can delete own disturbances" ON public.disturbances
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all disturbances" ON public.disturbances;
CREATE POLICY "Admins can delete all disturbances" ON public.disturbances
  FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- DISTURBANCE_MATERIALS ----
DROP POLICY IF EXISTS "Authenticated users can view disturbance materials" ON public.disturbance_materials;
CREATE POLICY "Authenticated users can view disturbance materials" ON public.disturbance_materials
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own disturbance materials" ON public.disturbance_materials;
CREATE POLICY "Users can insert own disturbance materials" ON public.disturbance_materials
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own disturbance materials" ON public.disturbance_materials;
CREATE POLICY "Users can update own disturbance materials" ON public.disturbance_materials
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own disturbance materials" ON public.disturbance_materials;
CREATE POLICY "Users can delete own disturbance materials" ON public.disturbance_materials
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete any disturbance materials" ON public.disturbance_materials;
CREATE POLICY "Admins can delete any disturbance materials" ON public.disturbance_materials
  FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- DISTURBANCE_PHOTOS ----
DROP POLICY IF EXISTS "Authenticated users can view disturbance photos" ON public.disturbance_photos;
CREATE POLICY "Authenticated users can view disturbance photos" ON public.disturbance_photos
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own disturbance photos" ON public.disturbance_photos;
CREATE POLICY "Users can insert own disturbance photos" ON public.disturbance_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own disturbance photos" ON public.disturbance_photos;
CREATE POLICY "Users can delete own disturbance photos" ON public.disturbance_photos
  FOR DELETE USING ((auth.uid() = user_id OR has_role(auth.uid(), 'administrator')) AND is_active_user(auth.uid()));

-- ---- DISTURBANCE_WORKERS ----
DROP POLICY IF EXISTS "Authenticated users can view disturbance workers" ON public.disturbance_workers;
CREATE POLICY "Authenticated users can view disturbance workers" ON public.disturbance_workers
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert disturbance workers for own disturbances" ON public.disturbance_workers;
CREATE POLICY "Users can insert disturbance workers for own disturbances" ON public.disturbance_workers
  FOR INSERT WITH CHECK (
    is_active_user(auth.uid()) AND (
      (EXISTS (SELECT 1 FROM public.disturbances WHERE id = disturbance_id AND user_id = auth.uid()))
      OR has_role(auth.uid(), 'administrator'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users can update disturbance workers for own disturbances" ON public.disturbance_workers;
CREATE POLICY "Users can update disturbance workers for own disturbances" ON public.disturbance_workers
  FOR UPDATE USING (
    is_active_user(auth.uid()) AND (
      (EXISTS (SELECT 1 FROM public.disturbances WHERE id = disturbance_id AND user_id = auth.uid()))
      OR has_role(auth.uid(), 'administrator'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users can delete disturbance workers for own disturbances" ON public.disturbance_workers;
CREATE POLICY "Users can delete disturbance workers for own disturbances" ON public.disturbance_workers
  FOR DELETE USING (
    is_active_user(auth.uid()) AND (
      (EXISTS (SELECT 1 FROM public.disturbances WHERE id = disturbance_id AND user_id = auth.uid()))
      OR has_role(auth.uid(), 'administrator'::app_role)
    )
  );

-- ---- TIME_ENTRY_WORKERS ----
DROP POLICY IF EXISTS "Users can view own time entry workers" ON public.time_entry_workers;
CREATE POLICY "Users can view own time entry workers" ON public.time_entry_workers
  FOR SELECT USING (
    is_active_user(auth.uid()) AND (
      user_id = auth.uid()
      OR (EXISTS (SELECT 1 FROM public.time_entries WHERE id = source_entry_id AND user_id = auth.uid()))
      OR has_role(auth.uid(), 'administrator'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users can insert time entry workers for own entries" ON public.time_entry_workers;
CREATE POLICY "Users can insert time entry workers for own entries" ON public.time_entry_workers
  FOR INSERT WITH CHECK (
    is_active_user(auth.uid()) AND (
      (EXISTS (SELECT 1 FROM public.time_entries WHERE id = source_entry_id AND user_id = auth.uid()))
      OR has_role(auth.uid(), 'administrator'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users can delete time entry workers for own entries" ON public.time_entry_workers;
CREATE POLICY "Users can delete time entry workers for own entries" ON public.time_entry_workers
  FOR DELETE USING (
    is_active_user(auth.uid()) AND (
      (EXISTS (SELECT 1 FROM public.time_entries WHERE id = source_entry_id AND user_id = auth.uid()))
      OR has_role(auth.uid(), 'administrator'::app_role)
    )
  );

-- ---- MATERIAL_ENTRIES ----
DROP POLICY IF EXISTS "Authenticated users can view material entries" ON public.material_entries;
CREATE POLICY "Authenticated users can view material entries" ON public.material_entries
  FOR SELECT USING (is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own material entries" ON public.material_entries;
CREATE POLICY "Users can insert own material entries" ON public.material_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own material entries" ON public.material_entries;
CREATE POLICY "Users can update own material entries" ON public.material_entries
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own material entries" ON public.material_entries;
CREATE POLICY "Users can delete own material entries" ON public.material_entries
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete any material entries" ON public.material_entries;
CREATE POLICY "Admins can delete any material entries" ON public.material_entries
  FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- WEEK_SETTINGS ----
DROP POLICY IF EXISTS "Users can view own week settings" ON public.week_settings;
CREATE POLICY "Users can view own week settings" ON public.week_settings
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own week settings" ON public.week_settings;
CREATE POLICY "Users can insert own week settings" ON public.week_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own week settings" ON public.week_settings;
CREATE POLICY "Users can update own week settings" ON public.week_settings
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own week settings" ON public.week_settings;
CREATE POLICY "Users can delete own week settings" ON public.week_settings
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all week settings" ON public.week_settings;
CREATE POLICY "Admins can view all week settings" ON public.week_settings
  FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- LEAVE_BALANCES ----
DROP POLICY IF EXISTS "Users can view own leave balance" ON public.leave_balances;
CREATE POLICY "Users can view own leave balance" ON public.leave_balances
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all leave balances" ON public.leave_balances;
CREATE POLICY "Admins can view all leave balances" ON public.leave_balances
  FOR SELECT USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert leave balances" ON public.leave_balances;
CREATE POLICY "Admins can insert leave balances" ON public.leave_balances
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update leave balances" ON public.leave_balances;
CREATE POLICY "Admins can update leave balances" ON public.leave_balances
  FOR UPDATE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete leave balances" ON public.leave_balances;
CREATE POLICY "Admins can delete leave balances" ON public.leave_balances
  FOR DELETE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- ---- LEAVE_REQUESTS ----
DROP POLICY IF EXISTS "Users can view own leave requests" ON public.leave_requests;
CREATE POLICY "Users can view own leave requests" ON public.leave_requests
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own leave requests" ON public.leave_requests;
CREATE POLICY "Users can insert own leave requests" ON public.leave_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own pending leave requests" ON public.leave_requests;
CREATE POLICY "Users can delete own pending leave requests" ON public.leave_requests
  FOR DELETE USING (auth.uid() = user_id AND status = 'beantragt' AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all leave requests" ON public.leave_requests;
CREATE POLICY "Admins can view all leave requests" ON public.leave_requests
  FOR SELECT USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all leave requests" ON public.leave_requests;
CREATE POLICY "Admins can update all leave requests" ON public.leave_requests
  FOR UPDATE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all leave requests" ON public.leave_requests;
CREATE POLICY "Admins can delete all leave requests" ON public.leave_requests
  FOR DELETE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- ---- TIME_ACCOUNTS ----
DROP POLICY IF EXISTS "Users can view own time account" ON public.time_accounts;
CREATE POLICY "Users can view own time account" ON public.time_accounts
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all time accounts" ON public.time_accounts;
CREATE POLICY "Admins can view all time accounts" ON public.time_accounts
  FOR SELECT USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert time accounts" ON public.time_accounts;
CREATE POLICY "Admins can insert time accounts" ON public.time_accounts
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update time accounts" ON public.time_accounts;
CREATE POLICY "Admins can update time accounts" ON public.time_accounts
  FOR UPDATE USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own time account" ON public.time_accounts;
CREATE POLICY "Users can update own time account" ON public.time_accounts
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

-- ---- TIME_ACCOUNT_TRANSACTIONS ----
DROP POLICY IF EXISTS "Users can view own transactions" ON public.time_account_transactions;
CREATE POLICY "Users can view own transactions" ON public.time_account_transactions
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.time_account_transactions;
CREATE POLICY "Admins can view all transactions" ON public.time_account_transactions
  FOR SELECT USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert transactions" ON public.time_account_transactions;
CREATE POLICY "Admins can insert transactions" ON public.time_account_transactions
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own transactions" ON public.time_account_transactions;
CREATE POLICY "Users can insert own transactions" ON public.time_account_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id AND auth.uid() = changed_by AND is_active_user(auth.uid()));

-- ---- INVOICES ----
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
CREATE POLICY "Users can view own invoices" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all invoices" ON public.invoices;
CREATE POLICY "Admins can view all invoices" ON public.invoices
  FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own invoices" ON public.invoices;
CREATE POLICY "Users can insert own invoices" ON public.invoices
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
CREATE POLICY "Users can update own invoices" ON public.invoices
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all invoices" ON public.invoices;
CREATE POLICY "Admins can update all invoices" ON public.invoices
  FOR UPDATE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;
CREATE POLICY "Users can delete own invoices" ON public.invoices
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all invoices" ON public.invoices;
CREATE POLICY "Admins can delete all invoices" ON public.invoices
  FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- INVOICE_ITEMS ----
DROP POLICY IF EXISTS "Users can view own invoice items" ON public.invoice_items;
CREATE POLICY "Users can view own invoice items" ON public.invoice_items
  FOR SELECT USING (
    is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND (invoices.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

DROP POLICY IF EXISTS "Users can insert own invoice items" ON public.invoice_items;
CREATE POLICY "Users can insert own invoice items" ON public.invoice_items
  FOR INSERT WITH CHECK (
    is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND (invoices.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

DROP POLICY IF EXISTS "Users can update own invoice items" ON public.invoice_items;
CREATE POLICY "Users can update own invoice items" ON public.invoice_items
  FOR UPDATE USING (
    is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND (invoices.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

DROP POLICY IF EXISTS "Users can delete own invoice items" ON public.invoice_items;
CREATE POLICY "Users can delete own invoice items" ON public.invoice_items
  FOR DELETE USING (
    is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND (invoices.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

-- ---- INVOICE_TEMPLATES ----
DROP POLICY IF EXISTS "Admins can manage invoice templates" ON public.invoice_templates;
CREATE POLICY "Admins can manage invoice templates" ON public.invoice_templates
  FOR ALL USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view invoice templates" ON public.invoice_templates;
CREATE POLICY "Authenticated users can view invoice templates" ON public.invoice_templates
  FOR SELECT USING (is_active_user(auth.uid()));

-- ---- CUSTOMERS ----
DROP POLICY IF EXISTS "Users can view own customers" ON public.customers;
CREATE POLICY "Users can view own customers" ON public.customers
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own customers" ON public.customers;
CREATE POLICY "Users can insert own customers" ON public.customers
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own customers" ON public.customers;
CREATE POLICY "Users can update own customers" ON public.customers
  FOR UPDATE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete own customers" ON public.customers;
CREATE POLICY "Users can delete own customers" ON public.customers
  FOR DELETE USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;
CREATE POLICY "Admins can view all customers" ON public.customers
  FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert customers" ON public.customers;
CREATE POLICY "Admins can insert customers" ON public.customers
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all customers" ON public.customers;
CREATE POLICY "Admins can update all customers" ON public.customers
  FOR UPDATE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all customers" ON public.customers;
CREATE POLICY "Admins can delete all customers" ON public.customers
  FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- OFFER_PACKAGES ----
DROP POLICY IF EXISTS "Admins can manage offer packages" ON public.offer_packages;
CREATE POLICY "Admins can manage offer packages" ON public.offer_packages
  FOR ALL USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can view own offer packages" ON public.offer_packages;
CREATE POLICY "Users can view own offer packages" ON public.offer_packages
  FOR SELECT USING (auth.uid() = user_id AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can manage own offer packages" ON public.offer_packages;
CREATE POLICY "Users can manage own offer packages" ON public.offer_packages
  FOR ALL USING (auth.uid() = user_id AND is_active_user(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

-- ---- OFFER_PACKAGE_ITEMS ----
DROP POLICY IF EXISTS "Users can view package items" ON public.offer_package_items;
CREATE POLICY "Users can view package items" ON public.offer_package_items
  FOR SELECT USING (
    is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.offer_packages
      WHERE id = offer_package_items.package_id
      AND (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

DROP POLICY IF EXISTS "Users can manage package items" ON public.offer_package_items;
CREATE POLICY "Users can manage package items" ON public.offer_package_items
  FOR ALL USING (
    is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.offer_packages
      WHERE id = offer_package_items.package_id
      AND (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  ) WITH CHECK (
    is_active_user(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.offer_packages
      WHERE id = offer_package_items.package_id
      AND (user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

-- ---- INVITATION_LOGS ----
DROP POLICY IF EXISTS "Admins can view invitations" ON public.invitation_logs;
CREATE POLICY "Admins can view invitations" ON public.invitation_logs
  FOR SELECT USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert invitations" ON public.invitation_logs;
CREATE POLICY "Admins can insert invitations" ON public.invitation_logs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- APP_SETTINGS ----
-- Keep SELECT open (needed for app config), but gate write operations
DROP POLICY IF EXISTS "Admins can manage settings" ON public.app_settings;
CREATE POLICY "Admins can manage settings" ON public.app_settings
  FOR ALL USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- ---- PROFILES: keep SELECT open, gate UPDATE ----
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id AND is_active_user(auth.uid()));

-- Admins can update all profiles (needed for activation) - keep working even when target is inactive
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- ---- USER_ROLES: keep SELECT open, gate write with is_active ----
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE USING (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));
