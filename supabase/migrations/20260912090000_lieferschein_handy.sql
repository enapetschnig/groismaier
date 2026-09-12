-- ============================================================================
--  Lieferschein am Handy: Fotos, Unterschrift, Erinnerung (Kundenwunsch 11.09.2026)
-- ============================================================================
-- "Fuer Lieferscheine braucht es bitte noch eine Erinnerung wenn welche offen
--  stehen bleiben ... Weiters bitte eine Moeglichkeit (zumindest fuers Handy)
--  ... einen neuen Lieferschein anlegen ... Fotos aufnehmen ... Unterschrift-
--  Feld, wo der Kunde oder Fraechter dann unterschreiben kann."
--
-- Keine Belegdaten werden angefasst: Drei neue, leere Spalten am Beleg und
-- eine neue Tabelle. Vorhandene Belege bleiben, wie sie sind.

-- ── Unterschrift am Beleg ────────────────────────────────────────────────────
-- Dasselbe Muster wie beim Regiebericht (disturbances.unterschrift_kunde):
-- das Bild als Data-URL, dazu Zeitpunkt und - neu - der Name des
-- Unterzeichners, weil beim Lieferschein auch der Fraechter unterschreibt.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS unterschrift_kunde text,
  ADD COLUMN IF NOT EXISTS unterschrift_am   timestamptz,
  ADD COLUMN IF NOT EXISTS unterschrift_name text;

-- ── Fotos zu einem Beleg ─────────────────────────────────────────────────────
-- Bewusst "beleg_fotos" und nicht "lieferschein_fotos": Die Tabelle haengt
-- am Beleg, nicht am Typ. Braucht spaeter ein anderer Beleg Fotos, ist der
-- Weg schon da.
CREATE TABLE IF NOT EXISTS public.beleg_fotos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  beschreibung text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beleg_fotos_invoice_idx ON public.beleg_fotos (invoice_id);

ALTER TABLE public.beleg_fotos ENABLE ROW LEVEL SECURITY;

-- Wer den Beleg sehen darf, sieht auch seine Fotos - dieselbe Regel wie bei
-- den Positionen (invoice_items): eigener Beleg oder Administrator.
DROP POLICY IF EXISTS "Beleg-Fotos sehen wie den Beleg" ON public.beleg_fotos;
CREATE POLICY "Beleg-Fotos sehen wie den Beleg"
  ON public.beleg_fotos FOR SELECT
  USING (
    public.is_active_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.invoices i
       WHERE i.id = beleg_fotos.invoice_id
         AND (i.user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
    )
  );

DROP POLICY IF EXISTS "Beleg-Fotos anlegen zum eigenen Beleg" ON public.beleg_fotos;
CREATE POLICY "Beleg-Fotos anlegen zum eigenen Beleg"
  ON public.beleg_fotos FOR INSERT
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
       WHERE i.id = beleg_fotos.invoice_id
         AND (i.user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
    )
  );

DROP POLICY IF EXISTS "Beleg-Fotos loeschen" ON public.beleg_fotos;
CREATE POLICY "Beleg-Fotos loeschen"
  ON public.beleg_fotos FOR DELETE
  USING (
    public.is_active_user(auth.uid())
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
  );

GRANT SELECT, INSERT, DELETE ON public.beleg_fotos TO authenticated;
GRANT ALL ON public.beleg_fotos TO service_role;

-- ── Ablage fuer die Fotos ────────────────────────────────────────────────────
-- Nicht oeffentlich: Auf den Fotos sind Ware, Kennzeichen, manchmal Personen.
-- Gelesen wird ueber signierte URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('beleg-fotos', 'beleg-fotos', false, 15728640)   -- 15 MB je Datei
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Beleg-Fotos lesen (angemeldet)" ON storage.objects;
CREATE POLICY "Beleg-Fotos lesen (angemeldet)"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'beleg-fotos' AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Beleg-Fotos hochladen (angemeldet)" ON storage.objects;
CREATE POLICY "Beleg-Fotos hochladen (angemeldet)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'beleg-fotos' AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Beleg-Fotos loeschen (angemeldet)" ON storage.objects;
CREATE POLICY "Beleg-Fotos loeschen (angemeldet)"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'beleg-fotos' AND public.is_active_user(auth.uid()));

-- ── Meldung abschliessen ─────────────────────────────────────────────────────
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt, in drei Teilen. (1) Am Handy: Auf der Startseite steht neben "Regiebericht" jetzt "Lieferschein". Kunde waehlen, Positionen eintippen (Menge, Einheit, Text - ohne Preise), Fotos direkt mit der Kamera, speichern. Die Nummer kommt aus dem bekannten Nummernkreis (LS-2026-...). Jeder Mitarbeiter kann das machen - ein Lieferschein hat keine Preise, da kann nichts passieren. (2) Unterschrift: Nach dem Speichern der grosse Knopf "Unterschreiben" - Name eintippen (Kunde oder Fraechter), am Bildschirm unterschreiben, fertig. Unterschrift, Name und Zeitpunkt stehen am PDF, die Fotos kommen als eigene Seite hinten dran. Ohne Unterschrift druckt das PDF zwei Linien zum Unterschreiben von Hand. (3) Erinnerung: Mit der Unterschrift (oder dem Knopf "Uebergeben") springt der Lieferschein auf "offen". Ab da zaehlt ihn das Badge "Lieferscheine" auf der Startseite, in der Liste steht nach 14 Tagen rot "seit N Tagen nicht verrechnet", und auf der Offene-Posten-Seite gibt es links den Block "Nicht verrechnete Lieferscheine". Sobald du aus dem Lieferschein eine Rechnung machst ("Kopieren in" > Rechnung), verschwindet er von selbst aus der Erinnerung und merkt sich, mit welcher Rechnung er verrechnet wurde. Gut zu wissen: Lieferscheine tragen keine Preise. Beim Umwandeln in die Rechnung stehen die Positionen mit 0 Euro drin, die Preise ergaenzt du dort. Kam die Lieferung aus einem Angebot, mach die Rechnung besser gleich aus dem Angebot - dort sind die Preise schon drin.'
WHERE id::text LIKE 'e3530565%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Lieferschein am Handy: Fotos und Unterschrift',
   'Auf der Startseite gibt es am Handy den Knopf "Lieferschein": Kunde, Positionen ohne Preise, Fotos vom Verladen, dann Unterschrift von Kunde oder Fraechter direkt am Bildschirm. Unterschrift und Fotos stehen am PDF. Ein unterschriebener Lieferschein gilt als "offen" und wird erinnert, bis er in einer Rechnung verrechnet ist - Badge auf der Startseite, Hinweis in der Liste, Block bei den Offenen Posten.');
