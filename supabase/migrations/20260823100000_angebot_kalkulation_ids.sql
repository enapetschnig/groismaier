-- Sammelangebot aus mehreren Kalkulationen (Kundenwunsch 23.08.2026,
-- "Projektbereiche"): Das Angebot merkt sich ALLE Quell-Kalkulationen in
-- Bereichs-Reihenfolge. kalkulation_id bleibt als "erste Quelle" erhalten
-- (bestehende Verknuepfungs-Logik); nur echte Sammelangebote fuellen die
-- Liste. Ohne sie wuerde "Positionen neu uebernehmen" nur den ersten
-- Bereich neu aufbauen und die uebrigen loeschen.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kalkulation_ids jsonb;
