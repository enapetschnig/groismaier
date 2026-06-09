-- ============================================================================
-- Holzbau Lutz: Firmenstammdaten (app_settings) + Dokumenttexte (document_texts)
-- Quelle: Excel-Vorlagen VORLAGE RECHNUNGEN / Z_VORLAGE - 2026.
-- ============================================================================

-- Bankverbindung + Firmendaten -----------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES
  ('bank_kontoinhaber', 'Holzbau Lutz OG'),
  ('bank_iban',         'AT21 2050 2000 0084 9588'),
  ('bank_bic',          'SPIMAT21XXX'),
  ('firmen_uid',        ''),
  ('mwst_satz',         '20')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Dokumenttexte ---------------------------------------------------------------
-- Angebot
INSERT INTO public.document_texts (typ, feld, sprache, inhalt) VALUES
  ('angebot', 'intro', 'de',
   'Sehr geehrte Damen und Herren,' || E'\n\n' ||
   'wir danken für die Einladung zur Angebotslegung beim oben angeführten Bauvorhaben und übermitteln Ihnen in der Beilage unser Kostenoffert.' || E'\n\n' ||
   'Wir hoffen, dass unser Angebot Ihren Vorstellungen entspricht und würden uns freuen, Ihren geschätzten Auftrag zu erhalten. Im Falle einer Auftragserteilung sichern wir Ihnen eine termingerechte und fachlich einwandfreie Ausführung der Arbeiten zu.'),
  ('angebot', 'closing', 'de',
   'Mit freundlichen Grüßen' || E'\n' || 'Holzbau Lutz OG'),
  ('angebot', 'zahlungsbedingungen', 'de',
   'Unser Angebot ist freibleibend und ab Angebotsdatum 1 Woche gültig. Preise gelten ab Werk 6642 Stanzach, Am Sportplatz 3. Aufmaß und Abrechnung erfolgen nach tatsächlichem Aufwand und den entsprechenden ÖNormen. Es wird die ÖNORM B2110 vereinbart.')
ON CONFLICT (typ, feld, sprache) DO UPDATE SET inhalt = EXCLUDED.inhalt;

-- Auftragsbestätigung
INSERT INTO public.document_texts (typ, feld, sprache, inhalt) VALUES
  ('auftragsbestaetigung', 'intro', 'de',
   'Sehr geehrte Damen und Herren,' || E'\n\n' ||
   'wir bedanken uns für Ihren Auftrag und bestätigen Ihnen die Ausführung der nachstehend angeführten Arbeiten.'),
  ('auftragsbestaetigung', 'closing', 'de',
   'Mit freundlichen Grüßen' || E'\n' || 'Holzbau Lutz OG')
ON CONFLICT (typ, feld, sprache) DO UPDATE SET inhalt = EXCLUDED.inhalt;

-- Rechnung
INSERT INTO public.document_texts (typ, feld, sprache, inhalt) VALUES
  ('rechnung', 'zahlungsbedingungen', 'de',
   'Zahlbar nach Erhalt der Rechnung, netto Kassa. Bei Überweisung mittels Internet-Banking tragen Sie bitte im Feld "Verwendungszweck" die Rechnungsnummer ein.'),
  ('rechnung', 'danke', 'de',
   'Vielen Dank für Ihren Auftrag.')
ON CONFLICT (typ, feld, sprache) DO UPDATE SET inhalt = EXCLUDED.inhalt;
