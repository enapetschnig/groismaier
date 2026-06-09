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
