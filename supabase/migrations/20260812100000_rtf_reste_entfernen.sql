-- ============================================================================
-- Schriftart-Reste aus der KingBill-Übernahme entfernen (Kundenwunsch:
-- „das mit der Schriftart bitte überall entfernen").
--
-- Beim Import wurden die Positions-Langtexte aus dem RTF-Format gewandelt.
-- Der Parser hat die Steuerwörter entfernt, aber die FONTTABELLE blieb als
-- Klartext am Textanfang stehen:
--   „Times New Roman;Arial;;;1 Stk 15/15 4,0 m"
--
-- Betroffen sind ausschließlich invoice_items.langtext (5.701 Zeilen; alle
-- anderen Textfelder wurden geprüft und sind sauber). Zusätzlich hinterließ
-- die Wandlung bei 723 Zeilen eine Absatzmarke als Semikolon am Textende.
-- ============================================================================

-- 1. Fonttabelle am Textanfang
UPDATE public.invoice_items
   SET langtext = regexp_replace(
         langtext,
         '^(?:(?:Times New Roman|Arial|Calibri|Helvetica|Courier New|Symbol|Wingdings|Tahoma|Verdana|MS Sans Serif)\s*;)+;*',
         '', 'i')
 WHERE langtext ~* '^(?:Times New Roman|Arial|Calibri|Helvetica)';

-- 2. Übrig gebliebene Absatzmarke am Textende
UPDATE public.invoice_items
   SET langtext = regexp_replace(langtext, ';\s*$', '')
 WHERE btrim(langtext) LIKE '%;';
