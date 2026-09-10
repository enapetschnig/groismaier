# 5 — Zugänge und Kosten

> ## 🔒 In dieser Datei stehen absichtlich **keine** Passwörter.
> Sie ist eine Übersicht: was es gibt, wem es gehört, was es kostet. Die
> Zugangsdaten selbst liegen getrennt davon — frag deinen Betreuer, wo.
>
> **Das ist kein Misstrauen, sondern eine Sicherheitsregel.** Diese Datei
> liegt in einem Ordner, den man kopieren, mailen und verlieren kann.
> Zugangsdaten dürfen dort nicht drin sein.

---

## Was es gibt

*(Die grau hinterlegten Felder füllt dein Betreuer beim Übergabetermin aus.)*

| Dienst | Wofür | Konto lautet auf | Kosten/Monat | Kündbar |
|---|---|---|---|---|
| **Supabase** | Daten, Anmeldung, Dateien | | | monatlich |
| **Vercel** | App ausliefern | | | monatlich |
| **GitHub** | Archiv des Programms | | 0 € | jederzeit |
| **OpenAI** | KI-Funktionen | | nach Verbrauch | jederzeit |
| **Microsoft 365** | Mailversand aus der App | Holzbau Groismaier | hast du ohnehin | – |
| **Twilio** | SMS-Einladungen | | nach Verbrauch | jederzeit |
| **Resend** | Versand Regieberichte | | | jederzeit |
| **Domain `handwerkapp.at`** | Adresse der App | **Betreuer, nicht du** | | jährlich |

### Zur Orientierung, was das ungefähr kostet

Falls alles auf dich laufen würde (Stand 2026):

- Datenbank und Dateien: rund 25 $ im Monat
- Auslieferung: 0 bis 20 $ im Monat
- KI-Funktionen: stark schwankend, je nachdem wie viele Belege eingelesen
  werden — Größenordnung 10 bis 50 $
- SMS: ein paar Cent pro Einladung, praktisch vernachlässigbar
- Eigene Adresse: rund 15 € im Jahr

**Insgesamt also grob 50 bis 100 Euro im Monat.** Was du heute tatsächlich
zahlst, steht in deiner Vereinbarung mit dem Betreuer — das kann ganz anders
aussehen, weil dort auch Betreuung und Weiterentwicklung drinstecken.

---

## Zwei Dinge, die du wissen musst

### 1. Die Adresse gehört nicht dir

`groismaier.handwerkapp.at` — die Endung `handwerkapp.at` gehört deinem
Betreuer. Solltet ihr euch trennen, ist diese Adresse weg.

**Nicht dramatisch, aber vorher regeln.** Eine eigene Adresse wie
`app.cg-holzbau.at` ist in zwei Stunden eingerichtet und kostet fast nichts.
Wenn du `cg-holzbau.at` schon hast, sogar gar nichts. Siehe Anleitung 2.

### 2. Ein Schlüssel ist wirklich gefährlich

Bei den Zugangsdaten gibt es einen mit dem Namen **`SERVICE_ROLE_KEY`**.

Wer diesen Schlüssel hat, kommt an **alle** deine Daten — ohne Passwort, ohne
Anmeldung, ohne dass es jemand merkt. Er hebelt sämtliche Beschränkungen aus.

**Regeln dafür:**

- Niemals per Mail, WhatsApp oder WeTransfer verschicken
- Niemals in einen Ordner legen, den du mit jemandem teilst
- Niemand braucht ihn außer der Person, die die App betreut

Wird er versehentlich weitergegeben: sofort beim Betreuer melden. Man kann ihn
austauschen, das dauert Minuten.

Zwei andere Werte (`VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY`) sind dagegen
**völlig ungefährlich** — die stecken ohnehin in jeder App auf jedem Handy
deiner Mitarbeiter. Erschrick nicht, wenn du sie irgendwo im Klartext siehst.

---

## Wo Zugangsdaten hingehören

Drei brauchbare Wege, in dieser Reihenfolge:

1. **Passwort-Tresor** (Bitwarden, 1Password) — bequem, sicher, du kannst
   einzelne Zugänge gezielt freigeben. Deine App hat übrigens selbst einen
   Passwort-Bereich eingebaut.
2. **Ausgedruckt im Firmensafe** — altmodisch, aber unschlagbar zuverlässig.
   Kein Hacker kommt an deinen Safe.
3. **In der Buchhaltung beim Steuerberater** — falls du ohnehin dort einen
   verschlossenen Ordner hast.

**Nicht:** in einer Word-Datei am Desktop, in WhatsApp an dich selbst, auf
einem Zettel unter der Tastatur.

---

## Checkliste für den Übergabetermin

Zum Abhaken, wenn ihr gemeinsam durchgeht:

- [ ] Ich weiß, wo die Zugangsdaten liegen
- [ ] Ich habe einen eigenen GitHub-Zugang zu meinem Programm
- [ ] Ich habe einen eigenen Supabase-Zugang und sehe dort **nur meine Firma**
- [ ] Ich weiß, wo die aktuelle Datensicherung liegt und wie alt sie ist
- [ ] Ich weiß, wie oft automatisch gesichert wird
- [ ] Mir ist klar, dass Sicherungen nach 90 Tagen automatisch gelöscht werden
      und ich sie für ein Archiv selbst herunterladen muss
- [ ] Anleitung 4 (Notfall) ist ausgefüllt und ausgedruckt im Büro
- [ ] Ich habe die App einmal auf einem Ersatzgerät geöffnet
- [ ] Ich weiß, wem die Adresse `handwerkapp.at` gehört
- [ ] Wir haben besprochen, was passiert, wenn die Zusammenarbeit endet

---

## Der Punkt, der beim Termin oft untergeht

Frag ausdrücklich nach:

> **„Was passiert mit meinen Daten, wenn wir zwei uns nicht mehr verstehen?"**

Das ist keine unfreundliche Frage. Das ist dieselbe Frage, die du auch einem
Lieferanten stellst, bevor du auf ihn baust. Ein seriöser Betreuer hat darauf
eine klare Antwort — und genau deshalb hältst du gerade diesen Ordner in der
Hand.
