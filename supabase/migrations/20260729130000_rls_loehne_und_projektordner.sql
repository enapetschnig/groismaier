-- ============================================================================
-- RLS-Härtung, Teil 3: Löhne der Kollegen und Belege im Projektordner.
--
-- Beides aus dem Mitarbeiter-Audit; beides für jeden aktiven Benutzer offen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles: Stundenlohn und SV-Nummer der Kollegen
--
--    Die SELECT-Policy lautet ((auth.uid() = id) OR is_active_user(auth.uid()))
--    — jeder aktive Benutzer darf also ALLE Profilzeilen lesen. Das ist für
--    Vorname/Nachname auch nötig (Zeiterfassung und Materialliste zeigen, wer
--    was gebucht hat). In profiles stehen aber zusätzlich stundenlohn,
--    sv_nummer, geburtsdatum und adresse.
--
--    Diese vier Spalten sind Altlast: Sie sind in allen Zeilen leer und werden
--    nirgends im Code gelesen — die gepflegten Werte liegen in `employees`,
--    das korrekt auf „eigener Datensatz oder Administrator" beschränkt ist.
--    Statt die Namensauflösung für alle zu brechen, verschwinden hier die
--    Spalten, die nicht in eine für alle lesbare Tabelle gehören.
--
--    Sicherheitsnetz: Sollte wider Erwarten doch irgendwo ein Wert stehen,
--    wird er vorher nach employees übernommen.
-- ---------------------------------------------------------------------------
UPDATE public.employees e
SET stundenlohn   = COALESCE(e.stundenlohn, p.stundenlohn),
    sv_nummer     = COALESCE(e.sv_nummer, p.sv_nummer),
    geburtsdatum  = COALESCE(e.geburtsdatum, p.geburtsdatum),
    adresse       = COALESCE(e.adresse, p.adresse)
FROM public.profiles p
WHERE e.user_id = p.id
  AND (p.stundenlohn IS NOT NULL OR p.sv_nummer IS NOT NULL
       OR p.geburtsdatum IS NOT NULL OR p.adresse IS NOT NULL);

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS stundenlohn,
  DROP COLUMN IF EXISTS sv_nummer,
  DROP COLUMN IF EXISTS geburtsdatum,
  DROP COLUMN IF EXISTS adresse;

-- ---------------------------------------------------------------------------
-- 2. Storage „project-reports": Angebots- und Rechnungs-PDFs
--
--    Die generierten Belege liegen unter <projekt-id>/angebote/… bzw.
--    <projekt-id>/rechnungen/…, im selben Bucket wie die Berichte, die
--    Mitarbeiter brauchen. Die Policy erlaubte bisher jedem Angemeldeten den
--    Blick in den ganzen Bucket — damit sah der Zimmerer die Angebotssumme
--    des Kunden.
--
--    Neu: Mitarbeiter sehen alles AUSSER diesen beiden Unterordnern.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view project reports" ON storage.objects;

CREATE POLICY "Authenticated users can view project reports" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-reports'
    AND (
      public.has_role(auth.uid(), 'administrator'::app_role)
      OR COALESCE((storage.foldername(name))[2], '') NOT IN ('angebote', 'rechnungen')
    )
  );
