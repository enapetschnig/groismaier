# Umsetzungsplan: Finanzplanung + Ausschreibungen (ÖNORM)

Holzbau Groismaier · Stand 29.07.2026

Grundlage: `Planrechnung Christian Groismaier 2025.xlsx` (24 Blätter) und zwei echte
Ausschreibungsdateien (`002 Ausschreibungs-LV.onlv`, `02_AWN-21036 ZIMMERMANN.onlv`).
Beide wurden vollständig ausgewertet; dieser Plan beschreibt, was gebaut wird — noch
wird nichts umgesetzt.

---

# Modul A — Finanzplanung

## A1. Die Kernidee: nicht abtippen, sondern ableiten

Das Excel führt jede Zahl **zweimal**: einmal als Plan (Soll) und einmal als Ist.
Die Ist-Seite ist reine Fleißarbeit — und genau diese Zahlen stehen in der App bereits.

| Excel-Blatt | Woher die App die Ist-Werte kennt |
|---|---|
| Umsatz | `invoices` (Rechnungen) + `invoice_payments` (echte Zahlungseingänge mit Datum) |
| BV Aufstellung | `invoices` mit `typ='angebot'` (Angebotsphase) bzw. Auftragsbestätigung/Projekt (beauftragt) |
| Wareneinkauf | `purchase_invoices` (Eingangsrechnungen, inkl. `bezahlt_am`) |
| Materialaufwand | `purchase_invoice_allocations` (Positionen je Projekt) |
| Personalkosten (PEK) | `employees` + `time_entries` |
| Sonstige betriebl. Aufwendungen | `fixkosten` (Tabelle existiert bereits, wird noch nicht genutzt) |
| Fahrzeugkosten | `vehicle_costs` |

**Konsequenz für den Bau:** Ist-Werte werden *nicht* gespeichert, sondern bei jedem
Aufruf aus den Belegen gerechnet. Damit kann die Planung nie veralten und es gibt
keine Doppelpflege. Gespeichert werden nur die **Plan-Werte** und die Stammdaten,
die es sonst nirgends gibt (Kredite, Investitionen, Fixkosten-Kategorien).

Eine Ausnahme: Für Zeiträume **vor** der App-Einführung gibt es keine Belege. Diese
historischen Ist-Werte (2025) kommen einmalig per Excel-Import (Schritt A5.4) in eine
eigene Tabelle und werden für alte Monate anstelle der Beleg-Auswertung angezeigt.

## A2. Neue Tabellen

Alle Beträge `numeric(14,2)`, Zugriff nur für Administratoren (RLS wie bei
`nachkalkulation`/`fixkosten` — Verdienstdaten dürfen Mitarbeiter nie sehen).

**`finanz_kategorien`** — die Zeilenstruktur der Aufwandsblätter
`id, bereich, name, detail, sort, aktiv`
`bereich` ∈ `sbaw` | `wareneinkauf` | `sonstige_ertraege` | `investitionen`.
Startwerte aus dem Excel-Blatt SBAW: Pflichtbeiträge, Gebühren, Beratung, Miete,
Betriebskosten, Leasing, Versicherungen, Kfz, Werbung, Instandhaltung …

**`finanz_plan`** — der Soll-Wert je Monat
`id, jahr, monat, bereich, kategorie_id, detail, betrag, notiz`
Ein Datensatz je Zelle des Monatsrasters. Deckt alle Blätter ab (Umsatz,
Wareneinkauf, SBAW, Personal, Erträge, Investitionen) — ein Modell statt acht.

**`finanz_ist_historie`** — importierte Ist-Werte vor App-Start
`id, jahr, monat, bereich, kategorie_id, betrag, quelle`

**`finanz_kredite`**
`id, name, bank, kreditbetrag, rate_monatlich, zinssatz, start_datum, laufzeit_monate, aktiv, notiz`
Daraus entstehen die monatlichen Raten im Liquiditätsplan automatisch — im Excel
ist jede Rate einzeln eingetragen.

