# Holzbau Groismaier — Angebots-, Rechnungs- & Zeiterfassungs-App

Interne Anwendung der **Holzbau Groismaier GmbH** (Zimmerei & Holzbau, Dallein 43, 3753 Dallein) für
Angebote, Auftragsbestätigungen, Rechnungen, Material- & **Auftragskalkulation**, Standardaufbauten,
Kundenverwaltung, Projekte/Plantafel und Zeiterfassung.

## Tech-Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Storage, Edge Functions)

## Lokale Entwicklung

```sh
npm install
cp .env.beispiel .env     # und die zwei Werte eintragen
npm run dev
```

Die App erwartet in `.env`:

```
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_KEY="<publishable-key>"
```

## Build

```sh
npm run build
```

## Prüfungen vor jedem Commit

```sh
npx tsc --noEmit -p tsconfig.app.json   # Baseline: 5 bekannte Fehler
npm test -- --run                        # 299 Tests
npm run build
```

## Weiterführende Unterlagen

| Datei | Für wen |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | KI-Werkzeuge, die im Code arbeiten — Eigenheiten und Tabus |
| [`docs/HANDBUCH.md`](docs/HANDBUCH.md) | Entwickler — Architektur, Dienste, Ausrollen, Neuaufbau |
| [`docs/uebergabe/`](docs/uebergabe/) | Den Betrieb — Anleitungen ohne Fachbegriffe |

## Skripte

```sh
./skripte/uebergabe-paket.sh              # Übergabe-Paket zusammenstellen
node skripte/dateien-sichern.mjs <ziel>   # Storage sichern (fortsetzbar)
node skripte/dateien-zurueckspielen.mjs <quelle> --probe
```

Die Datenbank sichert der Workflow [`Datensicherung`](.github/workflows/datensicherung.yml)
monatlich automatisch.
