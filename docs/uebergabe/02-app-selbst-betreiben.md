# 2 — Die App selbst betreiben

*Diese Anleitung ist zweigeteilt. Der erste Teil ist für dich: Was bedeutet
das überhaupt, was kostet es, wie lange dauert es. Der zweite Teil ist für den
Programmierer, der es macht — den kannst du überspringen, aber gib ihn weiter.*

---

# Teil A — Für dich

## Ehrlich vorweg

**Das ist nichts, was du selbst an einem Nachmittag machst.** Auch nicht mit
einer KI. Es ist etwa so, wie einen Dachstuhl selbst aufzustellen: Man *kann*
es lernen, aber beim ersten Mal will man jemanden dabeihaben, der es schon
gemacht hat.

Was du dafür brauchst: **einen halben bis einen Tag von jemandem, der sich
auskennt.** Also 500 bis 1.000 Euro, wenn du es zukaufst. Alle Unterlagen
dafür liegen fertig in diesem Ordner — der Programmierer muss nichts erraten.

## Es gibt drei Stufen — du musst nicht die größte wählen

### Stufe 1: Nur mitschauen können — *empfohlen*

Alles bleibt wie es ist. Du bekommst zusätzlich **eigene Zugänge**, damit du
jederzeit selbst hineinschauen kannst und im Notfall nicht warten musst.

- **Aufwand:** eine halbe Stunde, einmalig
- **Kosten:** keine
- **Bringt dir:** Du bist nicht mehr blockiert, wenn dein Betreuer nicht
  erreichbar ist

*Wichtig dabei:* Dein Betreuer betreut mehrere Betriebe über dasselbe Konto.
Damit du wirklich nur deine eigene Firma siehst, muss dein Projekt vorher in
einen eigenen Bereich verschoben werden. Das ist eine eingebaute Funktion,
dauert Minuten. Sprich ihn darauf an — der technische Ablauf steht in Teil B.

### Stufe 2: Eigene Adresse

Statt `groismaier.handwerkapp.at` heißt die App dann zum Beispiel
`app.cg-holzbau.at`. Deine eigene Firmenadresse, unabhängig vom Betreuer.

- **Aufwand:** ein bis zwei Stunden
- **Kosten:** rund 15 Euro im Jahr, wenn du `cg-holzbau.at` schon hast: nichts
- **Bringt dir:** Wirkt professioneller und ist unabhängig

### Stufe 3: Alles auf deinen Namen

Sämtliche Konten laufen auf dich: Supabase, Vercel, OpenAI, Microsoft, Twilio.
Du zahlst selbst, du entscheidest selbst.

- **Aufwand:** ein bis zwei Tage von einem Fachmann
- **Kosten:** einmalig 500–1.000 Euro Umstellung, danach rund 60–90 Euro im
  Monat laufend (Details: Anleitung 5)
- **Risiko:** Während der Umstellung stehen Mailversand und die KI-Funktionen
  kurz still. Muss auf ein ruhiges Wochenende gelegt werden.
- **Bringt dir:** Vollständige Unabhängigkeit
- **Sinnvoll, wenn:** die Zusammenarbeit endet oder du sie beenden willst

## Meine Empfehlung

**Stufe 1 sofort, Stufe 2 wenn du Zeit hast, Stufe 3 nur im Ernstfall.**

Stufe 3 löst ein Problem, das du heute nicht hast — und schafft dir dafür
Arbeit, die du heute nicht willst. Solange die Zusammenarbeit läuft, bringt sie
dir nichts außer Aufwand. Wichtig ist nur, dass du sie *jederzeit machen
könntest*. Genau dafür ist dieser Ordner da.

---

# Teil B — Für den Programmierer

*Ab hier technisch. Die vollständige Fassung steht in
`02_Programm/docs/HANDBUCH.md`, Abschnitt 8.*

## Voraussetzungen

Node.js 20+, ein Supabase-Konto, ein Vercel-Konto (oder ein beliebiger
Webserver für statische Dateien), die Supabase-CLI.

## Ablauf

