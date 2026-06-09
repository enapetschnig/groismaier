-- Audit-Log für sensible Admin-Aktionen
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,           -- z.B. 'invoice.deleted', 'user.role_changed'
  entity_type TEXT,               -- z.B. 'invoice', 'user', 'customer'
  entity_id TEXT,                 -- ID des betroffenen Records
  old_values JSONB,               -- Werte vor der Änderung
  new_values JSONB,               -- Werte nach der Änderung
  metadata JSONB,                 -- Zusatz-Info (z.B. Grund)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Nur Admins lesen das Audit-Log
CREATE POLICY "Admins can read audit_log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role));

-- Jeder authentifizierte User kann Einträge anlegen (aber nur für sich selbst)
CREATE POLICY "Users can insert own audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Niemand darf Einträge ändern oder löschen (Unveränderbarkeit)
-- (keine UPDATE/DELETE-Policies → default deny)