**`finanz_anschaffungen`** + **`afa_saetze`**
`anschaffungen: id, kategorie, bezeichnung, betrag, anschaffungsdatum, nutzungsdauer_jahre, afa_text, aktiv`
`afa_saetze: anlagenbeschreibung, nutzungsdauer` — der 500-zeilige Katalog aus dem
Excel-Blatt „afa sätze" wird einmal importiert und dient als Auswahlhilfe: Anlage
wählen → Nutzungsdauer wird vorgeschlagen → Abschreibung rechnet sich selbst
(Halbjahresregel wie im Excel-Blatt AFA).

**Einstellungen** (`app_settings`, kein neues Schema nötig):
`finanz_zahlungsstaffel` als JSON — die Regel aus dem Blatt „Erklärungen":

| Auftragswert | Anzahlung | Teilrechnungen | Schlusszahlung |
|---|---|---|---|
| bis 10.000 € | 50 % | – | 50 % |
| bis 60.000 € | 30 % | 1 | 10 % |
| über 60.000 € | 15 % | 1–10 | 5 % |

`finanz_koest_satz` (23 %), `finanz_planjahre` (3), `finanz_startliquiditaet`.

## A3. Die Masken

Neue Seite `/finanzplanung` (Admin), im KingBill-Design mit Reitern — bewusst nah am
gewohnten Excel, damit die Umstellung leichtfällt.

**Reiter 1 — Übersicht**
Plan-GuV als Jahresvergleich Soll/Ist mit genau der Excel-Struktur:
Umsatzerlöse → Sonstige Erträge → **Betriebsleistung (=100 %)** → Wareneinsatz →
Personalkosten → Abschreibungen → Sonstige betriebliche Aufwendungen → Zinsen →
**EGT** → KÖSt 23 % → **Gewinn nach Steuern**. Jede Zeile mit €-Betrag und %-Anteil
an der Betriebsleistung, Soll neben Ist, Abweichung farbig.

**Reiter 2 — Liquidität**
Monatsraster über 36 Monate: Zufluss (Kundenzahlungen, sonstige Erlöse, neue
Kredite) minus Abfluss (Wareneinkauf, Personal, SBAW, Investitionen, Kreditraten),
Saldo, kumulierter Endbestand — plus eine Kurve, die sofort zeigt, wann es eng wird.
Warnung, sobald der Endbestand unter einen einstellbaren Wert fällt.

**Reiter 3 — Bauvorhaben (füllt sich selbst)**
Die Pipeline aus dem Blatt „BV Aufstellung", aber automatisch: Alle Angebote und
Aufträge mit Kunde, Bauvorhaben, Summe und Ausführungszeitraum. Pro Zeile ist die
Phase wählbar (Entwurf / Angebot / beauftragt) mit hinterlegter Eintrittswahr-
scheinlichkeit; daraus und aus der Zahlungsstaffel oben errechnet die App, **wann**
welches Geld eingeht. Das ersetzt die vier Blätter „Umsatzberechnung 1–4".
Manuelle Zeilen für Vorhaben, die noch kein Angebot in der App haben, bleiben möglich.

**Reiter 4 — Kosten**
Ein Monatsraster wie im Excel (Zeilen = Kategorie/Detail, Spalten = Monate) für
SBAW, Wareneinkauf und sonstige Erträge. Umschalter „Soll / Ist / beides".
Wiederkehrende Kosten einmal anlegen und aufs Jahr verteilen lassen, statt zwölfmal
tippen.

