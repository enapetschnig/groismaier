# 3 — Etwas ändern mit einer KI

*Das ist die Anleitung, die dir im Alltag am meisten bringt. Nimm dir eine
Stunde Zeit und probier es einmal aus — danach weißt du, ob es etwas für dich
ist.*

---

## Was hier eigentlich passiert

Es gibt Programme, die den kompletten Code deiner App lesen können und
verstehen, wie er zusammenhängt. Du schreibst in **ganz normalem Deutsch**, was
anders sein soll. Das Programm sucht die richtige Stelle, ändert sie und
erklärt dir, was es gemacht hat.

Das ist keine Zukunftsmusik, sondern genau das Werkzeug, mit dem diese App
gebaut wurde.

**Was gut funktioniert:**

- „Die Spalte *Menge* in der Rechnungsliste ist zu schmal."
- „Beim Anlegen eines Kunden soll die UID gleich mitgeprüft werden."
- „Auf dem Angebot soll die Zahlungsfrist fett gedruckt sein."
- „Ich will bei den Projekten nach Bauleiter filtern können."
- „Warum steht bei dieser Rechnung eine andere Summe als im PDF?"

**Was schwieriger ist:**

- Ganze neue Bereiche („bau mir eine Lohnverrechnung")
- Alles, was die Kalkulation oder Rechnungssummen betrifft
- Alles, wo dir selbst nicht klar ist, wie es aussehen soll

Die Faustregel: **Was du in einem Satz erklären kannst, klappt meistens.**

---

## Vorbereitung — einmalig, etwa 30 Minuten

### Schritt 1: Das Programm installieren

Geh auf **claude.com/download** und lade dir **Claude Code für Mac oder
Windows** herunter. Das ist ein normales Programm mit Fenster — kein
schwarzes Terminal-Fenster, in das man Befehle tippt.

Du brauchst ein Konto. Kostet rund 20 Euro im Monat (Stand 2026). Jederzeit
kündbar.

### Schritt 2: Den Ordner öffnen

Im Programm auf **Ordner öffnen** klicken und den Ordner `02_Programm` aus
diesem Übergabe-Paket auswählen.

Kopier ihn dir vorher irgendwohin, wo du ihn wiederfindest — zum Beispiel nach
`Dokumente/Groismaier-App`.

### Schritt 3: Prüfen, ob es funktioniert

Schreib als Erstes:

> Lies die Datei CLAUDE.md und fass mir in fünf Sätzen zusammen, worum es in
> diesem Projekt geht.

Wenn die Antwort von deiner Zimmerei, von Angeboten und Rechnungen handelt,
sitzt du richtig.

**In dieser Datei `CLAUDE.md` stehen alle Eigenheiten deiner App** — auch die
Warnungen, was nie angefasst werden darf. Jede KI liest sie automatisch.
Deshalb ist sie so wichtig.

---

## Bevor du an der echten App arbeitest: die Spielwiese

**Das ist der wichtigste Absatz dieser Anleitung.**

Übe nicht an der laufenden App. Da hängen über tausend Rechnungen drin.

Lass dir eine **Spielwiese** einrichten: eine zweite, identische App mit
Beispieldaten. Dort kannst du alles ausprobieren, kaputt machen, wieder
herstellen. Es kostet nichts (kleine Projekte sind bei Supabase gratis) und ist
in einer Stunde eingerichtet.

Sag deinem Betreuer einfach: *„Ich hätte gern eine Spielwiese zum Ausprobieren."*
Wie es geht, steht in Anleitung 2, Teil B.

**Ohne Spielwiese gilt:** Frag die KI so viel du willst, aber lass sie an der
echten App nichts verändern.

---

## Wie du einen Wunsch gut formulierst

Der Unterschied zwischen einer brauchbaren und einer unbrauchbaren Antwort
liegt fast immer an der Frage.

| Statt so | Lieber so |
|---|---|
| „Die Rechnung ist komisch." | „Bei Rechnung 2026-043 steht unten 4.200 € Endsumme, die Positionen ergeben aber 4.380 €. Wo kommt der Unterschied her?" |
| „Mach die Schrift größer." | „In der Rechnungsliste ist die Kundennummer zu klein zum Lesen. Kannst du die auf die gleiche Größe wie den Kundennamen bringen?" |
| „Baue Serienbriefe ein." | „Ich will an alle Kunden mit offenen Rechnungen eine Mahnung schicken können, mit einem Klick, mit dem Text aus den Dokumenttexten." |

**Drei Dinge helfen immer:**

1. **Wo?** Auf welcher Seite, bei welchem Beleg, welcher Nummer.
2. **Was siehst du, was hättest du erwartet?** Genau wie beim Reklamieren
   eines Bauteils.
3. **Ein Bild.** Du kannst Screenshots direkt hineinziehen. Ein Bild spart
   zehn Sätze.

---

## Sätze, die dir dabei helfen

**Bevor etwas geändert wird:**

> Erklär mir zuerst, was du machen willst, und warte auf mein Okay.

**Wenn du unsicher bist, ob etwas gefährlich ist:**

> Kann diese Änderung bestehende Rechnungen oder Angebote verändern?

**Wenn du nur verstehen willst, ohne etwas zu ändern:**

> Ändere bitte nichts, erklär mir nur, wie das funktioniert.

**Nach einer Änderung — der wichtigste Satz überhaupt:**

> Lauf bitte die Tests durch: `npm test -- --run`

Es müssen **299 Tests grün** sein (oder mehr, wenn welche dazugekommen sind).
Ist auch nur einer rot, ist etwas kaputt — dann nicht weitermachen, sondern:

> Ein Test ist rot. Was ist da passiert, und kannst du es beheben?

---

## Was du niemals tun solltest

**1. Änderungen an der echten App ohne Test.**
Erst Spielwiese, dann echt. Immer.

**2. Bestehende Rechnungen „korrigieren" lassen.**
Auch wenn eine Summe komisch aussieht. Deine Rechnungen sind gedruckt,
verschickt und verbucht. Wird nachträglich etwas geändert, hast du zwei
verschiedene Fassungen derselben Rechnung — deine und die vom Kunden. Das ist
ein Problem mit dem Finanzamt, kein Schönheitsfehler.

Fehler werden so behoben, dass **neue** Belege richtig entstehen. Alte bleiben
wie sie sind.

**3. Der KI blind vertrauen, wenn es um Geld geht.**
Bei Farben, Spaltenbreiten und Texten kannst du entspannt sein. Bei allem, was
rechnet — Summen, Steuersätze, Stundensätze, Kalkulation — schau selbst nach,
ob das Ergebnis stimmt. Rechne eine Beispielrechnung von Hand nach.

**4. Mehrere Dinge auf einmal.**
Eine Änderung, prüfen, dann die nächste. Wenn du fünf Sachen gleichzeitig
änderst und danach etwas nicht geht, weißt du nicht welche es war.

---

## Wenn du etwas kaputt gemacht hast

**Keine Panik. Es ist nichts endgültig verloren.**

Jede einzelne Änderung an dieser App ist gespeichert — mit Datum und
Begründung, seit dem ersten Tag. Man kann jederzeit auf jeden früheren Stand
zurück.

Sag einfach:

> Ich glaube ich habe etwas kaputt gemacht. Kannst du meine Änderungen
> rückgängig machen und alles auf den letzten funktionierenden Stand
> zurücksetzen?

Wenn das nicht hilft: Anleitung 4 (Notfall).

---

## Wie eine Änderung zu deinen Mitarbeitern kommt

Wenn du auf deinem Rechner etwas änderst, ändert sich für die anderen noch
nichts. Damit es bei allen ankommt, muss es **ausgerollt** werden.

Bei Datenbankänderungen gibt es dabei eine Reihenfolge, die eingehalten werden
muss: **erst die Daten, dann das Programm.** Andersherum trifft die neue App
auf eine alte Datenstruktur — wie ein Dachstuhl auf Mauern, die noch nicht
umgebaut sind.

Sag der KI:

> Wie rolle ich das aus? Zeig mir die Schritte einzeln und sag mir bei jedem,
> ob er geklappt hat.

Der genaue Ablauf steht in `CLAUDE.md`. Beim ersten Mal solltest du jemanden
danebensitzen haben.

---

## Realistische Erwartung

**Was du nach ein paar Wochen selbst kannst:** Texte ändern, Spalten
umsortieren, Farben und Schriftgrößen anpassen, neue Auswahlfelder,
Kleinigkeiten in Listen, Fragen zu deinen eigenen Daten stellen.

**Wofür du weiter jemanden brauchst:** Neue Bereiche, alles rund um Kalkulation
und Rechnungssummen, den Mailversand, Umbauten an der Datenbank.

Das ist wie bei allem anderen auch: Ein Regal hängst du selbst auf. Den
Dachstuhl macht der Zimmerer.

---

## Und wenn du gar nicht selbst ändern willst?

Völlig in Ordnung. Dann nutz weiter den Knopf **„Änderung melden"** in der App.
Das ist ohnehin der bequemere Weg — du beschreibst, was du brauchst, und
bekommst die Antwort direkt in der App.

Der Unterschied ist nur: Mit dieser Anleitung *könntest* du auch ohne. Und
genau darum geht es.
