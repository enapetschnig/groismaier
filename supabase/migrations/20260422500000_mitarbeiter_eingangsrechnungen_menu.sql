-- ============================================================
-- Sicherstellen, dass Mitarbeiter den Menüpunkt "Eingangsrechnungen"
-- am Handy sehen (zum Hochladen). Leseberechtigung auf bestehende
-- fremde Rechnungen ist weiterhin via RLS eingeschränkt (Mitarbeiter
-- sehen nur eigene Uploads).
-- ============================================================

-- Upsert: stellt sicher, dass der Eintrag existiert und can_view=true ist.
INSERT INTO public.role_permissions (role, feature, can_view, can_edit)
VALUES ('mitarbeiter', 'eingangsrechnungen', TRUE, TRUE)
ON CONFLICT (role, feature) DO UPDATE
  SET can_view = TRUE, can_edit = TRUE;
