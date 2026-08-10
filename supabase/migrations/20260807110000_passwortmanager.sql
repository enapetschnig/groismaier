-- ============================================================================
-- Passwortmanager (Kundenwunsch): eigener Menüpunkt unter Verwaltung mit
-- separatem Zahlen-Code als Zugang — „dann wäre das auch einmal digital".
--
-- Sicherheitsmodell: Die Passwörter werden IM BROWSER ver- und entschlüsselt
-- (WebCrypto, PBKDF2-SHA256 600k Iterationen -> AES-256-GCM). In der
-- Datenbank liegt nur Ciphertext; der Zahlen-Code verlässt das Gerät nie.
-- passwort_tresor hält Salt + verschlüsselten Prüfwert (eine Zeile je Firma),
-- passwort_eintraege die Einträge (Titel/Benutzer/URL im Klartext für die
-- Suche, Passwort + Notiz nur verschlüsselt).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.passwort_tresor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_salt text NOT NULL,
  pin_check text NOT NULL,
  kdf_iterationen integer NOT NULL DEFAULT 600000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.passwort_eintraege (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel text NOT NULL,
  benutzername text,
  url text,
  daten_verschluesselt text NOT NULL, -- AES-GCM: base64(iv || ciphertext) von JSON {passwort, notiz}
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.passwort_tresor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passwort_eintraege ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins verwalten Tresor-Konfiguration"
  ON public.passwort_tresor FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "Admins verwalten Passwort-Eintraege"
  ON public.passwort_eintraege FOR ALL
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));
