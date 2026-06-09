-- Allow all active users to read all customers (needed for Regiebericht customer selection)
DROP POLICY IF EXISTS "Users can view own customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;

CREATE POLICY "Active users can view all customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (is_active_user(auth.uid()));
