-- ============================================================
-- Backfill: alte project-photos-Bucket-Files in documents-Tabelle
-- ============================================================
-- Historisch wurden Projekt-Fotos nur als Storage-Files unter
--   {project-photos}/{project_id}/{filename}
-- abgelegt — ohne DB-Eintrag in public.documents.
--
-- Die neue einheitliche PhotoGallery (ProjectPhotoGallery.tsx) liest
-- jedoch ausschließlich die documents-Tabelle mit typ='photos'. Fotos,
-- die vor dem Umbau hochgeladen wurden, werden dadurch im UI nicht
-- mehr angezeigt — obwohl sie physisch noch da sind.
--
-- Diese Migration trägt jedes Storage-File im project-photos-Bucket
-- nachträglich als documents-Row ein, damit die Galerie sie wieder
-- sieht. **Es werden keine Dateien gelöscht.** Die Migration ist
-- idempotent: mehrfaches Ausführen erzeugt keine Duplikate.
--
-- Fallback-Owner: Günter Zerzawy (vom User bestimmt). Wenn ein
-- Storage-Objekt einen `owner` hat und dieser in auth.users existiert,
-- wird der als user_id übernommen — sonst Günter.

DO $$
DECLARE
  v_fallback_user UUID;
  v_supabase_url TEXT := 'https://zbxizeirecoipqvxymdx.supabase.co';
  v_inserted INT;
  v_skipped INT;
  r RECORD;
  v_project_id UUID;
  v_filename TEXT;
  v_owner UUID;
  v_target_user UUID;
  v_file_url TEXT;
BEGIN
  -- Fallback-User ermitteln: Günter Zerzawy aus profiles
  SELECT id INTO v_fallback_user
  FROM public.profiles
  WHERE lower(vorname) = 'günter' AND lower(nachname) = 'zerzawy'
  LIMIT 1;

  IF v_fallback_user IS NULL THEN
    -- Fallback zum Fallback: irgendeinen Admin nehmen
    SELECT ur.user_id INTO v_fallback_user
    FROM public.user_roles ur
    WHERE ur.role = 'administrator'
    ORDER BY ur.user_id
    LIMIT 1;
  END IF;

  IF v_fallback_user IS NULL THEN
    -- [Holzbau Groismaier] Frische Datenbank ohne Benutzer/Storage-Objekte:
    -- es gibt nichts zu backfillen. Sauber beenden statt abbrechen.
    RAISE NOTICE 'Kein Fallback-Owner vorhanden – Backfill übersprungen (frische DB, nichts zu migrieren).';
    RETURN;
  END IF;

  RAISE NOTICE 'Fallback-User für Backfill: %', v_fallback_user;

  v_inserted := 0;
  v_skipped := 0;

  FOR r IN
    SELECT so.name, so.owner
    FROM storage.objects so
    WHERE so.bucket_id = 'project-photos'
      -- Pfad muss Format projectId/filename haben (mindestens ein /)
      AND so.name LIKE '%/%'
      -- Keine Ordner-Marker (leere Files am Ende mit /)
      AND so.name NOT LIKE '%/'
  LOOP
    -- Pfad zerlegen: projectId/filename.ext
    v_project_id := NULL;
    v_filename := NULL;
    BEGIN
      v_project_id := (split_part(r.name, '/', 1))::uuid;
      v_filename := substring(r.name FROM position('/' IN r.name) + 1);
    EXCEPTION WHEN OTHERS THEN
      -- Kein UUID-Format im ersten Pfadsegment → skip
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;

    -- Existiert das Projekt noch?
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_file_url := v_supabase_url || '/storage/v1/object/public/project-photos/' || r.name;

    -- Schon in documents? Dann skip (Idempotenz)
    IF EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.typ = 'photos'
        AND d.project_id = v_project_id
        AND (d.file_url = v_file_url OR d.file_url LIKE '%' || r.name)
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Owner ermitteln: Storage-Owner wenn er in auth.users existiert, sonst Fallback
    v_owner := r.owner;
    IF v_owner IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) THEN
      v_target_user := v_fallback_user;
    ELSE
      v_target_user := v_owner;
    END IF;

    -- Eintragen
    INSERT INTO public.documents (project_id, user_id, typ, name, file_url, beschreibung)
    VALUES (v_project_id, v_target_user, 'photos', v_filename, v_file_url, NULL);

    v_inserted := v_inserted + 1;
  END LOOP;

  RAISE NOTICE 'Backfill abgeschlossen: % Fotos neu in documents eingetragen, % übersprungen (bereits da oder ungültig).', v_inserted, v_skipped;
END $$;
