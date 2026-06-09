-- Eingangsrechnungen: nur Admin hat Zugriff
DROP POLICY IF EXISTS "Vorarbeiter can manage purchase_invoices" ON public.purchase_invoices;

-- Update default permission row
UPDATE role_permissions
SET can_view = false, can_edit = false
WHERE role = 'vorarbeiter' AND feature = 'eingangsrechnungen';
