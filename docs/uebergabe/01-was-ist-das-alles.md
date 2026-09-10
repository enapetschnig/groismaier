# 1 — Was ist das alles?

*Lesezeit: 10 Minuten. Danach weißt du, woraus deine App besteht und was
passiert, wenn ein Teil davon ausfällt.*

---

## Deine App besteht aus drei Teilen

Der häufigste Irrtum: *„Die App ist ein Programm, das irgendwo liegt."*
Stimmt nicht. Es sind drei Dinge, und sie liegen an drei verschiedenen Orten.

Vergleich aus deiner Welt — ein Haus:

```
   1  DER BAUPLAN            2  DIE EINRICHTUNG        3  DAS GRUNDSTÜCK
      der Code                  deine Daten               Anschlüsse, Adresse

   Wie die App aussieht       1.480 Rechnungen          Damit man überhaupt
   und funktioniert           321 Kunden                hinkommt: Strom,
                              alle Stunden              Wasser, Hausnummer
   Ordner 02_Programm         alle Fotos & PDFs
   rund 22 MB                                           Vercel, Domain, GitHub
                              beim Anbieter Supabase
```

**Ein Bauplan ohne Einrichtung ist ein leeres Haus.** Wenn du nur den Ordner
`02_Programm` hättest und sonst nichts, würde die App zwar starten — aber es
wäre kein einziger Kunde drin und keine einzige Rechnung.

Deshalb liegt im Ordner `03_Daten-Sicherung` eine Kopie deiner Einrichtung.

---

## Teil 1 — Der Bauplan (das Programm)

Etwa 99.000 Zeilen Text. Kein Mensch schreibt das an einem Stück; das ist
gewachsen wie ein Haus, das immer wieder umgebaut wurde.

Was drin steckt: 39 verschiedene Seiten (Rechnungen, Kunden, Plantafel,
Zeiterfassung, Kalkulation …), rund 100 Datentabellen, 20 Serverfunktionen und
knapp 300 automatische Tests.

**Die Tests sind wichtig für dich:** Das sind Prüfungen, die bei jeder Änderung
automatisch durchlaufen. Sie rechnen zum Beispiel nach, ob eine Rechnungssumme
noch stimmt. Wenn jemand etwas kaputt macht, schlagen sie an, *bevor* es bei
dir landet. So wie eine Wasserwaage: Sie baut nichts, aber sie sagt dir, wenn
etwas schief ist.

---

## Teil 2 — Deine Daten (der wertvolle Teil)

Bei einer Firma namens **Supabase** liegen:

- alle Kunden und Ansprechpartner
- alle Angebote, Auftragsbestätigungen und Rechnungen
- alle erfassten Stunden, Urlaube und Krankenstände
- alle Projekte, Bautagesberichte, Regieberichte
- alle Fotos und PDF-Dateien
- alle Anmeldedaten deiner Mitarbeiter

**Das ist das, was wirklich weh tut, wenn es weg ist.** Der Bauplan lässt sich
notfalls neu schreiben. Deine Rechnungshistorie nicht.

Der Server steht in Frankfurt, also innerhalb der EU — wichtig für den
Datenschutz.

---

## Teil 3 — Der Betrieb (damit man hinkommt)

Drei Dinge sorgen dafür, dass die App überhaupt erreichbar ist:

**Vercel** liefert die App aus. Wenn jemand `groismaier.handwerkapp.at`
eintippt, antwortet Vercel. Hier gibt es für dich nichts zu bedienen — das
läuft von allein.

**Die Adresse** `groismaier.handwerkapp.at`. Merke dir: Die Endung
`handwerkapp.at` gehört **deinem Betreuer**, nicht dir. Wenn du völlig
unabhängig sein willst, brauchst du eine eigene Adresse — zum Beispiel
`app.cg-holzbau.at`. Das ist ein Nachmittag Arbeit und kostet fast nichts.

**GitHub** ist das Archiv des Bauplans. Dort liegt nicht nur die aktuelle
Fassung, sondern jede einzelne Änderung der letzten Monate — 263 Stück, mit
Datum und Begründung. Man kann zu jedem Zeitpunkt zurückspringen. Wie ein
Bautagebuch, aus dem man das Haus in jedem Bauzustand wiederherstellen kann.

---

## Was sonst noch dranhängt

Fünf fremde Firmen liefern Teilleistungen. Das ist normal, aber du solltest
wissen, welche:

| Wer | Wofür | Fällt aus → |
|---|---|---|
| **Supabase** | Daten, Anmeldung, Dateien | **Alles steht.** Der wichtigste Anbieter. |
| **Vercel** | App ausliefern | App nicht erreichbar, Daten bleiben unberührt |
| **OpenAI** | alle KI-Funktionen | Belege einlesen, Diktat, Textglättung gehen nicht — der Rest läuft |
| **Microsoft 365** | Mailversand aus der App über `cg-holzbau.at` | Keine Mails aus der App. Dein normales Outlook ist nicht betroffen. |
| **Twilio** | SMS-Einladungen an neue Mitarbeiter | Einladung geht dann per Mail |

Kosten und Verträge: Anleitung 5.

---

## Wie eine Änderung zu dir kommt

Wenn du in der App auf **„Änderung melden"** drückst, passiert Folgendes:

```
  Du schreibst deinen Wunsch  (mit Foto, wenn du willst)
              ↓
  Er landet in einer Liste
              ↓
  Er wird umgesetzt und geprüft  (die knapp 300 Tests müssen grün sein)
              ↓
  Er wird zuerst in die Datenbank eingespielt, dann in die App
              ↓
  Du bekommst eine Antwort direkt in der App — was war los,
  was ist jetzt anders
              ↓
  Ist es etwas, das alle wissen sollten: Banner „Das ist neu"
```

Die Reihenfolge im vierten Schritt ist kein Zufall: **Immer erst die Daten,
dann das Programm.** Andersherum würde die neue App auf eine alte Datenstruktur
treffen — wie ein Dachstuhl, der auf Mauern gesetzt wird, die noch nicht
umgebaut sind.

---

## Und jetzt?

- Willst du **unabhängig werden**? → Anleitung 2
- Willst du **selbst etwas ändern**? → Anleitung 3
- Geht gerade **etwas nicht**? → Anleitung 4
- Willst du wissen, **was das kostet**? → Anleitung 5
