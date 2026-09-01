-- Nachtrag zu fc6e5f12 (01.09.): "alles importieren - alle Arbeitszeiten,
-- Materialien, von den Eingangsrechnungen usw."
UPDATE public.aenderungswuensche SET antwort =
  'Der Knopf "Baustelle abrechnen" im Beleg holt jetzt ALLE Quellen des Projekts, jede mit eigener Summe zum Anhaken: 1) Auftrag (Auftragsbestaetigung, sonst Angebot), 2) offene Regieberichte (Stunden x Mitarbeiter, Material, Maschinen), 3) gebuchte Arbeitszeiten je Mitarbeiter, 4) Materialbuchungen des Projekts, 5) offene Lieferscheine, 6) Eingangsrechnungen (zugekauftes Material und Fremdleistungen - mit Aufschlag 0/10/15/20/35 % einstellbar, Lager-Anteile bleiben draussen), 7) Anzahlungen als steuerfreier Brutto-Abzug. Nichts doppelt: Stunden und Material aus Regieberichten stehen nur im Regie-Block. Material und Zukauf sind nicht vorgewaehlt, weil dort Einkaufspreise stehen.'
 WHERE id::text LIKE 'fc6e5f12%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Baustelle abrechnen: jetzt auch Lieferscheine und Eingangsrechnungen',
   'Der Knopf holt zusaetzlich offene Lieferscheine und den Zukauf aus den Eingangsrechnungen (Material und Fremdleistungen) - mit einstellbarem Aufschlag, Lager-Anteile bleiben draussen.');
