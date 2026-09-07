-- ============================================================================
--  Aenderungswunsch 07.09.2026 (da0e31e5): Seitenumbrueche + Kapitel-Dropdown
-- ============================================================================
-- Keine Belegdaten werden angefasst.

-- Kapitel-Vorlagen fuer das Angebot: Startliste aus Christians erster
-- Kapitel-Kalkulation (Gartenlaube) plus typische Gewerke - unter
-- Kalkulation > Einstellungen > "Kapitel fuer das Angebot" frei aenderbar.
INSERT INTO public.app_settings (key, value)
VALUES ('kalk_kapitel_vorlagen', '["Allgemein","Fundamente","Holzbau","Dach","Fassade","Innenausbau","Sonstiges"]')
ON CONFLICT (key) DO NOTHING;

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Erledigt, beides: (1) Seitenumbrueche - ein neues Kapitel (Bereich) erzwingt keine neue Seite mehr. Es wird nur noch umgebrochen, wenn die laufende Seite ohnehin fast voll ist; die Kapitel-Ueberschrift bleibt dabei immer mit der ersten Position zusammen. Bei deiner Gartenlaube waren es vorher vier Seiten mit zwei fast leeren, jetzt sind es zwei volle Seiten plus die Summe. (2) Kapitel-Dropdown - bei jedem Aufbau ist "Kapitel im Angebot" jetzt eine Auswahl. Die Liste pflegst du unter Kalkulation > Einstellungen > "Kapitel fuer das Angebot" (eine Zeile je Kapitel). Als Start stehen Allgemein, Fundamente, Holzbau, Dach, Fassade, Innenausbau, Sonstiges drin. "Eigenes Kapitel eingeben" bleibt fuer Ausnahmen moeglich.'
WHERE id::text LIKE 'da0e31e5%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Angebot: Seitenumbrueche ohne leere Seiten; Kapitel als Dropdown',
   'Ein neues Kapitel beginnt nur noch dann auf einer neuen Seite, wenn die laufende Seite fast voll ist. Die Kapitelnamen waehlst du bei jedem Aufbau aus einer Liste, die du unter Kalkulation > Einstellungen pflegst.');
