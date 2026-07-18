-- Eingangsrechnungen auf mehrere Projekte aufteilen:
-- Eine Rechnung kann Positionen/Teilbeträge enthalten, die unterschiedlichen
-- Projekten zugeordnet werden (z.B. 3 Positionen → Projekt X, 5 → Projekt Z).
-- Die Nachkalkulation rechnet dann je Projekt mit den zugeordneten Teilbeträgen
-- statt mit dem Gesamtbetrag der Rechnung.
--
-- Regel für die Nachkalkulation (Doppelzählung vermeiden):
--   Fremdkosten Projekt P = Σ allocations.betrag_netto (project_id = P)
--                         + Σ purchase_invoices.betrag_netto (project_id = P
--                           UND Rechnung hat KEINE allocations-Zeilen)

create table public.purchase_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  beschreibung text,
  betrag_netto numeric not null check (betrag_netto >= 0),
  position_index int,
  created_at timestamptz default now()
);

create index purchase_invoice_allocations_invoice_idx
  on public.purchase_invoice_allocations (purchase_invoice_id);
create index purchase_invoice_allocations_project_idx
  on public.purchase_invoice_allocations (project_id);

alter table public.purchase_invoice_allocations enable row level security;

-- Gelddaten: nur Admin + Vorarbeiter (wie purchase_invoices selbst),
-- KEIN Zugriff für Mitarbeiter.
create policy "Admins can manage purchase_invoice_allocations"
  on public.purchase_invoice_allocations
  for all
  using (has_role(auth.uid(), 'administrator'::app_role) and is_active_user(auth.uid()))
  with check (has_role(auth.uid(), 'administrator'::app_role) and is_active_user(auth.uid()));

create policy "Vorarbeiter can manage purchase_invoice_allocations"
  on public.purchase_invoice_allocations
  for all
  using (has_role(auth.uid(), 'vorarbeiter'::app_role) and is_active_user(auth.uid()))
  with check (has_role(auth.uid(), 'vorarbeiter'::app_role) and is_active_user(auth.uid()));
