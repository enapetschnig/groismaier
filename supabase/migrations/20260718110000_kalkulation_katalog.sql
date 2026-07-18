-- ============================================================================
-- Auftragskalkulation: Katalog-Stammdaten (Kategorien + Artikel) & Betriebsdaten
-- ----------------------------------------------------------------------------
-- Ersetzt die hartkodierten Seeds des alten iframe-Tools
-- (public/auftragskalkulation-tool.html) durch DB-Stammdaten, die der Kunde
-- selbst pflegen kann (Kategorien UND Artikel anlegen/ändern/löschen).
--
-- Fachliche Referenz ("Letztstand"): Excel
-- "Stammblatt - Auftragskalkulation_4.3_rel Letztstand.xlsm"
--   - Material-VK = EK x 1,35 ("Faktor für VK-Zuschlag (Produkte)")
--   - Lack: Spalte "1x4 Seiten" = "1x3 Seiten" x 1,65; "Farbe durch Kunde" = 4,95 EUR/m²
--   - Mittellohn 65 EUR/h, Kran 180 EUR/h, 9-h-Tag (Excel gewinnt vor HTML-Tool)
--
-- typ-Semantik der Kategorien:
--   'material' -> Tab "Aufbau Kalkulation" (EK/VK wie Excel-Blatt "Produkte")
--   'lack'     -> Tab "Oberflächenbeschichtung"; ek = Preis 3-seitig EUR/m²,
--                 vk = Preis 4-seitig EUR/m² (Seed: ek x 1,65).
--                 "Farbe durch Kunde beigestellt" ist KEIN Artikelpreis, sondern
--                 der globale Satz app_settings.kalk_lack_kunde_satz (4,95).
--   'aufpreis' -> Lackier-Auf-/Minderpreise; vk = Betrag EUR/m² (kann negativ sein)
--
-- Hersteller-Überschriften ("ADLER", "SYNTHESA / DANSKE") sind KATEGORIEN,
-- nicht Artikel (im Excel-Dropdown standen sie fälschlich als preislose Zeilen).
-- ============================================================================

