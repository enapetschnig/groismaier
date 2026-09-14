-- ============================================================================
--  ZA-Staende per 31.08.2026 eintragen (Auftrag Christoph, 14.09.2026)
-- ============================================================================
-- Vorgabe des Betriebs, Stand Ende August:
--   Florian Toifl      +89,45 h
--   Zsolt Rezsonya     +74,60 h
--   Sebastian Gutmann  -39,10 h
--   Andreas Buchinger  -16,65 h
--
-- So zeigt die App den Stand: Auto-Saldo ueber ALLE Zeiteintraege (Ist minus
-- 7,8 h je gebuchtem Werktag) PLUS das Buchungskonto time_accounts. Die
-- Eintraege aus Juli/August stecken also schon im Auto-Saldo. Damit am
-- 31.08. exakt die Vorgabe steht, wird ins Konto die DIFFERENZ gebucht:
--
--   Buchung = Vorgabe - Auto-Saldo bis 31.08.
--
-- Nachgerechnet (7,8 h Mo-Fr, Sonderzeiten neutral):
--   Florian    Auto bis 31.08. +21,65  -> Buchung +67,80
--   Zsolt      Auto bis 31.08. +25,80  -> Buchung +48,80
--   Sebastian  Auto bis 31.08. +17,75  -> Buchung -56,85
--   Andreas    Auto bis 31.08. -12,80  -> Buchung  -3,85
--
-- September (Auto-Saldo, ZA-Abbuchungen) kommt unveraendert obendrauf.
-- Bewusst NICHT angefasst (Entscheid Christoph 14.09.): Sebastians ZA-
-- Abbuchung vom 08.09. ohne zugehoerigen Eintrag - der Betrieb klaert das.
-- Keine Belegdaten werden angefasst.

DO $$
DECLARE
  chef  uuid := '6a2e4b2a-1099-4c04-8ac5-8ee2beadf7dd';  -- Christian Groismaier
  r     record;
  vorher numeric;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('0fc1e94f-f577-45bb-bc27-16cf344c5ea8'::uuid, 67.80,  'Übertrag Stand 31.08.2026 laut Büro: +89,45 h. In der App aus Juli/August bereits gerechnet: +21,65 h. Buchung: +67,80 h.'),
      ('1afd5af8-149d-412f-a35a-23fa8d0f3bcd'::uuid, 48.80,  'Übertrag Stand 31.08.2026 laut Büro: +74,60 h. In der App aus Juni-August bereits gerechnet: +25,80 h. Buchung: +48,80 h.'),
      ('61a8ff98-af3a-4dfe-9a7c-5b8dd32fe99b'::uuid, -56.85, 'Übertrag Stand 31.08.2026 laut Büro: -39,10 h. In der App aus Juli/August bereits gerechnet: +17,75 h. Buchung: -56,85 h.'),
      ('88cc4353-179f-462b-a308-18cea1fcf9d3'::uuid, -3.85,  'Übertrag Stand 31.08.2026 laut Büro: -16,65 h. In der App aus Juni-August bereits gerechnet: -12,80 h. Buchung: -3,85 h.')
    ) AS v(user_id, stunden, grund)
  LOOP
    -- Konto anlegen, falls es fehlt (31.08.: jedes Profil hat eines - Sicherheitsnetz).
    INSERT INTO public.time_accounts (user_id, balance_hours)
    VALUES (r.user_id, 0) ON CONFLICT DO NOTHING;

    SELECT balance_hours INTO vorher FROM public.time_accounts WHERE user_id = r.user_id;

    UPDATE public.time_accounts
       SET balance_hours = round((vorher + r.stunden)::numeric, 2), updated_at = now()
     WHERE user_id = r.user_id;

    INSERT INTO public.time_account_transactions
      (user_id, changed_by, change_type, hours, balance_before, balance_after, reason)
    VALUES
      (r.user_id, chef, CASE WHEN r.stunden >= 0 THEN 'Gutschrift' ELSE 'Abzug' END,
       r.stunden, vorher, round((vorher + r.stunden)::numeric, 2), r.grund);
  END LOOP;
END $$;

-- Testrest vom Funktionstest am 31.08. (0 h, ohne Wirkung) aus Andreas' Historie entfernen.
DELETE FROM public.time_account_transactions
 WHERE user_id = '88cc4353-179f-462b-a308-18cea1fcf9d3' AND reason = '__Funktionstest' AND hours = 0;
