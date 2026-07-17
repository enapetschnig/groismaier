-- Finanzplanung Stufe 1 (Liquiditätsvorschau): wiederkehrende Fixkosten
-- (Miete, Versicherung, Leasing, ...), die neben den offenen Belegen auf die
-- Planungsperioden umgelegt werden.

create table if not exists public.fixkosten (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  betrag numeric(12,2) not null,
  intervall text not null check (intervall in ('monatlich', 'quartalsweise', 'jaehrlich')),
  -- Für quartalsweise/jaehrlich: erster Fälligkeitsmonat (1-12).
  -- Für monatlich: null (jeden Monat fällig).
  faellig_monat int check (faellig_monat between 1 and 12),
  faellig_tag int default 1 check (faellig_tag between 1 and 31),
  aktiv boolean not null default true,
  notiz text,
  created_at timestamptz default now()
);

alter table public.fixkosten enable row level security;

-- Kollaboratives Modell (wie kalkulationen/projects): alle angemeldeten
-- Mitarbeiter dürfen Fixkosten sehen und bearbeiten.
create policy "fixkosten_select" on public.fixkosten for select to authenticated using (true);
create policy "fixkosten_insert" on public.fixkosten for insert to authenticated with check (true);
create policy "fixkosten_update" on public.fixkosten for update to authenticated using (true) with check (true);
create policy "fixkosten_delete" on public.fixkosten for delete to authenticated using (true);

create index if not exists fixkosten_aktiv_idx on public.fixkosten(aktiv);
