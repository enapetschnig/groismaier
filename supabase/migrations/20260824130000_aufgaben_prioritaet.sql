-- Prioritaet fuer Aufgaben (Kundenwunsch 24.08.2026: "mit Prioritaet,
-- vielleicht farblich dargestellt"). hoch = rot, normal = grau, niedrig = blau;
-- die Liste sortiert offene Aufgaben nach Prioritaet, dann Frist.
ALTER TABLE aufgaben ADD COLUMN IF NOT EXISTS prioritaet text NOT NULL DEFAULT 'normal'
  CHECK (prioritaet IN ('hoch', 'normal', 'niedrig'));
