-- Kalkulations-Vorlagen: Kalkulationen können als Vorlage markiert werden.
-- Vorlagen erscheinen nicht in der normalen Kalkulationsliste, sondern in
-- einem eigenen Bereich und dienen als Ausgangsbasis für neue Kalkulationen
-- (data-JSONB wird beim Erstellen aus Vorlage kopiert).

alter table public.kalkulationen
  add column if not exists ist_vorlage boolean not null default false;

-- Partieller Index: Vorlagen sind wenige, die Liste wird danach gefiltert.
create index if not exists kalkulationen_ist_vorlage_idx
  on public.kalkulationen (ist_vorlage)
  where ist_vorlage;
