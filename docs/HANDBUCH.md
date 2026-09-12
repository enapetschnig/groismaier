# Technisches Handbuch — Holzbau Groismaier App

Für Entwickler. Wer die App übernimmt, findet hier alles, um sie zu verstehen,
lokal zu starten, zu betreiben und im Notfall neu aufzubauen.

Nicht-technische Anleitungen liegen in [`docs/uebergabe/`](uebergabe/).
Hinweise für eine KI, die im Code arbeitet, in [`../CLAUDE.md`](../CLAUDE.md).

Stand: September 2026

---

## 1. Überblick

Eine Web-App (PWA) für den kompletten Bürobetrieb einer Zimmerei: Angebote,
Rechnungen, Kalkulation, Kunden, Projekte, Plantafel, Zeiterfassung,
Regieberichte, Eingangsrechnungen, Fuhrpark, Finanzplanung.

Läuft im Browser, auf dem Handy als installierbare App. Rund 15 Nutzer.

**Kennzahlen:** ~99.000 Zeilen TypeScript · 39 Seiten · ~100 Tabellen ·
297 Migrationen · 20 Serverfunktionen · 299 Unit-Tests + Playwright-Tests

---

## 2. Die drei Teile

Wichtigste Erkenntnis für jede Übernahme: **Der Code-Ordner allein ist nicht
die App.** Es braucht drei Dinge, und nur eines davon liegt im Ordner.

```
┌─────────────────┐   ┌──────────────────────┐   ┌─────────────────┐
│  1  PROGRAMM    │   │  2  DATEN            │   │  3  BETRIEB     │
│                 │   │                      │   │                 │
│  dieser Ordner  │──▶│  Supabase-Projekt    │◀──│  Vercel         │
│  React/Vite     │   │  Postgres + Storage  │   │  Domain         │
│                 │   │  + 20 Funktionen     │   │  GitHub         │
│  ~22 MB         │   │  DAS IST DER SCHATZ  │   │                 │
└─────────────────┘   └──────────────────────┘   └─────────────────┘
```

Ohne Teil 2 startet die App, ist aber leer. Ohne Teil 3 ist sie nicht
erreichbar.

---

## 3. Technik

| Baustein | Was |
|---|---|
| Oberfläche | React 18 + TypeScript, Vite als Werkzeug |
| Gestaltung | Tailwind CSS + shadcn/ui (Radix) |
| Datenbank | Supabase — Postgres 17, Row Level Security |
| Anmeldung | Supabase Auth (E-Mail + Passwort) |
| Dateien | Supabase Storage, 11 Ablagen |
| Serverlogik | Supabase Edge Functions (Deno) |
| PDF | jsPDF + jspdf-autotable, im Browser erzeugt |
| Tests | Vitest (Unit) + Playwright (Browser) |
| Auslieferung | Vercel, automatisch bei Push auf `main` |

---

