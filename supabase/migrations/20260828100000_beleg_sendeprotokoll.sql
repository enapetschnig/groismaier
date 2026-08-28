-- ============================================================================
--  SENDEPROTOKOLL — Beleg-Versand nachvollziehbar machen (Kundenwunsch 27.08.)
-- ============================================================================
--
-- Christian: "Bzgl der Dokumentation und Nachvollziehbarkeit brauch ich eine
-- Funktion, dass wenn eine Rechnung oder ein Anbot ... versendet werden, eine
-- Sendebestätigung mit Uhrzeit und Datum im Projekt als eigene Kategorie
-- abgespeichert werden. ... wenn noch kein Projekt angelegt wurde, braucht es
-- auch eine Möglichkeit das gesammelt zu finden."
--
-- Jeder erfolgreiche Versand aus dem Beleg-Mail-Dialog schreibt hier eine
-- Zeile. Das Projekt zeigt seine Einträge als eigene Kategorie; die Seite
-- /sendeprotokoll sammelt ALLE Einträge — auch die ohne Projekt.

CREATE TABLE IF NOT EXISTS public.beleg_sendeprotokoll (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gesendet_von      UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  gesendet_am       TIMESTAMPTZ NOT NULL DEFAULT now(),
  /* Bezüge — bewusst ON DELETE SET NULL: Das Protokoll bleibt bestehen,
     auch wenn der Beleg oder das Projekt später gelöscht wird. */
  invoice_id        UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  /* Beleg-Angaben zum Sendezeitpunkt (unabhängig von späteren Änderungen). */
  beleg_typ         TEXT,
  beleg_nummer      TEXT,
  beleg_bezeichnung TEXT,
  kunde_name        TEXT,
  /* Die Versand-Daten selbst — DAS ist die Sendebestätigung. */
  von_adresse       TEXT NOT NULL,
  an_adressen       TEXT[] NOT NULL DEFAULT '{}',
  cc_adressen       TEXT[] NOT NULL DEFAULT '{}',
  betreff           TEXT,
  anhaenge          TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS beleg_sendeprotokoll_zeit_idx ON public.beleg_sendeprotokoll (gesendet_am DESC);
CREATE INDEX IF NOT EXISTS beleg_sendeprotokoll_projekt_idx ON public.beleg_sendeprotokoll (project_id);
CREATE INDEX IF NOT EXISTS beleg_sendeprotokoll_beleg_idx ON public.beleg_sendeprotokoll (invoice_id);

ALTER TABLE public.beleg_sendeprotokoll ENABLE ROW LEVEL SECURITY;

-- Lesen darf, wer Belege sehen darf — hier: alle Angemeldeten (die Beleg-
-- Maske selbst ist bereits über Feature-Rechte geschützt).
DROP POLICY IF EXISTS sendeprotokoll_lesen ON public.beleg_sendeprotokoll;
CREATE POLICY sendeprotokoll_lesen ON public.beleg_sendeprotokoll
  FOR SELECT TO authenticated
  USING (true);

-- Eintragen nur im eigenen Namen (die App schreibt beim Versand).
DROP POLICY IF EXISTS sendeprotokoll_anlegen ON public.beleg_sendeprotokoll;
CREATE POLICY sendeprotokoll_anlegen ON public.beleg_sendeprotokoll
  FOR INSERT TO authenticated
  WITH CHECK (gesendet_von = auth.uid());

-- Eine Sendebestätigung wird nicht bearbeitet; löschen nur Administratoren.
DROP POLICY IF EXISTS sendeprotokoll_loeschen ON public.beleg_sendeprotokoll;
CREATE POLICY sendeprotokoll_loeschen ON public.beleg_sendeprotokoll
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

NOTIFY pgrst, 'reload schema';
