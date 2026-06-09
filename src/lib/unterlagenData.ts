// Auto-generiert aus dem GROISMAIER-Ordner (Preislisten + Büro-Vorlagen).
// Metadaten katalogisiert (Lieferant, Kategorie, Jahr) — Dateien liegen in
// public/preislisten/ bzw. public/buero-vorlagen/.

export interface UnterlageItem {
  file: string;
  title: string;
  supplier: string;
  category: string;
  year: number | null;
  description: string;
  viewable: boolean; // true = PDF/Bild (im Browser ansehbar), false = Word/Excel (Download)
  ext: string;
}

export const PREISLISTEN: UnterlageItem[] = [
  { file: "/preislisten/51-holzlagerliste-2026.pdf", title: "Gerstenmeyer – Holzlagerliste 2026", supplier: "Gerstenmeyer", category: "Schnittholz & Bauholz", year: 2026, description: "Lagerliste der Firma Gerstenmeyer mit verfügbaren Schnitt- und Bauhölzern für 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/49-preisliste-wiederverka-ufer-2026-fa-zwickl.pdf", title: "Zwickl – Wiederverkäufer-Preisliste 2026", supplier: "Zwickl", category: "Schnittholz & Bauholz", year: 2026, description: "Wiederverkäufer-Preisliste der Firma Zwickl für Holz- und Bauprodukte 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/19-holz-hahn-august.pdf", title: "Holz Hahn – Preisliste August 2025", supplier: "Holz Hahn", category: "Schnittholz & Bauholz", year: 2025, description: "Preisliste der Firma Holz Hahn für Bau- und Schnittholz, Stand August 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/18-holz-hahn-ma-rz.pdf", title: "Holz Hahn – Preisliste März 2025", supplier: "Holz Hahn", category: "Schnittholz & Bauholz", year: 2025, description: "Preisliste der Firma Holz Hahn für Bau- und Schnittholz, Stand März 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/20-holz-hahn-oktober.pdf", title: "Holz Hahn – Preisliste Oktober 2025", supplier: "Holz Hahn", category: "Schnittholz & Bauholz", year: 2025, description: "Preisliste der Firma Holz Hahn für Bau- und Schnittholz, Stand Oktober 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/28-preisliste-bauholz-und-platten-stand-april-2025.docx", title: "Materialpreise Mitarbeiter – Bauholz und Platten, Stand April 2025", supplier: "", category: "Schnittholz & Bauholz", year: 2025, description: "Interne Mitarbeiter-Preisliste für Bauholz und Plattenwerkstoffe, Stand April 2025.", viewable: false, ext: "docx" },
  { file: "/preislisten/29-preisliste-bauholz-und-platten-stand-september-2025-entwurf.docx", title: "Materialpreise Mitarbeiter – Bauholz und Platten, Stand September 2025 (Entwurf)", supplier: "", category: "Schnittholz & Bauholz", year: 2025, description: "Interner Entwurf der Mitarbeiter-Preisliste für Bauholz und Plattenwerkstoffe, Stand September 2025.", viewable: false, ext: "docx" },
  { file: "/preislisten/25-sa-gewerk-riegler-douglasie-wiederverka-ufer-preisliste-1-hj-2025.xlsx", title: "Sägewerk Riegler – Douglasie Wiederverkäufer-Preisliste 1. HJ 2025", supplier: "Riegler", category: "Schnittholz & Bauholz", year: 2025, description: "Wiederverkäufer-Preisliste für Douglasienholz des Sägewerks Riegler, 1. Halbjahr 2025.", viewable: false, ext: "xlsx" },
  { file: "/preislisten/24-preisliste-zwickl.pdf", title: "Zwickl – Preisliste 2025", supplier: "Zwickl", category: "Schnittholz & Bauholz", year: 2025, description: "Preisliste der Firma Zwickl Holz, Stand 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/30-holz-hahn-ma-rz.pdf", title: "Holz Hahn – Preisliste März 2024", supplier: "Holz Hahn", category: "Schnittholz & Bauholz", year: 2024, description: "Preisliste der Firma Holz Hahn für Bau- und Schnittholz, Stand März 2024.", viewable: true, ext: "pdf" },
  { file: "/preislisten/31-zwickl-holz-preisliste-wiederverka-ufer-ab-02-2024.pdf", title: "Zwickl Holz – Wiederverkäufer-Preisliste ab 02/2024", supplier: "Zwickl", category: "Schnittholz & Bauholz", year: 2024, description: "Wiederverkäufer-Preisliste der Firma Zwickl Holz, gültig ab Februar 2024.", viewable: true, ext: "pdf" },
  { file: "/preislisten/08-preise-wiederverka-ufer-2020-zwickl.pdf", title: "Zwickl – Wiederverkäuferpreise 2020", supplier: "Zwickl", category: "Schnittholz & Bauholz", year: 2020, description: "Wiederverkäufer-Preisliste der Firma Zwickl für das Jahr 2020.", viewable: true, ext: "pdf" },
  { file: "/preislisten/02-formholz-ha-ndler-zimmerer-dachdecker-ma-rz-2016x.pdf", title: "FORMHOLZ – Preisliste Händler/Zimmerer/Dachdecker März 2016", supplier: "FORMHOLZ", category: "Schnittholz & Bauholz", year: 2016, description: "Händler- und Zimmerer-/Dachdecker-Preisliste der Firma FORMHOLZ vom März 2016.", viewable: true, ext: "pdf" },
  { file: "/preislisten/10-preisliste-na-sch-2016.pdf", title: "Näsch – Preisliste 2016", supplier: "Näsch", category: "Schnittholz & Bauholz", year: 2016, description: "Preisliste der Firma Näsch für das Jahr 2016.", viewable: true, ext: "pdf" },
  { file: "/preislisten/15-zwickl-wv-preiliste-2016.pdf", title: "Zwickl – WV-Preisliste 2016", supplier: "Zwickl", category: "Schnittholz & Bauholz", year: 2016, description: "Wiederverkäufer-Preisliste des Sägewerks Zwickl aus dem Jahr 2016 für Schnitt- und Bauholz.", viewable: true, ext: "pdf" },
  { file: "/preislisten/04-fa-zehetner-vitis-bis-juni-2015.xls", title: "Zehetner Vitis – Preisliste bis Juni 2015", supplier: "Zehetner", category: "Schnittholz & Bauholz", year: 2015, description: "Preisliste der Firma Zehetner (Vitis) mit Gültigkeit bis Juni 2015.", viewable: false, ext: "xls" },
  { file: "/preislisten/44-zwickl-detailverkauf-2015.pdf", title: "Zwickl – Detailverkauf 2015", supplier: "Zwickl", category: "Schnittholz & Bauholz", year: 2015, description: "Detailverkaufs-Preisliste der Firma Zwickl für Holz- und Bauprodukte 2015.", viewable: true, ext: "pdf" },
  { file: "/preislisten/45-zwickl-wiederverka-uferpreise-2015.pdf", title: "Zwickl – Wiederverkäuferpreise 2015", supplier: "Zwickl", category: "Schnittholz & Bauholz", year: 2015, description: "Wiederverkäufer-Preisliste der Firma Zwickl für Holz- und Bauprodukte 2015.", viewable: true, ext: "pdf" },
  { file: "/preislisten/03-formholz-kvh-bsh-preisliste-ma-rz-2016x.pdf", title: "FORMHOLZ – KVH/BSH Preisliste März 2016", supplier: "FORMHOLZ", category: "Brettschichtholz (BSH/BSP/KVH)", year: 2016, description: "Preisliste für KVH und Brettschichtholz (BSH) der Firma FORMHOLZ vom März 2016.", viewable: true, ext: "pdf" },
  { file: "/preislisten/41-bsh-la-rchenpreisliste-fa-wiehag08-2015.pdf", title: "Wiehag – BSH Lärchen-Preisliste August 2015", supplier: "Wiehag", category: "Brettschichtholz (BSH/BSP/KVH)", year: 2015, description: "Preisliste der Firma Wiehag für Brettschichtholz (BSH) aus Lärche, Stand August 2015.", viewable: true, ext: "pdf" },
  { file: "/preislisten/42-bsh-preisliste-fa-wiehag.pdf", title: "Wiehag – BSH-Preisliste 2015", supplier: "Wiehag", category: "Brettschichtholz (BSH/BSP/KVH)", year: 2015, description: "Preisliste der Firma Wiehag für Brettschichtholz (BSH).", viewable: true, ext: "pdf" },
  { file: "/preislisten/09-preisliste-mhm-2013-aktuell.pdf", title: "MHM – Preisliste 2013 (aktuell)", supplier: "MHM", category: "Brettschichtholz (BSH/BSP/KVH)", year: 2013, description: "Preisliste der Massiv-Holz-Mauer (MHM) für Massivholz-Wandelemente, Stand 2013/aktuell.", viewable: true, ext: "pdf" },
  { file: "/preislisten/23-preisliste-hobelware.pdf", title: "Preisliste Hobelware 2025", supplier: "", category: "Hobelware & Profilholz", year: 2025, description: "Preisliste für Hobelware und Profilholz, Stand 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/11-preisliste-wiederverka-ufer-ab-april-2022.pdf", title: "Zwickl – Wiederverkäuferpreise ab April 2022", supplier: "Zwickl", category: "Hobelware & Profilholz", year: 2022, description: "Wiederverkäufer-Preisliste des Sägewerks Zwickl (Raabs/Thaya) ab April 2022 mit Lärchen-Hobelware, Glattkant- und Rifteldielen, Riftelfassade sowie Sägeware.", viewable: true, ext: "pdf" },
  { file: "/preislisten/07-peter-moser-rustikale-holzbearbeitung-feber2015.pdf", title: "Peter Moser – Rustikale Holzbearbeitung Februar 2015", supplier: "Peter Moser", category: "Hobelware & Profilholz", year: 2015, description: "Preisliste für rustikal bearbeitete Hobelware/Profilholz der Firma Peter Moser, Februar 2015.", viewable: true, ext: "pdf" },
  { file: "/preislisten/57-de-eur-hf-2021-03-web.pdf", title: "best wood Schneider – Preisliste Dämmung März 2021", supplier: "Schneider", category: "Dämmung", year: 2021, description: "Preisliste der Firma best wood SCHNEIDER für ökologische Holzfaser-Dämmstoffe, gültig ab März 2021.", viewable: true, ext: "pdf" },
  { file: "/preislisten/47-bauder-sk-ab-15-05-2017.pdf", title: "Bauder – Preisliste ab 15.05.2017", supplier: "Bauder", category: "Dämmung", year: 2017, description: "Preisliste der Firma Bauder gültig ab 15.05.2017.", viewable: true, ext: "pdf" },
  { file: "/preislisten/46-2017-vakuumda-mmung.pdf", title: "Vakuumdämmung (VIP) – Preisliste 2017", supplier: "", category: "Dämmung", year: 2017, description: "Preisliste für Vakuumdämmpaneele (VIP, Safe & Speed SF-2GGR-VIP 30), Lagerware Stockerau, Stand 2017.", viewable: true, ext: "pdf" },
  { file: "/preislisten/33-bio-baustrohballen.pdf", title: "Sonnenklee – Bio-Baustrohballen", supplier: "Sonnenklee", category: "Stroh-Dämmung", year: 2024, description: "Produktinformation der Firma Sonnenklee zu Bio-Baustrohballen als Dämmstoff.", viewable: true, ext: "pdf" },
  { file: "/preislisten/34-datenblatt-strohda-mmung.pdf", title: "Sonnenklee – Datenblatt Strohdämmung", supplier: "Sonnenklee", category: "Stroh-Dämmung", year: 2024, description: "Technisches Datenblatt der Firma Sonnenklee zur Strohdämmung.", viewable: true, ext: "pdf" },
  { file: "/preislisten/35-einblasda-mmung-aus-stroh.pdf", title: "Sonnenklee – Einblasdämmung aus Stroh", supplier: "Sonnenklee", category: "Stroh-Dämmung", year: 2024, description: "Produktinformation der Firma Sonnenklee zur Einblasdämmung aus Stroh.", viewable: true, ext: "pdf" },
  { file: "/preislisten/36-preisliste-baustroh-2024.pdf", title: "Sonnenklee – Preisliste Baustroh 2024", supplier: "Sonnenklee", category: "Stroh-Dämmung", year: 2024, description: "Preisliste der Firma Sonnenklee für Baustroh, Ausgabe 2024.", viewable: true, ext: "pdf" },
  { file: "/preislisten/32-bauen-mit-stroh-2023.pdf", title: "Sonnenklee – Bauen mit Stroh 2023", supplier: "Sonnenklee", category: "Stroh-Dämmung", year: 2023, description: "Informationsbroschüre der Firma Sonnenklee zum Bauen mit Stroh, Ausgabe 2023.", viewable: true, ext: "pdf" },
  { file: "/preislisten/50-schraubfundamente.pdf", title: "Z-Part – Schraubfundamente Preisliste 2026", supplier: "Z-Part", category: "Schraubfundamente", year: 2026, description: "Preisliste der Firma Z-Part (z-part.group) für Schraubfundamente verschiedener Serien, Stand 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/48-preisliste-schraubfundamente-2016-lp-20-rabatt-sonst-netto-ab-werk.pdf", title: "Schraubfundamente – Preisliste 2016", supplier: "", category: "Schraubfundamente", year: 2016, description: "Preisliste für Schraubfundamente 2016 (Listenpreis minus 20% Rabatt, sonst netto ab Werk).", viewable: true, ext: "pdf" },
  { file: "/preislisten/55-flyer-oekran-2026.pdf", title: "Ö Kran – Flyer 2026", supplier: "Ö Kran", category: "Kran & Hebetechnik", year: 2026, description: "Informationsflyer der Firma Ö Kran zu Kran- und Hebeleistungen 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/56-preisliste-oekran-2026.pdf", title: "Ö Kran – Preisliste 2026", supplier: "Ö Kran", category: "Kran & Hebetechnik", year: 2026, description: "Preisliste der Firma Ö Kran für Kran- und Hebetechnik-Einsätze 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/52-lkw-2026.pdf", title: "Gerstenmeyer – LKW-Zustellung 2026", supplier: "Gerstenmeyer", category: "Transport (LKW)", year: 2026, description: "Preisliste für LKW-Transport und Zustellung der Firma Gerstenmeyer 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/21-lkw-2025.pdf", title: "LKW-Transportkosten 2025", supplier: "", category: "Transport (LKW)", year: 2025, description: "Preisliste für LKW-Transport und Zustellung, Stand 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/53-lohnabbund-2026.pdf", title: "Gerstenmeyer – Lohnabbund 2026", supplier: "Gerstenmeyer", category: "Abbund & Lohnabbund", year: 2026, description: "Preisliste für Lohnabbund-Leistungen der Firma Gerstenmeyer 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/22-lohnabbund-2025.pdf", title: "Lohnabbund 2025", supplier: "", category: "Abbund & Lohnabbund", year: 2025, description: "Preisliste für Lohnabbund-Leistungen, Stand 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/37-bsp-abbund.pdf", title: "BSP Abbund 2023", supplier: "", category: "Abbund & Lohnabbund", year: 2023, description: "Preisliste für den Abbund von Brettsperrholz (BSP), Stand 2023.", viewable: true, ext: "pdf" },
  { file: "/preislisten/39-lohnabbund.pdf", title: "Lohnabbund 2023", supplier: "", category: "Abbund & Lohnabbund", year: 2023, description: "Preisliste für Lohnabbund-Leistungen, Stand 2023.", viewable: true, ext: "pdf" },
  { file: "/preislisten/13-prospekt-2016.pdf", title: "Näsch – Prospekt unsichtbares Terrassen-Befestigungssystem 2016", supplier: "Näsch", category: "Terrasse", year: 2016, description: "Prospekt des Näsch-Systems, einer unsichtbaren Edelstahl-Befestigung für Holzterrassen ohne sichtbare Schrauben auf der Trittfläche.", viewable: true, ext: "pdf" },
  { file: "/preislisten/43-preisliste-profidec-fa-wiehag-03-2015.pdf", title: "Wiehag – Profidec Preisliste März 2015", supplier: "Wiehag", category: "Terrasse", year: 2015, description: "Preisliste der Firma Wiehag für Profidec Balkon-/Terrassen-Deckelemente aus Brettschichtholz, Stand März 2015.", viewable: true, ext: "pdf" },
  { file: "/preislisten/05-pl-terrasse-2013-210x297mm-abf-stockerau-low.pdf", title: "JAF – Terrassenholz Sortiment Stockerau 2013", supplier: "JAF", category: "Terrasse", year: 2013, description: "Preisliste/Sortiment Terrassenholz der Firma JAF (Frischeis), Standort Stockerau, 2013.", viewable: true, ext: "pdf" },
  { file: "/preislisten/12-produktkatalog-2016.pdf", title: "FIXINGGROUP – Produktkatalog Premium Fixing Systems 2016", supplier: "FIXINGGROUP", category: "Beschläge & Bauchemie", year: 2016, description: "Produktkatalog der FIXINGGROUP GmbH (TIGA Fassadensystem, LIFTO, UNIA) mit Befestigungssystemen für Terrasse und Fassade samt Artikelnummern und Preisen.", viewable: true, ext: "pdf" },
  { file: "/preislisten/01-einkaufsk-1.pdf", title: "ISOCELL – Einkaufskonditionen Luftdichtheitssysteme 2013", supplier: "ISOCELL", category: "Beschläge & Bauchemie", year: 2013, description: "Einkaufskonditionen für Luftdichtheitssysteme, Dachbahnen, Klebebänder und Dichtmaterialien zur ISOCELL-Preisliste 02/2013.", viewable: true, ext: "pdf" },
  { file: "/preislisten/14-schallda-mmstreifen-fa-rotho-blaas.docx", title: "Rotho Blaas – Schalldämmstreifen", supplier: "Rotho Blaas", category: "Beschläge & Bauchemie", year: null, description: "Unterlage zu Schalldämmstreifen der Firma Rotho Blaas für die schalltechnische Entkopplung im Holzbau.", viewable: false, ext: "docx" },
  { file: "/preislisten/17-rothoblaas-xylofon-technisches-datenblatt-de.pdf", title: "Rotho Blaas – Xylofon Technisches Datenblatt", supplier: "Rotho Blaas", category: "Beschläge & Bauchemie", year: null, description: "Technisches Datenblatt zum Rotho Blaas Xylofon, einem Profil zur Schall- und Schwingungsentkopplung im Holzbau.", viewable: true, ext: "pdf" },
  { file: "/preislisten/27-stark-entsorgung.pdf", title: "Stark – Entsorgung 2025", supplier: "Stark", category: "Entsorgung", year: 2025, description: "Preisliste der Firma Stark für Entsorgungsleistungen, Stand 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/54-serviceangebot-2026.pdf", title: "Gerstenmeyer – Serviceangebot 2026", supplier: "Gerstenmeyer", category: "Service & Sonstiges", year: 2026, description: "Übersicht über das Serviceangebot der Firma Gerstenmeyer für 2026.", viewable: true, ext: "pdf" },
  { file: "/preislisten/26-serviceangebot.pdf", title: "Serviceangebot 2025", supplier: "", category: "Service & Sonstiges", year: 2025, description: "Übersicht der angebotenen Service- und Dienstleistungen, Stand 2025.", viewable: true, ext: "pdf" },
  { file: "/preislisten/38-leistungsu-bersicht.pdf", title: "Leistungsübersicht 2023", supplier: "", category: "Service & Sonstiges", year: 2023, description: "Übersicht über das Leistungsangebot, Stand 2023.", viewable: true, ext: "pdf" },
  { file: "/preislisten/40-serviceangebot.pdf", title: "Serviceangebot 2023", supplier: "", category: "Service & Sonstiges", year: 2023, description: "Serviceangebot mit Übersicht der angebotenen Dienstleistungen, Stand 2023.", viewable: true, ext: "pdf" },
  { file: "/preislisten/06-preise-2016-zimmerer.xls", title: "Preise Zimmerer 2016 (interne Kalkulation)", supplier: "", category: "Service & Sonstiges", year: 2016, description: "Interne Zimmerer-Preisübersicht/Kalkulationstabelle für das Jahr 2016.", viewable: false, ext: "xls" },
  { file: "/preislisten/16-doc00923920160222092130.pdf", title: "Würth-Hochenburger – Aktionsflyer Makita Akku-Radio 2016", supplier: "Würth-Hochenburger", category: "Service & Sonstiges", year: 2016, description: "Aktions-Flyer von Würth-Hochenburger (W+H Baustoffe) für ein Makita Akku-Radio DMR102, gültig bis 13.03.2016.", viewable: true, ext: "pdf" },
];