## 4. Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```sh
npm install
cp .env.beispiel .env     # und die zwei Werte eintragen
npm run dev               # läuft dann auf http://localhost:5173
```

Die `.env` braucht genau zwei Zeilen:

```
VITE_SUPABASE_URL="https://<projekt-kennung>.supabase.co"
VITE_SUPABASE_KEY="<publishable key>"
```

Beide Werte stehen in Supabase unter *Project Settings → API*. Sie sind **nicht
geheim** — sie stecken in jedem ausgelieferten Browser-Bundle. Der Schutz der
Daten kommt aus Row Level Security, nicht aus der Geheimhaltung dieser Werte.

Weitere Befehle:

```sh
npm run build      # Produktionsbau nach dist/
npm test -- --run  # 299 Unit-Tests
npm run lint
npx playwright test tests/full-app.spec.ts
```

---

## 5. Die Datenbank

### Belegmodell

Alle Belegarten liegen in **einer** Tabelle `invoices`, unterschieden über
`typ`: `angebot`, `auftragsbestaetigung`, `rechnung`, `anzahlungsrechnung`,
`schlussrechnung`, `lieferschein`, `gutschrift`. Positionen in
`invoice_items`, Zahlungen in `invoice_payments`.

Was welcher Typ kann (Fälligkeit, Bankdaten, Preise sichtbar), steht zentral in
`src/lib/documentTypes.ts`.

> **Falle:** Eine Abfrage auf `invoices` ohne `typ`-Filter liefert Angebote und
> Rechnungen gemischt.

### Wichtige Tabellengruppen

| Bereich | Tabellen |
|---|---|
| Belege | `invoices`, `invoice_items`, `invoice_payments`, `invoice_templates`, `number_ranges` |
| Kunden | `customers`, `customer_contacts`, `contact_history`, `kunden_mail_adressen` |
| Projekte | `projects`, `project_statuses`, `bautagesberichte`, `besprechungsprotokolle` |
| Kalkulation | `kalkulationen`, `kalkulation_versionen`, `kalkulation_artikel`, `aufbau_vorlagen`, `regie_saetze` |
| Zeit | `time_entries`, `time_entry_workers`, `time_accounts`, `leave_requests` |
| Regie | `disturbances`, `disturbance_workers`, `disturbance_materials`, `disturbance_photos` |
| Einkauf | `purchase_invoices`, `purchase_invoice_allocations`, `lieferscheine` |
| Fuhrpark | `vehicles`, `vehicle_costs`, `vehicle_dokumente`, `afa_saetze` |
| Ausschreibung | `lv_ausschreibungen`, `lv_positionen` |
| Betrieb | `profiles`, `user_roles`, `role_permissions`, `app_settings`, `document_texts`, `aenderungswuensche`, `neuerungen`, `audit_log` |

### Rechte

Jede Tabelle hat Row Level Security. Rollen liegen in `user_roles`, die
Freischaltung einzelner Bereiche in `role_permissions`. Die Zuordnung
Route → Bereich steht in `src/hooks/usePermissions.ts` (`ROUTE_FEATURE_MAP`).

### Migrationen

`supabase/migrations/`, benannt `JJJJMMTTHHMMSS_beschreibung.sql`, chronologisch
angewendet. **Nie rückwirkend ändern** — eine bereits gelaufene Migration wird
nicht editiert, sondern durch eine neue korrigiert.

### Datei-Ablagen (Storage)

19 Ablagen, zusammen rund 950 MB (Stand 09/2026). Die vier grössten machen
über 90 % aus:

| Ablage | Dateien | Grösse | öffentlich |
|---|---:|---:|---|
| `invoice-pdfs` | 571 | 450 MB | nein |
| `project-photos` | 64 | 226 MB | ja |
| `disturbance-photos` | 65 | 196 MB | ja |
| `purchase-invoices` | 38 | 25 MB | nein |
| `aufgaben-fotos` | 8 | 25 MB | ja |
| `aenderungswuensche` | 59 | 9 MB | nein |
| `bildideen` | 4 | 9 MB | nein |
| `regiebericht-pdfs` | 18 | 6 MB | nein |
| `project-reports` | 18 | 6 MB | nein |
| `vehicle-documents` | 12 | 4 MB | nein |

Weitere, derzeit leer: `bautagesbericht-photos`,
`besprechungsprotokoll-photos`, `employee-documents`, `ersttermin-photos`,
`logos`, `project-chef`, `project-materials`, `project-notizen`,
`project-plans`.

Eine Sonderrolle hat **`uebergabe`**: Dort legt der Workflow `Datensicherung`
einmal im Monat das komplette Übergabepaket ab (Quellcode ohne Historie,
Anleitungen, Datenbank-Dump — rund 7 MB). Lesen darf es ausschliesslich die
Administrator-Rolle (`has_role(auth.uid(), 'administrator')`), heruntergeladen
wird es unter *Admin → Einstellungen → Sicherheitskopie der App* über eine
signierte URL. Der Workflow schreibt mit dem Service-Role-Key, den er sich zur
Laufzeit über die Management-API holt; es gibt bewusst keine Insert-Policy.

> **Achtung beim Neuaufbau:** Ob eine Ablage öffentlich ist, entscheidet, ob
> jeder mit der URL an den Inhalt kommt. `employee-documents` und
> `invoice-pdfs` dürfen niemals öffentlich sein. Die Eigenschaften werden von
> `skripte/dateien-sichern.mjs` in `_ablagen.json` mitgesichert und beim
> Rückspielen übernommen.

---

## 6. Serverfunktionen und fremde Dienste

20 Edge Functions in `supabase/functions/`. Ihre Zugangsschlüssel liegen **in
Supabase** (*Edge Functions → Secrets*), nicht im Code.

| Funktion | Zweck | Braucht |
|---|---|---|
| `mail-postfach` | Mailversand und -abruf über die Firmenpostfächer | `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`, `OPENAI_API_KEY` |
| `parse-invoice-document` | Eingangsrechnung auslesen | `OPENAI_API_KEY` |
| `parse-material-file`, `parse-voice-material` | Materiallisten aus Datei/Sprache | `OPENAI_API_KEY` |
| `parse-pruefbuch`, `parse-zulassungsschein` | Fahrzeugpapiere auslesen | `OPENAI_API_KEY` |
| `sprache-zu-text` | Diktat | `OPENAI_API_KEY`, `AI_BASE`, `STT_MODELL` |
| `polish-text`, `adjust-invoice-prices`, `bild-generieren` | Textglättung, Preisanpassung, Bilder | `OPENAI_API_KEY` |
| `create-user`, `delete-user` | Nutzerverwaltung | `SUPABASE_SERVICE_ROLE_KEY` |
| `create-team-time-entries` | Zeiten für ganze Partie | `SUPABASE_SERVICE_ROLE_KEY` |
| `generate-invoice-pdf` | PDF serverseitig | `SUPABASE_SERVICE_ROLE_KEY` |
| `send-disturbance-report` | Regiebericht per Mail | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `send-sms-invite` | Einladung per SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `APP_URL` |
| `wunsch-datei` | Änderungswünsche ans Cockpit | `COCKPIT_SECRET` |
| `check-vat`, `send-invitation`, `migrate-sick-notes` | UID-Prüfung, Einladung, Altdatenumzug | – |

**Fremde Dienste, die Geld kosten oder Verträge sind:**

| Dienst | Wofür | Fällt er aus, dann … |
|---|---|---|
| Supabase | Datenbank, Anmeldung, Dateien, Funktionen | steht alles |
| Vercel | Auslieferung | App nicht erreichbar |
| OpenAI | alle KI-Funktionen | Belege lesen, Diktat, Textglättung gehen nicht |
| Microsoft 365 (Graph) | Mailversand/-abruf über `cg-holzbau.at` | keine Mails aus der App |
| Twilio | SMS-Einladungen | Einladung nur per Mail |
| Resend | Versand Regieberichte | dieser eine Versandweg fehlt |
| GitHub | Code und Ausrollen | keine Änderungen mehr möglich |
| Domain `handwerkapp.at` | Adresse der App | App nur unter der Vercel-Adresse |

> `wunsch-datei` und `COCKPIT_SECRET` gehören zur Infrastruktur des bisherigen
> Betreuers (epower GmbH). Bei einer vollständigen Übernahme entfällt dieser
> Weg; die Änderungswünsche bleiben in der Tabelle `aenderungswuensche`
> lesbar.

---

## 7. Ausrollen

### Code

Push auf `main` → Vercel baut und veröffentlicht automatisch.
`vercel.json` enthält nur die SPA-Umleitung (alle Pfade auf `index.html`).

### Datenbank

Über GitHub Actions, nicht vom Rechner aus:

```sh
git branch -f supabase-deploy/run-N HEAD
git push -f origin supabase-deploy/run-N
gh run watch                                    # jede Migration muss HTTP 201 melden
git push origin main                            # erst danach
git push origin --delete supabase-deploy/run-N
```

Der Workflow liegt in `.github/workflows/supabase-deploy.yml` und braucht das
Repository-Secret `SUPABASE_ACCESS_TOKEN`.

**Reihenfolge ist Pflicht:** erst Datenbank, dann Code.

### Serverfunktionen

```sh
supabase functions deploy <name> --project-ref <kennung>
```

Neue Schlüssel setzt man im Supabase-Dashboard unter *Edge Functions → Secrets*.

---

## 8. Neuaufbau von Null

Falls alles verloren geht und aus der Sicherung neu aufgebaut werden muss:

1. **Supabase-Projekt anlegen**, Region `eu-central-1` (Frankfurt, DSGVO)
2. **Datenbank einspielen:**
   ```sh
   psql "$DATENBANK_URL" -f 03_Daten-Sicherung/datenbank_JJJJ-MM-TT.sql
   ```
   Alternativ von vorn über die Migrationen: `supabase db push`
3. **Dateien einspielen** — die Ablagen anlegen und den Inhalt aus
   `03_Daten-Sicherung/dateien/` hochladen (Skript liegt dabei)
4. **Serverfunktionen ausrollen** (siehe oben) und Secrets setzen
5. **Frontend:** `.env` mit URL und Key des neuen Projekts füllen,
   `npm run build`, `dist/` auf Vercel oder einen beliebigen Webserver legen
6. **Nutzer:** Auth-Nutzer stecken in `auth.users` und kommen mit dem Dump mit.
   Passwörter bleiben gültig. Ist die Datenbank ohne `auth`-Schema gesichert,
   müssen die Nutzer neu angelegt werden (Admin-Bereich der App).

Realistischer Aufwand für einen Entwickler mit Supabase-Erfahrung: ein halber
bis ein Tag.

---

## 9. Bekannte Altlasten

- **5 Typfehler** in `ContactHistoryTimeline`, `WeeklyAssignmentWidget` und
  `getNumberOfPages`. Bekannt, toleriert. Sechster Fehler = neuer Fehler.
- **KingBill-Altbelege:** Bei aus KingBill übernommenen Rechnungen stehen in
  `mwst_exempt`-Zeilen Nettobeträge. Ein Nachdruck zeigt dort andere Summen als
  das Original-PDF. Bezahlte Belege sind gesperrt, im Alltag fällt es nicht
  auf. **Nicht durch Datenkorrektur „reparieren"** — die Original-PDFs sind
  archiviert und gelten.
- **Legacy-Plantafel:** Es gibt zwei Generationen; die ältere ist noch im Code.
- **Einige Module sind tot** (nicht mehr eingebunden), aber nicht entfernt.
- Manche Tabellen fehlen in den generierten Typen — Muster
  `(supabase.from("x" as never) as any)`.

---

## 10. Verwandte Unterlagen

- [`../CLAUDE.md`](../CLAUDE.md) — Regeln für KI-Arbeit im Code
- [`uebergabe/`](uebergabe/) — Anleitungen für den Betrieb, ohne Fachbegriffe
- `README.md` — Kurzfassung
