-- Eingangsrechnungen: Buchungsziel "Lager" (Kundenwunsch 08/2026):
-- "Ich kann nur Hauptprojekt auswaehlen ... was mach ich, wenn etwas oder
--  alles aufs Lager geht? Das muss noch rein."
--
-- Ein Teilbetrag (allocation) oder die ganze Rechnung kann jetzt aufs Lager
-- gebucht werden statt auf ein Projekt:
--   * purchase_invoices.lager = true  -> Kopf/Restbetrag gehoert dem Lager
--     (project_id bleibt NULL)
--   * purchase_invoice_allocations.ziel = 'lager' -> Teilbetrag Lager
--     (project_id NULL)
-- Die Nachkalkulation zaehlt Lager-Betraege zu KEINEM Projekt; sie reduzieren
-- aber den Restbetrag, der beim Hauptprojekt verbleibt
-- (src/lib/nachkalkulation.ts, verteileEingangsrechnung).

alter table public.purchase_invoices
  add column if not exists lager boolean not null default false;

alter table public.purchase_invoice_allocations
  alter column project_id drop not null;

alter table public.purchase_invoice_allocations
  add column if not exists ziel text not null default 'projekt';

-- Constraints idempotent anlegen (ein erneuter db push derselben Datei darf
-- nicht an "already exists" scheitern).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_invoice_allocations_ziel_check') then
    alter table public.purchase_invoice_allocations
      add constraint purchase_invoice_allocations_ziel_check
      check (ziel in ('projekt', 'lager'));
  end if;
  -- Ein Projekt-Teilbetrag braucht ein Projekt, ein Lager-Teilbetrag keines.
  if not exists (select 1 from pg_constraint where conname = 'purchase_invoice_allocations_ziel_projekt_check') then
    alter table public.purchase_invoice_allocations
      add constraint purchase_invoice_allocations_ziel_projekt_check
      check ((ziel = 'projekt' and project_id is not null)
          or (ziel = 'lager' and project_id is null));
  end if;
end $$;
