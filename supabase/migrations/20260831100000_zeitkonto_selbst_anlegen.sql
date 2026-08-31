-- ============================================================================
--  Zeitausgleich buchen repariert (Meldung von Christian, 31.08.2026)
-- ============================================================================
--
-- Ein Mitarbeiter konnte keinen ZA buchen: Der App-Code legt seit 29.08. ein
-- fehlendes Zeitkonto automatisch an - die INSERT-Policy auf time_accounts
-- erlaubte das aber NUR Administratoren. Beim Mitarbeiter schlug das Anlegen
-- mit einer RLS-Verletzung fehl (live reproduziert: HTTP 42501), die App
-- zeigte "Zeitkonto konnte nicht geladen werden".
--
-- Zwei Schrauben:
--  1. Mitarbeiter duerfen ihr EIGENES Zeitkonto anlegen - aber nur leer
--     (balance_hours = 0). Guthaben entsteht weiterhin ausschliesslich ueber
--     die Monatsauswertung bzw. den Admin.
--  2. Bestand: Jedes Profil ohne Konto bekommt sofort eines - dann laeuft
--     kuenftig niemand mehr in den Anlege-Pfad.

DROP POLICY IF EXISTS "Users can create own empty time account" ON public.time_accounts;
CREATE POLICY "Users can create own empty time account" ON public.time_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND balance_hours = 0 AND is_active_user(auth.uid()));

INSERT INTO public.time_accounts (user_id, balance_hours)
SELECT p.id, 0
  FROM public.profiles p
 WHERE NOT EXISTS (SELECT 1 FROM public.time_accounts t WHERE t.user_id = p.id);

-- Neuerung fuer die Startseite (sehen nur Administratoren)
INSERT INTO public.neuerungen (titel, text) VALUES
  ('Zeitausgleich buchen repariert',
   'Mitarbeiter ohne Zeitkonto liefen beim ZA-Buchen in einen Fehler. Jedes Profil hat jetzt ein Zeitkonto; Urlaub, Krankenstand und Co. wurden mitgeprueft und funktionieren.');
