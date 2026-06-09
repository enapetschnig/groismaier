-- ============================================================
-- Einmaliger Cleanup: Nutzer "Chris Mustermann" komplett entfernen.
-- Safety: bricht ab, wenn kein oder mehr als ein Match gefunden wird.
-- ============================================================

DO $$
DECLARE
  v_user_id UUID;
  v_employee_id UUID;
  v_count INTEGER;
BEGIN
  -- Safety: exakt einen Mitarbeiter mit dem Namen finden
  SELECT COUNT(*) INTO v_count
  FROM public.employees
  WHERE lower(vorname) = 'chris' AND lower(nachname) = 'mustermann';

  IF v_count = 0 THEN
    -- Vielleicht nur profile ohne employee: 2. Versuch über profiles
    SELECT COUNT(*) INTO v_count
    FROM public.profiles
    WHERE lower(vorname) = 'chris' AND lower(nachname) = 'mustermann';
    IF v_count = 0 THEN
      RAISE NOTICE 'Kein Mitarbeiter "Chris Mustermann" gefunden – nichts zu tun.';
      RETURN;
    END IF;
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Mehrere Treffer für "Chris Mustermann" (% Stück). Abbruch, bitte manuell prüfen.', v_count;
  END IF;

  -- user_id + employee_id ermitteln (primär aus employees)
  SELECT e.user_id, e.id INTO v_user_id, v_employee_id
  FROM public.employees e
  WHERE lower(e.vorname) = 'chris' AND lower(e.nachname) = 'mustermann'
  LIMIT 1;

  -- Fallback: wenn kein employee, direkt aus profiles
  IF v_user_id IS NULL THEN
    SELECT p.id INTO v_user_id
    FROM public.profiles p
    WHERE lower(p.vorname) = 'chris' AND lower(p.nachname) = 'mustermann'
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Lösche Chris Mustermann: user_id=%, employee_id=%', v_user_id, v_employee_id;

  -- ── Referenzen auf employee.id auflösen ──────────────────
  IF v_employee_id IS NOT NULL THEN
    -- Projekt-Zuweisungen
    UPDATE public.projects SET verantwortlicher_id = NULL WHERE verantwortlicher_id = v_employee_id;
    UPDATE public.projects SET bauleiter_id = NULL WHERE bauleiter_id = v_employee_id;
    -- JSONB-Array zugewiesene_mitarbeiter: die employee-id rausfiltern
    UPDATE public.projects
    SET zugewiesene_mitarbeiter = COALESCE(
      (SELECT jsonb_agg(val) FROM jsonb_array_elements_text(zugewiesene_mitarbeiter) AS val WHERE val <> v_employee_id::text),
      '[]'::jsonb
    )
    WHERE zugewiesene_mitarbeiter ? v_employee_id::text;

    -- Plantafel-Farbe weg
    DELETE FROM public.employee_schedule_colors WHERE employee_id = v_employee_id;

    -- WhatsApp-Nachrichten: employee_id null-setzen (Historie bleibt)
    UPDATE public.whatsapp_messages SET employee_id = NULL WHERE employee_id = v_employee_id;
  END IF;

  -- ── Referenzen auf auth.users auflösen ─────────────────
  IF v_user_id IS NOT NULL THEN
    -- analog delete-user Edge-Function: alle bekannten FKs nullieren
    UPDATE public.projects SET user_id = NULL WHERE user_id = v_user_id;
    -- projects.erfasst_von: Spalte existiert evtl. nicht überall → defensiv
    BEGIN
      UPDATE public.projects SET erfasst_von = NULL WHERE erfasst_von = v_user_id;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    UPDATE public.time_entries SET approved_by = NULL WHERE approved_by = v_user_id;
    BEGIN
      UPDATE public.invitation_logs SET gesendet_von = NULL WHERE gesendet_von = v_user_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    UPDATE public.whatsapp_messages SET user_id = NULL WHERE user_id = v_user_id;
    UPDATE public.contact_history SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
    UPDATE public.bautagesberichte SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
    BEGIN
      UPDATE public.bautagesbericht_photos SET user_id = NULL WHERE user_id = v_user_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    UPDATE public.ersttermin_interessent SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
    BEGIN
      UPDATE public.ersttermin_interessent_photos SET user_id = NULL WHERE user_id = v_user_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    BEGIN
      UPDATE public.ersttermin_projekt SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    UPDATE public.besprechungsprotokolle SET erstellt_von = NULL WHERE erstellt_von = v_user_id;
    BEGIN
      UPDATE public.teams SET created_by = NULL WHERE created_by = v_user_id;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    UPDATE public.board_projects SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE public.einsaetze SET created_by = NULL WHERE created_by = v_user_id;
    BEGIN
      UPDATE public.audit_log SET user_id = NULL WHERE user_id = v_user_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- Zusätzliche Tabellen, die delete-user NICHT hatte:
    -- einsaetze.user_id → Einsatz löschen (keine Historie nötig)
    DELETE FROM public.einsaetze WHERE user_id = v_user_id;
    -- team_members.user_id → raus
    BEGIN
      DELETE FROM public.team_members WHERE user_id = v_user_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    -- leave_requests.user_id → raus
    BEGIN
      DELETE FROM public.leave_requests WHERE user_id = v_user_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    -- time_entries: User-eigene Einträge löschen
    DELETE FROM public.time_entries WHERE user_id = v_user_id;
    -- Rechnungen/Angebote wo der User Ersteller ist: created_by NULL setzen,
    -- nicht löschen (wegen Buchhaltung).
    BEGIN
      UPDATE public.invoices SET created_by = NULL WHERE created_by = v_user_id;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    BEGIN
      UPDATE public.purchase_invoices SET created_by = NULL WHERE created_by = v_user_id;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  -- ── Core-Records löschen ─────────────────────────────────
  IF v_employee_id IS NOT NULL THEN
    DELETE FROM public.employees WHERE id = v_employee_id;
  END IF;
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
    DELETE FROM public.profiles WHERE id = v_user_id;
    -- auth.users: benötigt Service-Rolle/Superuser. In der Migration läuft
    -- das als postgres → geht. Wenn es trotzdem fehlschlägt: nur warnen.
    BEGIN
      DELETE FROM auth.users WHERE id = v_user_id;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'auth.users DELETE fehlte Berechtigung – bitte manuell oder via delete-user Edge-Function entfernen. user_id=%', v_user_id;
    END;
  END IF;

  RAISE NOTICE 'Chris Mustermann komplett entfernt.';
END $$;
