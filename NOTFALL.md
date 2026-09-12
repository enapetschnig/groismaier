# Die App wieder online bringen

**Für den Techniker, der das übernimmt. Vorkenntnisse über dieses Projekt sind
nicht nötig.**

Wenn du das hier liest, ist der bisherige Betreuer vermutlich nicht mehr
erreichbar. Die gute Nachricht: Du brauchst weder seine Zugangsdaten noch
seine Konten. Zwei Dinge reichen, und beide liegen dir vor:

1. **Diesen Ordner** — der komplette Quellcode
2. **Einen Datenbank-Abzug** — `01_firmendaten_JJJJ-MM-TT.sql`, rund 10 MB

Alles andere legst du auf deine eigenen Konten neu an.

**Realistischer Aufwand: ein halber Tag.**

---

## Worum es geht

Interne App der Holzbau Groismaier GmbH (Zimmerei, 3753 Dallein, ~15 Nutzer).
Angebote, Rechnungen, Kalkulation, Kunden, Projekte, Zeiterfassung,
Regieberichte, Fuhrpark.

React 18 + TypeScript + Vite, Tailwind + shadcn/ui, Supabase als Backend
(Postgres 17, Auth, Storage, Edge Functions). Rund 99.000 Zeilen, 39 Seiten,
85 Tabellen, 327 Unit-Tests.

**Der Betrieb verrechnet damit sein Geld.** Bestehende Rechnungen und
Zahlungen werden nicht nachträglich verändert — Details in `CLAUDE.md`.

---

## Schritt für Schritt

### 1. Supabase-Projekt anlegen

Auf [supabase.com](https://supabase.com) ein Konto anlegen, neues Projekt,
**Region `eu-central-1` (Frankfurt)** — DSGVO. Der Free-Plan genügt zum
Ausprobieren; für den Dauerbetrieb Pro (25 $/Monat), sonst pausiert das
Projekt bei Inaktivität und es gibt keine täglichen Backups.

Das Datenbank-Passwort beim Anlegen **notieren**, es wird nie wieder angezeigt.

### 2. Datenbank einspielen

```sh
# Verbindungszeichenfolge: Dashboard → Project Settings → Database
#                          → Connection string → Session pooler (Port 5432)
psql "postgresql://postgres.<kennung>:<passwort>@<host>:5432/postgres" \
  -f 01_firmendaten_JJJJ-MM-TT.sql
```

Falls dabei ein Abzug der Benutzer (`02_benutzer_*.sql`) vorliegt: ebenfalls
einspielen — dann bleiben die Anmeldungen der Mitarbeiter gültig. Ohne ihn
legst du die Nutzer später im Admin-Bereich der App neu an.

Danach kurz gegenprüfen:

```sql
select count(*) from invoices;      -- sollte im vierstelligen Bereich liegen
select count(*) from customers;     -- ein paar hundert
```

### 3. Serverfunktionen ausrollen

```sh
npm install -g supabase
supabase login
supabase link --project-ref <kennung>
supabase functions deploy
```

20 Funktionen. Welche wofür da ist, steht in `docs/HANDBUCH.md`, Abschnitt 6.

### 4. Frontend bauen und ausliefern

```sh
npm install
cp .env.beispiel .env
# URL und publishable key des neuen Projekts eintragen
#   (Dashboard → Project Settings → API)
npm run build
```

Das Ergebnis liegt in `dist/`. Auf Vercel, Netlify, Cloudflare Pages oder
einen eigenen Webserver legen. **Wichtig ist nur die SPA-Umleitung** — alle
Pfade auf `index.html`, siehe `vercel.json`. Ohne sie funktioniert jeder
direkte Link ins Leere.

### 5. Anmelden und prüfen

App öffnen, mit einem Nutzer aus dem Betrieb anmelden. Prüfen: Kundenliste,
Rechnungsliste, eine Rechnung öffnen, PDF erzeugen.

Läuft das, ist die App wieder da.

---

## Was zunächst fehlt — und was davon wichtig ist

Diese Dinge hängen an fremden Diensten, für die es eigene Konten braucht. Die
App läuft ohne sie, einzelne Funktionen aber nicht:

| Fehlt | Auswirkung | Nachrüsten |
|---|---|---|
| **Hinterlegte Dateien** (~950 MB Fotos, Beleg-PDFs) | Alte Beleg-PDFs und Baustellenfotos fehlen. Neue PDFs erzeugt die App selbst. | Liegt eine Dateisicherung vor: `node skripte/dateien-zurueckspielen.mjs <ordner> --probe` |
| **OpenAI-Schlüssel** | Belege einlesen, Diktat, Textglättung gehen nicht | Schlüssel besorgen, in Supabase unter *Edge Functions → Secrets* als `OPENAI_API_KEY` |
| **Microsoft-Graph** | Kein Mailversand aus der App | App-Registrierung im Microsoft-365-Tenant des Betriebs, dann `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` |
| **Twilio** | Keine SMS-Einladungen | `TWILIO_*`-Secrets; Einladung geht ersatzweise per Mail |

**Priorität:** Die Dateien zuerst, danach OpenAI, dann Microsoft. SMS ist
verzichtbar.

`COCKPIT_SECRET` und die Funktion `wunsch-datei` gehörten zur Infrastruktur des
früheren Betreuers und können entfallen.

---

## Bevor du etwas änderst

- **Prüfungen laufen lassen:** `npm test -- --run` → 327 Tests müssen grün
  sein. `npx tsc --noEmit -p tsconfig.app.json` → **5 bekannte Typfehler**
  sind Altlast und in Ordnung; ein sechster wäre neu.
- **`CLAUDE.md` lesen.** Dort stehen die Eigenheiten, die einen sonst
  kostenpflichtig überraschen — das Ein-Tabellen-Belegmodell (Angebote und
  Rechnungen liegen gemeinsam in `invoices`, unterschieden über `typ`), der
  Ablauf für Migrationen und die Regel, dass bestehende Belege nie
  nachträglich verändert werden.
- **`docs/HANDBUCH.md`** hat die vollständige Architektur.

---

## Wenn etwas nicht klappt

| Problem | Ursache |
|---|---|
| `psql` erreicht den Server nicht | Die direkte Verbindung (`db.<kennung>.supabase.co`) ist **nur IPv6**. Session-Pooler auf Port 5432 verwenden. |
| Weiße Seite nach dem Ausliefern | SPA-Umleitung fehlt — alle Pfade müssen auf `index.html` zeigen. |
| Anmeldung schlägt fehl | `auth`-Schema nicht eingespielt. Nutzer im Admin-Bereich neu anlegen. |
| Beim Bauen: „supabase env missing" | `.env` fehlt oder ist leer. |

---

## Für den Betrieb

Die Anleitungen ohne Fachbegriffe liegen in [`docs/uebergabe/`](docs/uebergabe/)
— was die App ist, wie man sie mit einer KI ändert, was sie kostet, und ein
Notfallblatt zum Ausdrucken.
