-- Kundenwunsch 18.08.2026: "Als Regiestundensatz bitte 68 Euro hinterlegen"
-- (Der Satz ist ab jetzt auch direkt in der Regiebericht-Liste editierbar —
--  diese Migration setzt nur den gewuenschten Startwert.)
update public.app_settings set value = '68' where key = 'regie_stundensatz';
insert into public.app_settings (key, value)
values ('regie_stundensatz', '68')
on conflict (key) do nothing;
