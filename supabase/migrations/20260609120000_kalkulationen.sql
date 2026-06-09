-- Auftragskalkulationen: in der App gespeicherte Kalkulationen (Zustand des
-- eingebetteten Kalkulations-Tools als JSON), optional an Kunde/Projekt
-- gekoppelt. Macht die Auftragskalkulation zu einem echten App-Feature
-- (anlegen, speichern, wieder öffnen, Angebot daraus erstellen).

create table if not exists public.kalkulationen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  data jsonb,
  summe numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kalkulationen enable row level security;

-- Kollaboratives Modell (wie projects): alle angemeldeten Mitarbeiter dürfen
-- Kalkulationen sehen und bearbeiten.
create policy "kalk_select" on public.kalkulationen for select to authenticated using (true);
create policy "kalk_insert" on public.kalkulationen for insert to authenticated with check (true);
create policy "kalk_update" on public.kalkulationen for update to authenticated using (true) with check (true);
create policy "kalk_delete" on public.kalkulationen for delete to authenticated using (true);

create index if not exists kalkulationen_customer_idx on public.kalkulationen(customer_id);
create index if not exists kalkulationen_project_idx on public.kalkulationen(project_id);
create index if not exists kalkulationen_updated_idx on public.kalkulationen(updated_at desc);

drop trigger if exists kalkulationen_updated_at on public.kalkulationen;
create trigger kalkulationen_updated_at
  before update on public.kalkulationen
  for each row execute function public.update_updated_at_column();