export const BUERO_VORLAGEN: UnterlageItem[] = [
  { file: "/buero-vorlagen/67-christian-briefpapier-rz-mitlogo.jpg", title: "Briefpapier Reinzeichnung (mit Logo)", supplier: "", category: "Büro-Vorlage", year: null, description: "Reinzeichnung des Briefpapiers von Holzbau Groismaier mit eingeblendetem Logo.", viewable: true, ext: "jpg" },
  { file: "/buero-vorlagen/66-christian-briefpapier-rz.jpg", title: "Briefpapier Reinzeichnung (ohne Logo)", supplier: "", category: "Büro-Vorlage", year: null, description: "Reinzeichnung des Briefpapiers von Holzbau Groismaier ohne eingeblendetes Logo.", viewable: true, ext: "jpg" },
  { file: "/buero-vorlagen/58-deckblatt-fu-r-bvh.docx", title: "Deckblatt für Bauvorhaben (BVH)", supplier: "", category: "Büro-Vorlage", year: null, description: "Word-Vorlage für das Deckblatt eines Bauvorhabens.", viewable: false, ext: "docx" },
  { file: "/buero-vorlagen/59-deckblatt-fu-r-bvh1.docx", title: "Deckblatt für Bauvorhaben (BVH) – Variante 1", supplier: "", category: "Büro-Vorlage", year: null, description: "Zweite Word-Vorlage für das Deckblatt eines Bauvorhabens.", viewable: false, ext: "docx" },
  { file: "/buero-vorlagen/65-cg-holzbau-stempel-60-40.pdf", title: "Holzbau Groismaier – Firmenstempel 60x40", supplier: "", category: "Büro-Vorlage", year: null, description: "Druckvorlage für den Firmenstempel (60x40 mm) von Holzbau Groismaier.", viewable: true, ext: "pdf" },
  { file: "/buero-vorlagen/60-ordnerru-cken-gross.docx", title: "Ordnerrücken groß", supplier: "", category: "Büro-Vorlage", year: null, description: "Word-Vorlage zur Beschriftung breiter Ordnerrücken.", viewable: false, ext: "docx" },
  { file: "/buero-vorlagen/61-ordnerru-cken-klein.docx", title: "Ordnerrücken klein", supplier: "", category: "Büro-Vorlage", year: null, description: "Word-Vorlage zur Beschriftung schmaler Ordnerrücken.", viewable: false, ext: "docx" },
  { file: "/buero-vorlagen/63-vorlage-ordnerruecken-ordnerbeschriftung-1.doc", title: "Vorlage Ordnerrücken / Ordnerbeschriftung", supplier: "", category: "Büro-Vorlage", year: null, description: "Word-Vorlage für Ordnerrücken und Ordnerbeschriftung.", viewable: false, ext: "doc" },
  { file: "/buero-vorlagen/62-vorlage-ordnerruecken-ordnerbeschriftung-1-automatisch-wiederhergestel.doc", title: "Vorlage Ordnerrücken / Ordnerbeschriftung (wiederhergestellt)", supplier: "", category: "Büro-Vorlage", year: null, description: "Automatisch wiederhergestellte Word-Vorlage für Ordnerrücken und Ordnerbeschriftung.", viewable: false, ext: "doc" },
  { file: "/buero-vorlagen/64-vorlgae-stundendoku.xlsx", title: "Vorlage Stundendokumentation", supplier: "", category: "Büro-Vorlage", year: null, description: "Excel-Vorlage zur Dokumentation der geleisteten Arbeitsstunden.", viewable: false, ext: "xlsx" },
];

/** Kategorie-Reihenfolge für die Gruppierung der Preislisten. */
export const PREISLISTEN_KATEGORIEN: string[] = [
  "Schnittholz & Bauholz",
  "Brettschichtholz (BSH/BSP/KVH)",
  "Hobelware & Profilholz",
  "Plattenwerkstoffe",
  "Dämmung",
  "Stroh-Dämmung",
  "Schraubfundamente",
  "Kran & Hebetechnik",
  "Transport (LKW)",
  "Abbund & Lohnabbund",
  "Terrasse",
  "Beschläge & Bauchemie",
  "Entsorgung",
  "Service & Sonstiges",
];
