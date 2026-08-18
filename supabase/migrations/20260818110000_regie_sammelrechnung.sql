-- Regieberichte: Sammelrechnung (Kundenwunsch 08/2026)
-- "Bei den Regieberichten kann man vielleicht die einzelnen Berichte zu einer
--  Sammelrechnung zusammenfuehren (Auswahlhaekchen?) ... interessant ist auch
--  eine Uebersicht oben, wo die gesamt zu verrechnende (offene) Summe je
--  Projekt ist."
--
-- 1. Verweis vom Regiebericht auf den Beleg, der ihn verrechnet hat
--    (analog purchase_invoices.verrechnet_in_invoice_id). Wird beim Import
--    in eine Rechnung/AR/SR zusammen mit is_verrechnet gesetzt.
alter table public.disturbances
  add column if not exists verrechnet_in_invoice_id uuid
    references public.invoices(id) on delete set null;

create index if not exists disturbances_verrechnet_invoice_idx
  on public.disturbances (verrechnet_in_invoice_id)
  where verrechnet_in_invoice_id is not null;

-- 2. Standard-Stundensatz fuer die Verrechnung von Regieberichten.
--    Bisher stand er als 70 hart im Import-Dialog; jetzt kommt er aus den
--    Einstellungen und speist auch die "offene Summe je Projekt".
insert into public.app_settings (key, value)
values ('regie_stundensatz', '70')
on conflict (key) do nothing;

-- 3. Leserecht: app_settings ist fuer Nicht-Admins auf unbedenkliche
--    Schluessel beschraenkt (20260729110000). Der Regie-Stundensatz ist der
--    KUNDENSEITIGE Verrechnungssatz (steht ohnehin auf jeder Rechnung) und
--    kein Betriebsgeheimnis — ohne Leserecht fiele ein nicht-administrativer
--    Rechnungsschreiber still auf den 70-EUR-Fallback zurueck.
drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::app_role)
    or key in ('einheiten', 'regie_stundensatz')
  );
