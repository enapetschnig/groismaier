-- Allow administrators to update any user's time entries
CREATE POLICY "Admins can update all time entries"
ON public.time_entries
FOR UPDATE
USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));

-- Allow administrators to delete any user's time entries
CREATE POLICY "Admins can delete all time entries"
ON public.time_entries
FOR DELETE
USING (has_role(auth.uid(), 'administrator') AND is_active_user(auth.uid()));
