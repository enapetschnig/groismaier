-- Florians Meldung (28.08., 17:32): 15-min-Pause - war zeitgleich schon
-- durch Christians Meldung umgesetzt (Migration 20260828180000).
UPDATE public.aenderungswuensche
   SET status = 'umgesetzt',
       antwort = 'Ist schon drin: In der Zeiterfassung gibt es bei der Pause jetzt auch "15 Min" (neben Keine/30/45/60). App einmal ganz schliessen und neu oeffnen.'
 WHERE id::text LIKE '63bc7324%' AND status = 'neu';
