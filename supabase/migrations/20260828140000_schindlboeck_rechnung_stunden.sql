-- ============================================================================
--  Schindlböck-Entwurfsrechnung direkt korrigieren (Meldung fc59ea56)
-- ============================================================================
--
-- Der Rechnungs-Import zählte die Regie-Stunden nur einmal je Bericht —
-- dazugebuchte Mitarbeiter fielen weg (im Code seit 28.08. behoben). Statt
-- Christian die Rechnung neu importieren zu lassen, korrigieren wir den
-- betroffenen Entwurf hier direkt:
--
--   - NUR Beleg b8a201d3 (der gemeldete Entwurf) und NUR solange er
--     Status "entwurf" hat
--   - NUR Arbeitszeit-Zeilen, die noch EXAKT so dastehen, wie der Import
--     sie erzeugt hat (Beschreibung passt aufs Muster UND die Menge ist
--     noch die Einzel-Stundenzahl des Berichts) — von Hand geänderte
--     Zeilen bleiben unangetastet
--   - danach Kopfsummen (Netto/USt/Brutto) neu aus den Positionen rechnen

WITH berichte AS (
  SELECT d.id,
         d.stunden,
         'Arbeitszeit Regiebericht ' || to_char(d.datum, 'DD.MM.YYYY') ||
           ' (' || to_char(d.start_time, 'HH24:MI') || ' - ' || to_char(d.end_time, 'HH24:MI') || ')' AS muster,
         (SELECT COUNT(*) FROM public.disturbance_workers w WHERE w.disturbance_id = d.id) AS mitarbeiter,
         (SELECT string_agg(NULLIF(TRIM(COALESCE(p.vorname, '') || ' ' || COALESCE(p.nachname, '')), ''), ', ')
            FROM public.disturbance_workers w2
            LEFT JOIN public.profiles p ON p.id = w2.user_id
           WHERE w2.disturbance_id = d.id) AS namen
    FROM public.disturbances d
)
UPDATE public.invoice_items it
   SET menge       = ROUND((b.stunden * b.mitarbeiter)::numeric, 2),
       gesamtpreis = ROUND((b.stunden * b.mitarbeiter * it.einzelpreis
                            * (1 - COALESCE(it.rabatt_prozent, 0) / 100.0))::numeric, 2),
       beschreibung = it.beschreibung || ', ' || b.mitarbeiter || ' Mitarbeiter à '
                      || TRIM(trailing '.' FROM TRIM(trailing '0' FROM b.stunden::text)) || ' Std.'
                      || COALESCE(' (' || b.namen || ')', '')
  FROM berichte b
 WHERE it.invoice_id = 'b8a201d3-524c-4c96-933d-36a80a7b84ca'
   AND it.beschreibung = b.muster
   AND b.mitarbeiter > 1
   AND ABS(it.menge - b.stunden) < 0.01
   AND EXISTS (SELECT 1 FROM public.invoices i
                WHERE i.id = it.invoice_id AND i.status = 'entwurf');

-- Kopfsummen neu rechnen — dieselben Regeln wie belegSummen.ts:
-- Positionen ohne Beschreibung zählen nicht; mwst_exempt ist bereits brutto;
-- Kopfrabatt vor USt; Reverse Charge ohne USt.
UPDATE public.invoices inv
   SET netto_summe  = s.netto,
       mwst_betrag  = s.mwst,
       brutto_summe = s.netto + s.mwst + s.exempt
  FROM (
    SELECT ROUND(pnetto - rabatt, 2) AS netto,
           CASE WHEN reverse THEN 0
                ELSE ROUND((pnetto - rabatt) * satz / 100.0, 2) END AS mwst,
           exempt
      FROM (
        SELECT COALESCE(SUM(CASE WHEN NOT COALESCE(it.mwst_exempt, false)
                                 THEN COALESCE(it.gesamtpreis, 0) ELSE 0 END), 0) AS pnetto,
               COALESCE(SUM(CASE WHEN COALESCE(it.mwst_exempt, false)
                                 THEN COALESCE(it.gesamtpreis, 0) ELSE 0 END), 0) AS exempt,
               ROUND(CASE WHEN COALESCE(i.rabatt_prozent, 0) > 0
                          THEN COALESCE(SUM(CASE WHEN NOT COALESCE(it.mwst_exempt, false)
                                                 THEN COALESCE(it.gesamtpreis, 0) ELSE 0 END), 0)
                               * i.rabatt_prozent / 100.0
                          ELSE COALESCE(i.rabatt_betrag, 0) END, 2) AS rabatt,
               COALESCE(i.mwst_satz, 0) AS satz,
               COALESCE(i.reverse_charge, false) AS reverse
          FROM public.invoices i
          LEFT JOIN public.invoice_items it
            ON it.invoice_id = i.id AND COALESCE(TRIM(it.beschreibung), '') <> ''
         WHERE i.id = 'b8a201d3-524c-4c96-933d-36a80a7b84ca'
         GROUP BY i.rabatt_prozent, i.rabatt_betrag, i.mwst_satz, i.reverse_charge
      ) roh
  ) s
 WHERE inv.id = 'b8a201d3-524c-4c96-933d-36a80a7b84ca'
   AND inv.status = 'entwurf';

-- Meldungs-Antwort anpassen: Christian muss nichts mehr neu importieren.
UPDATE public.aenderungswuensche
   SET antwort = 'Fehler gefunden und behoben: Beim Uebernehmen in die Rechnung zaehlten nur die Stunden des Berichts EINMAL - dazugebuchte Mitarbeiter fielen unter den Tisch. Der Import rechnet jetzt Stunden x Anzahl der beteiligten Mitarbeiter (mit Namen in der Position), und deine Schindlboeck-Entwurfsrechnung haben wir direkt korrigiert - die Arbeitszeit-Zeilen und die Summen stimmen jetzt, bitte nur kurz druebersehen. Auch die Summe "Noch zu verrechnen" in der Regie-Liste rechnet jetzt je Mitarbeiter.'
 WHERE id = 'fc59ea56-170f-4f77-b086-546aef296556';
