-- ============================================================
-- Einmaliger Cleanup: Nutzer testnutzer@app.monti.pro (Test teeeest)
-- komplett entfernen inkl. aller Zeiterfassungs-Einträge.
-- ============================================================
-- Safety: matched exakt über die E-Mail-Adresse. Bricht ab, wenn kein
-- oder mehr als ein Match gefunden wird.

DO $$
DECLARE
  v_user_id UUID;
  v_employee_id UUID;
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM auth.users
   WHERE lower(email) = 'testnutzer@app.monti.pro';

  IF v_count = 0 THEN
    RAISE NOTICE 'Kein auth.users-Eintrag mit testnutzer@app.monti.pro – nichts zu tun.';
    RETURN;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'Mehrere auth.users mit testnutzer@app.monti.pro gefunden (%) – Abbruch.', v_count;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = 'testnutzer@app.monti.pro' LIMIT 1;
  SELECT id INTO v_employee_id FROM public.employees WHERE user_id = v_user_id LIMIT 1;

  RAISE NOTICE 'Lösche testnutzer: user_id=%, employee_id=%', v_user_id, v_employee_id;

  -- ── employee-Referenzen auflösen ────────────────────────────
  IF v_employee_id IS NOT NULL THEN
    UPDATE public.projects SET verantwortlicher_id = NULL WHERE verantwortlicher_id = v_employee_id;
    UPDATE public.projects SET bauleiter_id = NULL WHERE bauleiter_id = v_employee_id;
    UPDATE public.projects
       SET zugewiesene_mitarbeiter = COALESCE(
             (SELECT jsonb_agg(val) FROM jsonb_array_elements_text(zugewiesene_mitarbeiter) AS val
               WHERE val <> v_employee_id::text),
             '[]'::jsonb)
     WHERE zugewiesene_mitarbeiter ? v_employee_id::text;

    DELETE FROM public.employee_schedule_colors WHERE employee_id = v_employee_id;

    BEGIN
      UPDATE public.whatsapp_messages SET employee_id = NULL WHERE employee_id = v_employee_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  -- ── auth.users-FK-Referenzen nullen ─────────────────────────
  UPDATE public.projects SET user_id = NULL WHERE user_id = v_user_id;
  BEGIN UPDATE public.projects SET erfasst_von = NULL WHERE erfasst_von = v_user_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  UPDATE public.time_entries SET approved_by = NULL WHERE approved_by = v_user_id;
  BEGIN UPDATE public.invitation_logs SET gesendet_von = NULL WHERE gesendet_von = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.whatsapp_messages SET user_id = NULL WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  UPDATE public.contact_history SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
  UPDATE public.bautagesberichte SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
  BEGIN UPDATE public.bautagesbericht_photos SET user_id = NULL WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  UPDATE public.ersttermin_interessent SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
  BEGIN UPDATE public.ersttermin_interessent_photos SET user_id = NULL WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.ersttermin_projekt SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  UPDATE public.besprechungsprotokolle SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
  BEGIN UPDATE public.teams SET created_by = NULL WHERE created_by = v_user_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE public.board_projects SET created_by = NULL WHERE created_by = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.einsaetze SET created_by = NULL WHERE created_by = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.audit_log SET user_id = NULL WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- ── User-eigene Einträge hart löschen ───────────────────────
  BEGIN DELETE FROM public.einsaetze WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.team_members WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.leave_requests WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Fahrzeug-Zuordnungen zu Zeitbuchungen weg (FK wäre sonst Problem)
  BEGIN
    DELETE FROM public.time_entry_vehicles
     WHERE time_entry_id IN (SELECT id FROM public.time_entries WHERE user_id = v_user_id);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Alle Zeitbuchungen des Users löschen (explizit vom User gewünscht)
  DELETE FROM public.time_entries WHERE user_id = v_user_id;

  -- Sick-notes / Urlaubsanträge
  BEGIN DELETE FROM public.sick_notes WHERE user_id = v_user_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Rechnungs-Ersteller: Rechnungen behalten, nur created_by anonymisieren
  BEGIN UPDATE public.invoices SET created_by = NULL WHERE created_by = v_user_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE public.purchase_invoices SET created_by = NULL WHERE created_by = v_user_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;

  -- ── Core-Records löschen ────────────────────────────────────
  IF v_employee_id IS NOT NULL THEN
    DELETE FROM public.employees WHERE id = v_employee_id;
  END IF;
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- auth.users löschen — läuft in Migration mit postgres-Rechten.
  BEGIN
    DELETE FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'auth.users DELETE fehlte Berechtigung – bitte via delete-user Edge-Function entfernen. user_id=%', v_user_id;
  END;

  RAISE NOTICE 'testnutzer@app.monti.pro komplett entfernt.';
END $$;

-- Diagnose
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== Prüfung: User noch in auth.users? ===';
  FOR r IN
    SELECT email FROM auth.users WHERE lower(email) = 'testnutzer@app.monti.pro'
  LOOP
    RAISE NOTICE '  UNGELÖSCHT: %', r.email;
  END LOOP;
  RAISE NOTICE '=== Prüfung: Profile noch da? ===';
  FOR r IN
    SELECT p.vorname, p.nachname FROM public.profiles p
     WHERE lower(p.vorname) = 'test' AND lower(p.nachname) = 'teeeest'
  LOOP
    RAISE NOTICE '  UNGELÖSCHT Profile: % %', r.vorname, r.nachname;
  END LOOP;
END $$;
