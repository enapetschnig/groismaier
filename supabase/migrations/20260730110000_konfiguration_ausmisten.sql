-- ============================================================================
-- Konfiguration ausmisten (Kundenwunsch).
--
-- Vier Auswahllisten im Admin-Bereich stammten aus einer anderen
-- Betriebssoftware — die Einträge enthielten sogar fremde Firmennamen. In
-- dieser App liest sie kein einziger Bildschirm aus; sie standen nur in der
-- Konfiguration herum und stifteten Verwirrung:
--
--   prioritaet    „die Prioritätsstufen … brauchen wir eigentlich gar nicht"
--   wetter        Wetteroptionen (die Wetterschicht in der Zeiterfassung ist
--                 etwas anderes und bleibt unberührt)
--   firma_intern  Labels beim Ersttermin/Miniprotokoll — gibt es hier nicht
--   firma_extern  dito
--
-- Die Oberfläche dazu ist in src/pages/Admin.tsx bereits entfernt.
-- ============================================================================
DELETE FROM public.admin_config_options
WHERE kategorie IN ('prioritaet', 'wetter', 'firma_intern', 'firma_extern');
