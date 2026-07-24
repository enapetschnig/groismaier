-- ============================================================================
-- EIN Katalog (Kundenwunsch 2026-07-24): Kalkulations-Material-Artikel
-- ADDITIV in den Artikelstamm (invoice_templates) kopieren.
--
-- WICHTIG (Lehre aus dem ersten Anlauf): Diese Migration deaktiviert NICHTS.
-- Der Alt-Katalog (kalkulation_artikel/-kategorien) bleibt vollstaendig aktiv;
-- der neue Code blendet gleichnamige Alt-Artikel clientseitig aus (Template
-- gewinnt). Dadurch funktioniert die App in JEDER Deploy-Reihenfolge.
--
-- Idempotent: Signatur = produktgruppe + kurzbezeichnung (normalisiert);
-- vorhandene Artikel werden uebersprungen.
-- ============================================================================
INSERT INTO public.invoice_templates
  (user_id, name, beschreibung, kurzbezeichnung, produktgruppe, kategorie,
   einheit, ek_netto, vk_netto, netto_preis, einzelpreis, ist_aktiv)
SELECT
  -- Stammdaten gehoeren dem (ersten) Administrator. Hinweis: user_roles hat
  -- KEINE created_at-Spalte — daher ohne ORDER BY.
  (SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'administrator'::public.app_role LIMIT 1),
  -- kategorie = produktgruppe (Einheitlichkeit: Beleg-Editor gruppiert nach
  -- kategorie, Kalkulation/Artikelmaske nach produktgruppe).
  a.name, a.name, a.name, k.name, k.name,
  -- Preis-Einheit des Alt-Katalogs („€ / m³") → MENGENeinheit („m³"):
  -- die Einheit landet 1:1 in Angebots-/Rechnungszeilen.
  COALESCE(
    NULLIF(regexp_replace(btrim(a.einheit), '^€\s*/\s*', ''), ''),
    NULLIF(regexp_replace(btrim(k.einheit), '^€\s*/\s*', ''), ''),
    'm²'),
  a.ek, a.vk, a.vk, a.vk, true
FROM public.kalkulation_artikel a
JOIN public.kalkulation_kategorien k ON k.id = a.kategorie_id
WHERE k.typ = 'material'
  AND a.aktiv IS NOT FALSE
  AND k.aktiv IS NOT FALSE
  AND NOT EXISTS (
    SELECT 1 FROM public.invoice_templates t
    WHERE lower(btrim(t.kurzbezeichnung)) = lower(btrim(a.name))
      AND lower(btrim(COALESCE(t.produktgruppe, ''))) = lower(btrim(k.name))
  );