**Reiter 5 — Personal**
Je Mitarbeiter Bruttolohn und Dienstgeberanteil, daraus die Monatskosten für drei
Jahre (Blatt „PEK Eingabe"), mit einstellbarer jährlicher Steigerung.

**Reiter 6 — Kredite & Investitionen**
Kredite mit automatischer Ratenverteilung; Anschaffungen mit Nutzungsdauer-Vorschlag
aus dem AfA-Katalog und automatischer Abschreibung.

## A4. Übernahme der bestehenden Excel-Daten

Einmaliger Import über eine Admin-Funktion: Die `.xlsx` wird hochgeladen, die App
liest die bekannten Blätter und legt Plan- und Ist-Werte für 2025–2027 an. Vor dem
Speichern eine Vorschau („X Positionen, Y Monatswerte, Summe Z — übernehmen?"), damit
nichts unbemerkt hineinläuft. Wiederholbar, ohne Dubletten.

## A5. Schritte

1. Tabellen + RLS anlegen, AfA-Katalog und SBAW-Kategorien aus dem Excel importieren
2. Auswertungs-Logik: Ist-Werte aus Belegen, Plan-Werte aus `finanz_plan`, Zahlungs-
   staffel-Prognose aus Angeboten — an einer Stelle, für alle Masken dieselbe Quelle
3. Reiter Übersicht (Plan-GuV) und Liquidität
4. Reiter Bauvorhaben, Kosten, Personal, Kredite/Investitionen
5. Excel-Import der Historie 2025
6. Abgleich: Plan-GuV der App gegen das Excel-Blatt „Plan GuV" stellen — die Zahlen
   müssen auf den Cent übereinstimmen, sonst stimmt die Logik nicht

---

# Modul B — Ausschreibungen (ÖNORM A 2063)

## B1. Was das Format ist

Österreichischer Standard **ÖNORM A 2063**, Dateiendung `.onlv` — nicht das deutsche
GAEB. Reines XML, unverschlüsselt, unkomprimiert: technisch angenehm.

Aufbau am Beispiel der echten Zimmerer-Ausschreibung:

```
Leistungsgruppe 36 "Holzbau"
 └ Unterleistungsgruppe 19 "Fassade"
    └ Grundtext 05
       └ Folgeposition L  →  Position 36.19.05L
          Stichwort:  Schindelfassade
          Langtext:   746 Zeichen Ausführungsbeschreibung
          Einheit/Menge: m² / 130,00
          Art:        Normalposition
```

Wichtig für die Umsetzung:

- **Positionsarten** — Normal-, Wahl-, Eventual- und Variantenposition. Nur
  Normalpositionen zählen in die Angebotssumme; die anderen werden bepreist, aber
  getrennt ausgewiesen. Wer das verwechselt, gibt ein falsches Angebot ab.
- **Preisanteile Lohn / Sonstiges** — jeder Einheitspreis muss aufgeteilt werden.
  Die bestehende Kalkulation liefert das bereits: `laborCosts` ist der Lohnanteil,
  Material + Fahrten + Fremdleistungen der Rest.
- **Zwei Schema-Versionen** in freier Wildbahn (`2015-07-15` und `2021-03-01`), die
  Struktur ist gleich, nur der Namensraum unterscheidet sich. Der Import muss beide
  akzeptieren — sonst scheitert er ausgerechnet an der Datei, die hereinkommt.
- Langtexte enthalten Formatierung (Absätze, fett, Listen) und müssen erhalten
  bleiben, weil sie Vertragsinhalt sind.

## B2. Neue Tabellen

**`lv_ausschreibungen`**
`id, name, lvcode, vorhaben, lvbezeichnung, auftraggeber_name, auftraggeber_adresse,
waehrung, preisbasis, schema_version, datei_name, xml_original, customer_id,
invoice_id, status, created_at`

`xml_original` speichert die hochgeladene Datei unverändert — das ist der Schlüssel
zum Export (siehe B4).

**`lv_positionen`**
`id, lv_id, positionsnummer, lg, ulg, grundtext_nr, ft_nr, ebene, ueberschrift,
stichwort, langtext, einheit, menge, positionsart, leistungsteil, sort,
ep_lohn, ep_sonstiges, ep_gesamt, positionspreis, kalkulation_id, bepreist_am, notiz`

## B3. Ablauf in der App

Neue Seite `/ausschreibungen` (Berechtigung `rechnungen`).

1. **Hochladen** — Datei wählen, die App zeigt Bauvorhaben, Auftraggeber und
   Positionsanzahl zur Bestätigung, dann Import.
2. **Bepreisen** — Baumansicht links (Leistungsgruppen aufklappbar), Position rechts
   mit vollem Langtext. Je Position drei Wege:
   - Einheitspreis direkt eintippen (Lohn/Sonstiges getrennt oder Gesamtpreis mit
     Lohnanteil in %),
   - **Aus dem Artikelstamm** übernehmen — ein Klick, Preis und Einheit kommen mit,
   - **Mit der Kalkulation rechnen** — öffnet den gewohnten Kalkulationseditor für
     diese eine Position; das Ergebnis wird als Lohn/Sonstiges zurückgeschrieben und
     bleibt über `kalkulation_id` nachvollziehbar verknüpft.
3. **Überblick** — Kopfzeile zeigt laufend: bepreist X von Y, Angebotssumme (nur
   Normalpositionen), Wahl- und Eventualpositionen getrennt, Lohnanteil gesamt.
   Unbepreiste Positionen sind rot markiert; ein Export mit Lücken wird blockiert.
4. **Exportieren** — als Angebots-LV zurück, zusätzlich als PDF und als normales
   Angebot in der App (die Positionen wandern in einen Beleg, damit Rechnungslegung
   und Nachkalkulation wie gewohnt laufen).

## B4. Die entscheidende Design-Entscheidung beim Export

Statt die Antwortdatei neu zu erzeugen, wird **die Originaldatei um die Preise
ergänzt** und das Wurzelelement von Ausschreibungs- auf Angebots-LV umgestellt.

Der Grund: Eine Ausschreibungsdatei enthält Dutzende Angaben, die wir nicht
auswerten (Zuschlagskriterien, Varianten, Leistungsteile, Herkunftskennzeichen). Wer
neu generiert, verliert sie stillschweigend — und das AVA-Programm des Ausschreibers
weist das Angebot ab. Wer ergänzt, kann nichts verlieren.

**Offener Punkt:** Für die Preisfelder brauche ich einmal ein **bepreistes
Angebots-LV als Muster** — irgendeine Datei, die schon einmal aus einem AVA-Programm
zurückgeschickt wurde. Alternativ die offizielle XSD von Austrian Standards. Beim
Import bin ich sicher; beim Export will ich die Feldnamen nicht raten, weil ein Angebot
sonst beim Empfänger nicht einliest.

## B5. Schritte

1. Tabellen + RLS
2. Import-Parser für beide Schema-Versionen, mit den zwei vorliegenden Dateien getestet
3. Baumansicht und Positionsmaske mit Langtext-Darstellung
4. Bepreisung: Direkteingabe, Artikelstamm, Kalkulation
5. Summenlogik inkl. korrekter Behandlung von Wahl- und Eventualpositionen
6. Export als Angebots-LV (sobald das Muster vorliegt) + PDF + Übernahme in ein Angebot

---

# Offene Punkte

| # | Was | Wofür |
|---|---|---|
| 1 | Ein bepreistes Angebots-LV als Muster (oder die ÖNORM-A-2063-XSD) | Modul B, Export |
| 2 | Sind die Zahlungsstaffeln (50/50, 30+10, 15+5) weiterhin gültig? | Modul A, Prognose |
| 3 | Aktuelle Kreditliste mit Rate und Restlaufzeit | Modul A, Liquidität |
| 4 | Sollen Mitarbeiterlöhne in der App stehen oder nur als Summe je Monat? | Modul A, Personal |
| 5 | Planungshorizont 3 Jahre wie im Excel — oder rollierend 12/24 Monate? | Modul A, Umfang |

# Reihenfolge

Modul A zuerst: Es hat den größeren Alltagsnutzen, die Datenbasis liegt bereits
vollständig in der App, und es hängt an keiner Zulieferung. Modul B kann parallel
begonnen werden — der Import ist unabhängig; nur der Export wartet auf die Musterdatei.
