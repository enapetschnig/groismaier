-- Kundenwunsch 18.08.2026: "Als Regiestundensatz bitte 68 Euro hinterlegen"
-- (Der Satz ist ab jetzt auch direkt in der Regiebericht-Liste editierbar —
--  diese Migration setzt nur den gewuenschten Startwert.)
-- NUR den Seed-Altwert '70' ersetzen: Ein spaeter im UI gesetzter Satz darf
-- von einem erneuten Einspielen dieser Datei nicht still zurueckgesetzt werden.
update public.app_settings set value = '68'
 where key = 'regie_stundensatz' and value = '70';
insert into public.app_settings (key, value)
values ('regie_stundensatz', '68')
on conflict (key) do nothing;
