-- ============================================================================
--  Ablage fuer das Uebergabepaket (Kundenwunsch 10.09.2026)
-- ============================================================================
-- "perfekt waere wenn das backup zip direkt in der app waere, dass ich gar
--  nix per wetransfer schicken muss"
--
-- Hier landet einmal im Monat das komplette Paket: Quellcode, Anleitungen und
-- die Datensicherung. Der Chef laedt es im Admin-Bereich mit einem Klick
-- herunter - kein WeTransfer, kein GitHub-Konto, und nie veraltet.
--
-- Der Bucket ist NICHT oeffentlich, und lesen darf ihn ausschliesslich ein
-- Administrator: Im Paket stecken saemtliche Kunden- und Mitarbeiterdaten.
-- Ein Mitarbeiter mit App-Zugang darf da nicht heran.
--
-- Geschrieben wird nur vom GitHub-Workflow ueber den Service-Role-Key; der
-- umgeht RLS ohnehin, deshalb gibt es dafuer bewusst KEINE Insert-Policy.
--
-- Keine Belegdaten werden angefasst.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uebergabe', 'uebergabe', false, 524288000)   -- 500 MB Obergrenze
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 524288000;

DROP POLICY IF EXISTS "Nur Administratoren lesen das Uebergabepaket" ON storage.objects;
CREATE POLICY "Nur Administratoren lesen das Uebergabepaket"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'uebergabe'
    AND public.has_role(auth.uid(), 'administrator')
  );

-- ── Wegbeschreibung zu den Regie-Saetzen korrigieren ────────────────────────
-- Beim Einbauen der neuen Karte aufgefallen: Die Neuerung vom 09.09. nennt
-- "Einstellungen > Einstellungen". Der Editor sitzt aber im Reiter
-- "Rechnungs-Layout". Genau darueber gab es schon einmal eine Rueckmeldung
-- ("Kalkulation - Einstellungen gibt es bei mir nicht") - eine zweite
-- vergebliche Suche muss nicht sein.
UPDATE public.neuerungen
   SET text = 'Unter Admin > Rechnungs-Layout (ganz oben, ueber den Dokumenttexten) pflegst du die Saetze fuer Regiearbeiten: Vorarbeiter, Facharbeiter, Hilfsarbeiter, Lehrling sowie Montagebus und LKW je Kilometer. Sie stehen automatisch am Ende jedes Angebots - aenderst du einen Betrag, gilt er ueberall. Den Text drumherum aenderst du bei den Dokumenttexten (Platzhalter {{regiesaetze}}).'
 WHERE titel = 'Saetze fuer Regiearbeiten';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Sicherheitskopie der App zum Herunterladen',
   'Unter Admin > Einstellungen gibt es jetzt die Sicherheitskopie: eine Datei mit allem, was zu dieser App gehoert - dem Programm selbst, den Anleitungen und einer Sicherung aller Daten (Kunden, Angebote, Rechnungen, Stunden, Projekte). Sie wird jeden Monat automatisch neu erstellt. Im Alltag brauchst du sie nicht. Sollte aber einmal niemand mehr erreichbar sein, der die App betreut, genuegt diese eine Datei: Jeder IT-Fachmann bringt die App damit wieder online, die Anleitung dafuer liegt im Paket ganz oben. Am besten einmal herunterladen und sicher verwahren - es stehen alle Kunden- und Mitarbeiterdaten darin.');
