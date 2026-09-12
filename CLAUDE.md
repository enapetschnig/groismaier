# Holzbau Groismaier — Hinweise für die KI

Diese Datei liest Claude Code (oder eine andere KI) automatisch, wenn sie in
diesem Ordner arbeitet. Sie beschreibt, was dieses Projekt besonders macht und
wo man Schaden anrichten kann.

**Wenn du eine KI bist und diese Datei liest: Lies sie ganz, bevor du etwas
änderst. Besonders den Abschnitt „Drei Dinge, die nie passieren dürfen".**

---

## Worum es geht

Die interne App der **Holzbau Groismaier GmbH** (Zimmerei, Dallein 43, 3753
Dallein, Niederösterreich). Chef: Christian Groismaier. Rund 15 Mitarbeiter.

Die App ersetzt eine frühere Software (KingBill) und deckt den kompletten
Bürobetrieb ab: Angebote, Auftragsbestätigungen, Rechnungen, Kalkulation,
Kunden, Projekte, Plantafel, Zeiterfassung, Regieberichte, Eingangsrechnungen,
Fuhrpark, Finanzplanung.

**Das ist ein Betrieb, der damit sein Geld verrechnet.** Ein Fehler in einer
Rechnung ist kein Anzeigefehler, sondern ein steuerrechtliches Problem.

Größenordnung: ~99.000 Zeilen Code, 39 Seiten, ~100 Tabellen, 297 Migrationen,
20 Serverfunktionen, 327 Tests.

---

## Drei Dinge, die nie passieren dürfen

### 1. Bestehende Belege und Zahlungen nicht anfassen

Rechnungen, Angebote, Zahlungen und Belegpositionen, die schon in der Datenbank
stehen, werden **nicht** per Migration geändert. Nie. Auch nicht „nur schnell
korrigiert", auch nicht, wenn ein Wert offensichtlich falsch aussieht.

Grund: Die Belege sind gedruckt, verschickt, verbucht und teilweise bezahlt.
Eine nachträgliche Änderung erzeugt eine Rechnung, die anders aussieht als die,
die der Kunde hat. Das ist in Österreich nicht zulässig.

Fehler werden im **Code** behoben, damit neue Belege richtig entstehen. Eine
Korrektur an vorhandenen Daten passiert nur nach ausdrücklicher, einzelner
Freigabe durch den Betrieb — und dann mit vorher gezeigtem Testlauf.

### 2. Keine Mails an echte Empfänger

Beim Testen des Mailversands geht **nichts** an Kunden. Testadresse ist
`napetschnig.chris@gmail.com`. Wenn ein Testlauf Mails auslösen könnte, wird
der Versand vorher abgefangen (siehe `page.route()` in den Playwright-Tests).

### 3. Migrationen laufen nie direkt gegen die Datenbank

Der Weg ist unten beschrieben. Kein `supabase db push` von Hand, kein direktes
SQL gegen die Produktivdatenbank.

---

## Gates — vor jedem Commit

```sh
npx tsc --noEmit -p tsconfig.app.json   # exakt 5 bekannte Fehler, nicht mehr
npm test -- --run                        # 327 Tests, alle grün
npm run build                            # muss durchlaufen
```

Die **5 Typfehler sind eine Altlast** in `ContactHistoryTimeline`,
`WeeklyAssignmentWidget` und `getNumberOfPages`. Sie sind bekannt und werden
toleriert. Kommt ein sechster dazu, ist er von dir — behebe ihn.

---

## Wie eine Datenbankänderung ausgerollt wird

Der Zugang zur Datenbank läuft **nur über GitHub**, nicht vom Rechner aus.
Ablauf:

1. Migration schreiben: `supabase/migrations/JJJJMMTTHHMMSS_beschreibung.sql`
2. Commit (noch **nicht** auf `main` pushen)
3. Über den CI-Zweig ausrollen:
   ```sh
   git branch -f supabase-deploy/run-N HEAD
   git push -f origin supabase-deploy/run-N
   gh run watch
   ```
   `N` ist die nächste freie Nummer. Die letzte findet man so (die Zweige
   selbst werden nach dem Lauf gelöscht):
   ```sh
   gh run list --workflow="Supabase Deploy" --limit 5 --json headBranch -q '.[].headBranch'
   ```
4. Im Protokoll prüfen: **jede** Migration muss `HTTP 201` melden
5. Erst dann `git push origin main` (das löst den Vercel-Deploy aus)
6. Zweig aufräumen: `git push origin --delete supabase-deploy/run-N`