**1. Supabase-Projekt anlegen** — Region `eu-central-1` (Frankfurt, DSGVO).

**2. Datenbank einspielen.** Zwei Wege:

```sh
# aus der mitgelieferten Sicherung
psql "$DATENBANK_URL" -f 03_Daten-Sicherung/datenbank_JJJJ-MM-TT.sql

# oder von Grund auf über die 294 Migrationen
supabase link --project-ref <kennung> && supabase db push
```

Der Dump ist der schnellere Weg und bringt die Daten mit. Die Migrationen sind
der saubere Weg für eine leere Spielwiese.

**3. Dateien einspielen.** 19 Ablagen, rund 950 MB — den Löwenanteil machen
`invoice-pdfs` (450 MB), `project-photos` (226 MB) und `disturbance-photos`
(196 MB) aus. Inhalt liegt in `03_Daten-Sicherung/dateien/`:

```sh
SUPABASE_URL="https://<kennung>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
node skripte/dateien-zurueckspielen.mjs 03_Daten-Sicherung/dateien --probe
```

Erst mit `--probe` (Trockenlauf), dann ohne. Das Skript legt fehlende Ablagen
an und übernimmt dabei aus `_ablagen.json`, welche öffentlich sein darf —
wichtig, denn `employee-documents` und `invoice-pdfs` dürfen es nicht sein.
Vorhandene Dateien werden nie überschrieben.

**4. Serverfunktionen ausrollen:**

```sh
supabase functions deploy --project-ref <kennung>
```

Danach im Dashboard unter *Edge Functions → Secrets* setzen:
`OPENAI_API_KEY`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `APP_URL`.
`SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` setzt
Supabase selbst.

`COCKPIT_SECRET` gehört zur Infrastruktur des bisherigen Betreuers und entfällt
bei einer vollständigen Übernahme — die Funktion `wunsch-datei` läuft dann ins
Leere, die Änderungswünsche bleiben in der Tabelle lesbar.

**5. Frontend bauen und ausliefern:**

```sh
npm install
cp .env.beispiel .env      # URL und publishable key des neuen Projekts eintragen
npm run build              # Ergebnis liegt in dist/
```

`dist/` auf Vercel legen (oder Netlify, Cloudflare Pages, eigener nginx).
Wichtig ist nur die SPA-Umleitung — alle Pfade auf `index.html`, siehe
`vercel.json`.

**6. Anmeldung prüfen.** Auth-Nutzer stecken im `auth`-Schema und kommen mit
dem Dump. Passwörter bleiben gültig. Wurde ohne `auth`-Schema gesichert, müssen
die Nutzer über den Admin-Bereich neu angelegt werden.

## Reihenfolge beim laufenden Betrieb

Bei jeder späteren Änderung: **erst Datenbank, dann Code.** Der Ablauf über
GitHub Actions steht im Handbuch, Abschnitt 7.

## Projekt in eine eigene Organisation verschieben

Für Stufe 1 (der Kunde soll nur sein eigenes Projekt sehen):

Supabase vergibt Rechte pro **Organisation**, nicht pro Projekt —
projektbezogene Rollen gibt es erst im Team-Plan (599 $/Monat). Der bezahlbare
Weg ist deshalb: eine eigene Organisation anlegen und das Projekt dorthin
transferieren (*Project Settings → General → Transfer project*). Voraussetzung:
Owner-Rechte in der Quell-Organisation, Zielorganisation in derselben Region.
Kurze Unterbrechung von ein bis zwei Minuten möglich.

Bei Vercel geht dasselbe **nicht** ohne Enterprise-Plan; dort sieht jedes
Teammitglied alle Projekte. Alternative wäre ein eigenes Vercel-Team.

Bei GitHub ist es unkritisch: Zugriff wird ohnehin pro Repository vergeben.

## Aufwandsschätzung

Neuaufbau aus der Sicherung: **ein halber bis ein Tag** für jemanden mit
Supabase-Erfahrung. Die meiste Zeit gehen für die Secrets und die
Microsoft-Graph-Anbindung drauf, nicht für die Datenbank.
