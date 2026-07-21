-- ============================================================================
-- documents: fehlende UPDATE-Policy (Befund Restabdeckungs-Review 2026-07-22)
--
-- public.documents hatte SELECT/INSERT/DELETE, aber KEINE UPDATE-Policy.
-- Folge: Jedes UPDATE (z. B. Datei umbenennen) lief unter RLS ins Leere —
-- Supabase meldet keinen Fehler, es werden schlicht 0 Zeilen geändert.
-- Der Anwender sah "gespeichert", die Änderung war aber nie da.
-- ============================================================================

-- Eigene Dokumente darf der Ersteller ändern; Administratoren alle.
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user(auth.uid()))
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update all documents" ON public.documents;
CREATE POLICY "Admins can update all documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role) AND public.is_active_user(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));