create table if not exists public.kalkulation_kategorien (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  typ text not null check (typ in ('material', 'lack', 'aufpreis')),
  einheit text,
  sort int not null default 0,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.kalkulation_artikel (
  id uuid primary key default gen_random_uuid(),
  kategorie_id uuid not null references public.kalkulation_kategorien(id) on delete cascade,
  name text not null,
  ek numeric,          -- Einkaufspreis; NULL = "???" im Excel -> Manuell-Preis-Modus je Zeile
  vk numeric,          -- Verkaufspreis; Seed: EK x 1,35 (Material) bzw. 3-seitig x 1,65 (Lack)
  einheit text,
  sort int not null default 0,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.kalkulation_kategorien enable row level security;
alter table public.kalkulation_artikel enable row level security;

-- Kollaboratives Modell wie kalkulationen (Migration 20260609120000): alle
-- angemeldeten Mitarbeiter dürfen den Katalog sehen und pflegen.
create policy "kalk_kat_select" on public.kalkulation_kategorien for select to authenticated using (true);
create policy "kalk_kat_insert" on public.kalkulation_kategorien for insert to authenticated with check (true);
create policy "kalk_kat_update" on public.kalkulation_kategorien for update to authenticated using (true) with check (true);
create policy "kalk_kat_delete" on public.kalkulation_kategorien for delete to authenticated using (true);

create policy "kalk_art_select" on public.kalkulation_artikel for select to authenticated using (true);
create policy "kalk_art_insert" on public.kalkulation_artikel for insert to authenticated with check (true);
create policy "kalk_art_update" on public.kalkulation_artikel for update to authenticated using (true) with check (true);
create policy "kalk_art_delete" on public.kalkulation_artikel for delete to authenticated using (true);

create index if not exists kalkulation_artikel_kategorie_idx on public.kalkulation_artikel(kategorie_id);
create index if not exists kalkulation_kategorien_typ_idx on public.kalkulation_kategorien(typ);

-- ----------------------------------------------------------------------------
-- SEEDS: vollständige Vereinigung aus Excel-Letztstand + HTML-Tool v9.
-- Nur beim Erstlauf (Katalog leer) - Migration ist damit re-run-sicher.
-- VK-Werte sind die abgeleiteten Effektivwerte (EK x 1,35 bzw. x 1,65,
-- gerundet auf 4 Nachkommastellen, exakt wie in beiden Referenzen).
-- ----------------------------------------------------------------------------
do $$
declare
  k_folien uuid; k_daemm uuid; k_unterk uuid; k_fassade uuid;
  k_platten uuid; k_kvh uuid; k_bsh uuid;
  k_adler uuid; k_synthesa uuid; k_aufpreis uuid;
begin
  if exists (select 1 from public.kalkulation_kategorien) then
    return;
  end if;

  -- Material-Kategorien (Reihenfolge wie Excel-Blatt "Produkte")
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('Folien', 'material', '', 10) returning id into k_folien;
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('Dämmstoffe', 'material', '€ / m³', 20) returning id into k_daemm;
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('Unterkonstruktion', 'material', '€ / m³', 30) returning id into k_unterk;
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('Fassadenbretter', 'material', '', 40) returning id into k_fassade;
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('Plattenwerkstoffe', 'material', '', 50) returning id into k_platten;
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('KVH', 'material', '€ / m³', 60) returning id into k_kvh;
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('BSH', 'material', '€ / m³', 70) returning id into k_bsh;

  -- Lack-Kategorien (Hersteller)
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('ADLER', 'lack', '€ / m²', 80) returning id into k_adler;
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('SYNTHESA / DANSKE', 'lack', '€ / m²', 90) returning id into k_synthesa;

  -- Auf-/Minderpreise Lohnlackierung
  insert into public.kalkulation_kategorien (name, typ, einheit, sort) values ('Aufpreise Lohnlackierung', 'aufpreis', '€ / m²', 100) returning id into k_aufpreis;

  -- Folien (Preis = EUR/m² Aufbaufläche)
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_folien, 'Dampfbremse', 5, 6.75, '', 10),
    (k_folien, 'Dampfsperre', null, null, '', 20),
    (k_folien, 'Dampfsperre bituminös', null, null, '', 30),
    (k_folien, 'Unterdachbahn', null, null, '', 40),
    (k_folien, 'Unterdachbahn erhöht regns.', null, null, '', 50),
    (k_folien, 'Fassadenfolie', null, null, '', 60),
    (k_folien, 'SILO Plane - Abdeckung', null, null, '', 70);

  -- Dämmstoffe (Preis = EUR/m³ -> EUR/m² = Preis x Dämmstärke/100; alle ohne Preis
  -- lt. Excel-Letztstand -> Manuell-Preis-Modus)
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_daemm, 'Holzwolle', null, null, '€ / m³', 10),
    (k_daemm, 'Steinwolle', null, null, '€ / m³', 20),
    (k_daemm, 'Zellulose', null, null, '€ / m³', 30),
    (k_daemm, 'Stroh', null, null, '€ / m³', 40),
    (k_daemm, 'Holzfaser NF 60 mm', null, null, '€ / m³', 50),
    (k_daemm, 'Holzfaser NF 60 mm vorverputzt', null, null, '€ / m³', 60);

  -- Unterkonstruktion (Einheiten-Label "€ / m³" wie im Excel; gerechnet wird
  -- wie in beiden Referenzen EUR/m² Aufbaufläche - Label rein kosmetisch, R6)
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_unterk, 'Sparschalung 30 mm FI e-40 cm', 1.95, 2.6325, '€ / m³', 10),
    (k_unterk, 'Sparschalung 30 mm FI e-62,5 cm', 2.2, 2.97, '€ / m³', 20),
    (k_unterk, 'Sparschalung 30 mm FI e-120 cm', 0.7, 0.945, '€ / m³', 30),
    (k_unterk, 'Lärche Rhombus 25/65', 1.85, 2.4975, '€ / m³', 40),
    (k_unterk, 'Einseitig schwarz', null, null, '€ / m³', 50);

  -- Fassadenbretter
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_fassade, 'Thermo Fichte 20/…HBG', 32, 43.2, '', 10),
    (k_fassade, 'Lärche sägerau', null, null, '', 20),
    (k_fassade, 'Weißtanne', null, null, '', 30),
    (k_fassade, 'AZ gebürstet', null, null, '', 40),
    (k_fassade, 'AZ gebürstet 2 Seiten', null, null, '', 50);

  -- Plattenwerkstoffe
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_platten, 'OSB 3 - 18 - 62,5x250', 6.5, 8.775, '', 10),
    (k_platten, 'OSB 3 - 25 - 62,5x250', 9.5, 12.825, '', 20),
    (k_platten, 'OSB 4 - 18 - 62,5x250', 7.5, 10.125, '', 30),
    (k_platten, 'OSB 4 - 25 - 62,5x250', 10.5, 14.175, '', 40),
    (k_platten, 'DWD - 16 - 63,5x250', 5.5, 7.425, '', 50),
    (k_platten, 'Dreischicht - FI - 19  AB', 24.5, 33.075, '', 60),
    (k_platten, 'Dreischicht - FI - 27  AB', 25, 33.75, '', 70),
    (k_platten, 'Dreischicht - FI - 19  CC', 16.5, 22.275, '', 80),
    (k_platten, 'Dreischicht - FI - 27  CC', 21, 28.35, '', 90),
    (k_platten, 'Dreischicht - LA - 19  AB', 38, 51.3, '', 100);

  -- KVH (EUR/m³; "Riegelkonstruktion…" wird per Geometrie-Formel verrechnet,
  -- EK-Basis wie Excel-Module 2-20; m³-Preis in der Zeile editierbar)
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_kvh, 'Riegelkonstruktion 6/…', 380, 513, '€ / m³', 10),
    (k_kvh, 'KVH Stärke ab 10 cm', 395, 533.25, '€ / m³', 20);

  -- BSH (EUR/m³)
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_bsh, 'Fichte NSI', 495, 668.25, '€ / m³', 10),
    (k_bsh, 'Fichte SI', 560, 756, '€ / m³', 20),
    (k_bsh, 'Lärche NSI', 900, 1215, '€ / m³', 30),
    (k_bsh, 'Lärche SI', 1150, 1552.5, '€ / m³', 40),
    (k_bsh, 'Lärche Mini', 880, 1188, '€ / m³', 50);

  -- Lacke ADLER (ek = 3-seitig EUR/m², vk = 4-seitig = ek x 1,65)
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_adler, 'Lignovit 3 in 1 Lasur', 8.2, 13.53, '€ / m²', 10),
    (k_adler, 'Lignovit Color STQ abgetönt über FM System', 7.85, 12.9525, '€ / m²', 20),
    (k_adler, 'Lignovit Color STQ nur zum Mischen über W30', 7.3, 12.045, '€ / m²', 30),
    (k_adler, 'Lignovit Lasur', 7.1, 11.715, '€ / m²', 40),
    (k_adler, 'Lignovit Interior UV 100 - Natur', 7.35, 12.1275, '€ / m²', 50),
    (k_adler, 'Lignovit Interior UV 100 - Sondertöne', 9.5, 15.675, '€ / m²', 60),
    (k_adler, 'Lignovit Platin - Basisfarbton', 8.55, 14.1075, '€ / m²', 70),
    (k_adler, 'Lignovit Platin - Sondertöne', 9.6, 15.84, '€ / m²', 80),
    (k_adler, 'Lignovit Primo', 6.75, 11.1375, '€ / m²', 90),
    (k_adler, 'Lignovit Protect Finish', 10.35, 17.0775, '€ / m²', 100),
    (k_adler, 'Lignovit Protect Primo', 10.35, 17.0775, '€ / m²', 110),
    (k_adler, 'Lignovit Silverwood', 8.5, 14.025, '€ / m²', 120),
    (k_adler, 'Lignovit Sperrgrund', 7.6, 12.54, '€ / m²', 130),
    (k_adler, 'Lignovit Terra', 8.75, 14.4375, '€ / m²', 140),
    (k_adler, 'Lignovit Terra - abgetönt', 10.55, 17.4075, '€ / m²', 150);

  -- Lacke SYNTHESA / DANSKE
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_synthesa, 'Industrielasur', 6.95, 11.4675, '€ / m²', 10),
    (k_synthesa, 'Dekorlasur', 8.4, 13.86, '€ / m²', 20),
    (k_synthesa, 'Aqua Rapid', 7.95, 13.1175, '€ / m²', 30),
    (k_synthesa, 'Color Rapid Weiß', 10.5, 17.325, '€ / m²', 40),
    (k_synthesa, 'Vorstreichfarbe', 8.5, 14.025, '€ / m²', 50),
    (k_synthesa, 'Twinproof', 10.45, 17.2425, '€ / m²', 60),
    (k_synthesa, 'Greywood/Silverstyle', 10.45, 17.2425, '€ / m²', 70);

  -- Auf-/Minderpreise Lohnlackierung (vk = Betrag EUR/m², Minderpreis negativ)
  insert into public.kalkulation_artikel (kategorie_id, name, ek, vk, einheit, sort) values
    (k_aufpreis, 'Minderpreis für Entnahme durch Kunden', null, -0.1, '€ / m²', 10),
    (k_aufpreis, 'Aufpreis für Leisten bis 30 x 70 mm', null, 0.35, '€ / m²', 20),
    (k_aufpreis, 'Aufpreis für Materiallängen unter 3 m', null, 0.15, '€ / m²', 30),
    (k_aufpreis, 'Aufpreis für sägeraue Oberflächen', null, 0.35, '€ / m²', 40),
    (k_aufpreis, 'Aufpreis für Zwischenschliff max 2 Seiten', null, 0.85, '€ / m²', 50),
    (k_aufpreis, 'Aufpreis für Vorreinigen von sägerauen oder gebürsteten Oberflächen', null, 0.8, '€ / m²', 60);
