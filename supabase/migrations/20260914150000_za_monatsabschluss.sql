-- ============================================================================
--  ZA-Konto auf Monatsabschluss umstellen (Christoph, 14.09.2026)
-- ============================================================================
-- "das ZA-Konto wird erst erhoeht, wenn ein Monat abgeschlossen ist ... mit
--  Ende August: Florian 89,45, Zsolt 74,60, Sebastian -39,10, Andreas -16,65
--  - diese Sachen sollten zur Zeit bei den jeweiligen ZA-Kontos stehen."
--
-- Modell ab jetzt: time_accounts.balance_hours = abgeschlossener Stand bis
-- zum Stichtag (app_settings.za_abgeschlossen_bis). Der laufende Monat wird
-- angezeigt, aber erst beim Monatsabschluss gebucht - auch Zeitausgleich-
-- Tage. Deshalb:
--
--  1. Stichtag 31.08.2026 setzen.
--  2. Die vier Uebertrags-Buchungen von heute frueh (Differenz-Ansatz fuer
--     das alte Live-Modell) wieder entfernen - eigene Buchungen von vor
--     wenigen Stunden, noch nicht im Betrieb verwendet.
--  3. Je Mitarbeiter EINE Buchung, die das Konto exakt auf die Vorgabe
--     stellt. Die September-Abbuchungen (za_abzug vom 04./08.09.) bleiben
--     als Historie stehen, sind aber im neuen Stand aufgehoben: Der
--     September wird beim Abschluss aus den Eintraegen gebucht.
--
-- Christian und Katrin (Admins) haben ebenfalls Eintraege vor September;
-- ohne Vorgabe bleiben ihre Konten auf 0.
-- Keine Belegdaten werden angefasst.

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('za_abgeschlossen_bis', '2026-08-31', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

DELETE FROM public.time_account_transactions
 WHERE reason LIKE 'Übertrag Stand 31.08.2026%' AND created_at::date = '2026-09-14';

DO $$
DECLARE
  chef uuid := '6a2e4b2a-1099-4c04-8ac5-8ee2beadf7dd';  -- Christian Groismaier
  r record;
  aktuell numeric;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('0fc1e94f-f577-45bb-bc27-16cf344c5ea8'::uuid, 89.45),
      ('1afd5af8-149d-412f-a35a-23fa8d0f3bcd'::uuid, 74.60),
      ('61a8ff98-af3a-4dfe-9a7c-5b8dd32fe99b'::uuid, -39.10),
      ('88cc4353-179f-462b-a308-18cea1fcf9d3'::uuid, -16.65)
    ) AS v(user_id, vorgabe)
  LOOP
    INSERT INTO public.time_accounts (user_id, balance_hours) VALUES (r.user_id, 0) ON CONFLICT DO NOTHING;
    -- Konto auf den Stand VOR den heutigen Uebertraegen zurueckrechnen
    -- (sie sind geloescht) und dann exakt auf die Vorgabe setzen.
    SELECT coalesce(sum(hours), 0) INTO aktuell FROM public.time_account_transactions WHERE user_id = r.user_id;
    UPDATE public.time_accounts SET balance_hours = r.vorgabe, updated_at = now() WHERE user_id = r.user_id;
    INSERT INTO public.time_account_transactions
      (user_id, changed_by, change_type, hours, balance_before, balance_after, reason)
    VALUES
      (r.user_id, chef, 'stand', round((r.vorgabe - aktuell)::numeric, 2), aktuell, r.vorgabe,
       'Stand 31.08.2026 laut Büro: ' || to_char(r.vorgabe, 'FM990.00') || ' h. Ab jetzt zählt das Konto den abgeschlossenen Stand; der September wird beim Monatsabschluss aus den Einträgen gebucht (auch Zeitausgleich-Tage). Frühere September-Abbuchungen sind damit aufgehoben.');
  END LOOP;
END $$;

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Zeitkonto: Stand per Monatsabschluss',
   'Das ZA-Konto zeigt jetzt den abgeschlossenen Stand (derzeit bis 31.08.2026). Der laufende Monat steht daneben und wird erst beim Monatsabschluss gebucht - Ueberstunden und Zeitausgleich-Tage gemeinsam, aus den Eintraegen. Den Abschluss machst du unter Admin > Benutzer & Mitarbeiter > Zeitkonten mit einem Klick, sobald der Monat vorbei ist. Eintraege in abgeschlossenen Monaten sind gesperrt; Korrekturen laufen ueber Gutschrift/Abzug im Zeitkonto.');
