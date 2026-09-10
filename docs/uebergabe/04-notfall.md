# 4 — Notfall

> ## ⚠ Diese Seite ausdrucken und ins Büro hängen.
> Wenn du sie brauchst, geht die App vielleicht gerade nicht — und damit auch
> diese Datei nicht.

---

## Zuerst: Ruhe. Deine Daten sind fast nie das Problem.

In den allermeisten Fällen ist irgendein Dienst kurz gestört und ist nach
zehn Minuten wieder da. Deine Rechnungen liegen sicher; sie werden zusätzlich
laufend gesichert.

**Bevor du irgendwen anrufst — diese vier Dinge, dauert zwei Minuten:**

1. Seite neu laden (**Strg+F5**, am Mac **Cmd+Shift+R**)
2. Anderen Browser probieren (Chrome, Edge, Firefox)
3. Anderes Gerät probieren — Handy statt PC
4. Fragen, ob es bei einem Kollegen auch nicht geht

Geht es beim Kollegen und am Handy — dann liegt es an deinem Gerät, nicht an
der App.

---

## Wenn es doch die App ist

### Anzeige: „Nicht erreichbar" / weiße Seite

Die Auslieferung ist gestört. **Deine Daten sind unberührt.**
→ Status prüfen: **vercel-status.com**
→ Meist nach wenigen Minuten von selbst behoben.

### Anmelden geht nicht / „Fehler beim Laden"

Die Datenbank ist gestört.
→ Status prüfen: **status.supabase.com**
→ Steht dort eine Störung: warten, das behebt der Anbieter.
→ Steht dort **keine** Störung und es geht trotzdem nicht: anrufen (unten).

### Mailversand geht nicht

Betrifft nur den Versand **aus der App**. Dein normales Outlook läuft weiter.
→ Notfalls: Beleg als PDF herunterladen und ganz normal aus Outlook schicken.
→ Kein Grund für Panik, das ist ein Umweg, kein Ausfall.

### Belege einlesen / Diktat / Textglättung gehen nicht

Der KI-Dienst ist gestört oder das Guthaben ist aufgebraucht.
→ Alles andere in der App läuft normal weiter.
→ Beim Betreuer melden, dass das Guthaben nachgeladen werden muss.

### Eine Summe stimmt nicht

**Nichts von Hand in der Datenbank ändern lassen.**
→ Screenshot machen, Belegnummer notieren.
→ Über **„Änderung melden"** in der App schicken.
→ Falls die App nicht geht: anrufen.

---

## Das Wichtigste im echten Ernstfall

**Betreuer nicht mehr erreichbar? Dann geh mit diesem Ordner zu einem
beliebigen Programmierer.**

Sag ihm diesen Satz:

> *In diesem Ordner ist eine React-App mit Supabase-Backend, komplett mit
> Datensicherung. Im Handbuch unter `docs/HANDBUCH.md` steht in Abschnitt 8,
> wie man das von Null wieder aufsetzt.*

Das ist alles, was er wissen muss. Aufwand für ihn: **ein halber bis ein Tag.**

Wenn du niemanden kennst: Jedes IT-Systemhaus, jede Webagentur und jeder
Softwareentwickler in der Umgebung kann das. Die Begriffe für die Suche sind
**„React"** und **„Supabase"**.

---

## Was du auf keinen Fall tun solltest

| ✗ Nicht | Warum |
|---|---|
| Konten kündigen, „um Kosten zu sparen" | Bei Supabase hängen deine Daten dran. Gekündigt = weg. |
| Zugangsdaten weitergeben, weil jemand anruft | Kein seriöser Anbieter fragt danach. Nie. |
| Rechnungen von Hand in der Datenbank korrigieren | Erzeugt Belege, die anders aussehen als die beim Kunden. |
| In Panik mehrere Sachen gleichzeitig probieren | Danach weiß niemand mehr, was ursprünglich los war. |

---

## Deine Notfallnummern

*(Vor dem Ausdrucken ausfüllen)*

| Wofür | Wer | Telefon |
|---|---|---|
| Betreuer der App | | |
| Ersatz-Programmierer | | |
| Steuerberater (bei Belegfragen) | | |

**Wo die Zugangsdaten liegen:**

```
_______________________________________________

_______________________________________________
```

**Wo die aktuelle Datensicherung liegt:**

```
_______________________________________________
```

**Wo das Sicherungs-Passwort liegt** (ohne das ist die Sicherung wertlos):

```
_______________________________________________
```

---

## Status-Seiten der Anbieter

| Dienst | Adresse | Betrifft |
|---|---|---|
| Supabase | status.supabase.com | Anmeldung, alle Daten |
| Vercel | vercel-status.com | Erreichbarkeit der App |
| OpenAI | status.openai.com | Belege lesen, Diktat |
| Microsoft 365 | status.office.com | Mailversand aus der App |

---

## Merksatz

> **Die App kann ausfallen. Deine Daten gehen davon nicht verloren.**
>
> Selbst wenn morgen alles gleichzeitig kaputt wäre, könntest du mit diesem
> Ordner und einem Programmierer innerhalb eines Tages wieder arbeiten.