end $$;

-- ----------------------------------------------------------------------------
-- Betriebsdaten als app_settings-Keys (Präfix kalk_).
-- Werte = Excel-Letztstand (gewinnt bei Widerspruch zum HTML-Tool:
-- Mittellohn 65 statt 47, Kran 180 statt 150).
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('kalk_mittellohn', '65'),
  ('kalk_stunden_pro_tag', '9'),
  ('kalk_vk_faktor', '1.35'),
  ('kalk_kran_stundensatz', '180'),
  ('kalk_maut_frei_km', '55'),
  ('kalk_fahrt_bus', '0.8'),
  ('kalk_fahrt_bus_maut', '1.25'),
  ('kalk_fahrt_lkw', '1.2'),
  ('kalk_fahrt_lkw_maut', '1.85'),
  ('kalk_riegel_abstand', '62.5'),
  ('kalk_riegel_brett_dicke', '6'),
  ('kalk_lack_vierseitig_faktor', '1.65'),
  ('kalk_lack_kunde_satz', '4.95'),
  ('kalk_lack_farbwechsel', '25'),
  ('kalk_lack_dimension', '25'),
  ('kalk_lack_anfahrt_km', '0.85'),
  ('kalk_lack_fahrzeit_h', '45')
on conflict (key) do nothing;