Reihenfolge ist wichtig: Erst die Datenbank, dann der Code. Sonst läuft die
neue App gegen ein altes Schema.

---

## Eigenheiten, über die man stolpert

**Ein-Tabellen-Belegmodell.** Angebot, Auftragsbestätigung, Rechnung,
Anzahlungs-, Schlussrechnung, Lieferschein und Gutschrift liegen alle in
`invoices`, unterschieden über `typ` (siehe `src/lib/documentTypes.ts`).
Positionen in `invoice_items`. Eine Abfrage auf „alle Rechnungen" ohne
`typ`-Filter liefert also auch Angebote.

**Untypisierte Tabellen.** Nicht jede Tabelle ist in den generierten
Supabase-Typen enthalten. Muster im Projekt:
```ts
const tabelle = () => (supabase.from("regie_saetze" as never) as any);
```
Das ist Absicht, kein Schlampfehler.

**Typografische Anführungszeichen brechen den Parser.** Deutsche
Anführungszeichen („…") in TypeScript-Zeichenketten und Testtiteln haben hier
schon mehrfach den Build zerlegt. In Code: Guillemets »…« verwenden oder
umformulieren. In Kommentaren und Markdown sind sie in Ordnung.

**Commit-Nachrichten immer über eine Datei.** Typografische Anführungszeichen
brechen sonst die zsh-Zeile:
```sh
git commit -F /pfad/zur/nachricht.txt
```

**Sprache.** Neuer Code wird auf Deutsch benannt (`belegzeileAusKalk`,
`projektPflicht`, `ohneKopieVermerk`). Kommentare, Oberfläche und Commits
ebenfalls Deutsch. Älterer Code ist teilweise Englisch — das bleibt, wo es ist.

**Kommentare erklären das Warum.** Der Stil im Projekt ist, an schwierigen
Stellen den Grund und die Fundstelle zu notieren („Stolperfalle iPad: Seit
iPadOS 13 meldet sich Safari am iPad als Macintosh"). Halte dich daran.

---

## Wie Wünsche hereinkommen

In der App gibt es den Knopf **„Änderung melden"**. Was Christian dort
schreibt, landet in der Tabelle `aenderungswuensche` (mit Foto, falls
angehängt).

Ist ein Wunsch umgesetzt, wird er per Migration abgeschlossen:

```sql
UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Was war die Ursache, was wurde geändert, was heißt das für dich.'
WHERE id::text LIKE '247b5126%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Kurzer Titel', 'Was ist neu, in einem Satz für den Anwender.');
```

Die `antwort` liest Christian direkt in der App. Sie ist für einen
Nicht-Techniker geschrieben: erst was los war, dann was jetzt anders ist.
Keine Dateinamen, keine Funktionsnamen.

Der Eintrag in `neuerungen` erscheint im Banner **„Das ist neu"** — das sehen
nur Administratoren.

---

## Was wo liegt

| Ordner | Inhalt |
|---|---|
| `src/pages/` | Die 39 Seiten der App |
| `src/components/` | Bausteine, `components/ui/` ist shadcn (nicht ändern) |
| `src/lib/` | Fachlogik — hier liegt die Musik (Kalkulation, PDF, Beleglogik) |
| `src/integrations/supabase/` | Datenbankzugang und generierte Typen |
| `supabase/migrations/` | 297 Datenbankänderungen, chronologisch |
| `supabase/functions/` | 20 Serverfunktionen (Mail, KI, Nutzerverwaltung) |
| `tests/` | Playwright-Browsertests |
| `docs/` | Handbuch und Übergabe-Unterlagen |

Die wichtigsten Fachmodule:

- `kalkulationEngine.ts` — Kalkulation, Kapitel, Aufbauten
- `kalkZuBeleg.ts` — die **eine** Stelle, an der eine Kalkulationszeile zur
  Belegzeile wird. Neue Wege dorthin gibt es nicht; das war schon eine
  Fehlerquelle (Kennzeichen gingen verloren).
- `pdfGenerator.ts` — Belege als PDF
- `documentTypes.ts` — welcher Belegtyp was kann
- `kostenstellen.ts` — wann ein Projekt Pflicht ist und wann nicht

---

## Vor größeren Änderungen

Bei allem, was Kalkulation, Beleglogik oder Preise berührt: **erst sagen, was
man vorhat, dann machen.** Der Betrieb rechnet damit ab; eine Überraschung im
Angebot ist teurer als eine Rückfrage.
