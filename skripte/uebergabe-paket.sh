#!/usr/bin/env bash
# ============================================================================
# Das Uebergabe-Paket zusammenstellen
#
# Baut den Ordner, den der Betrieb bekommt: Programm, Anleitungen und Platz
# fuer die Datensicherung. Zugangsdaten kommen NICHT hinein — die werden
# getrennt uebergeben (Passwort-Tresor oder ausgedruckt).
#
# Aufruf:
#   ./skripte/uebergabe-paket.sh [zielordner]
#
# Ohne Angabe landet es unter ~/Groismaier-App-Uebergabe.
#
# Am Ende laeuft eine Sicherheitspruefung ueber das fertige Paket. Findet sie
# etwas, das nach einem Zugangsschluessel aussieht, bricht das Skript ab.
# ============================================================================
set -euo pipefail

QUELLE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIEL="${1:-$HOME/Groismaier-App-Uebergabe}"
DATUM=$(date +%Y-%m-%d)

echo "Quelle: $QUELLE"
echo "Ziel:   $ZIEL"
echo

if [ -e "$ZIEL" ]; then
  echo "Der Zielordner existiert bereits."
  read -r -p "Inhalt ersetzen? [j/N] " antwort
  [[ "$antwort" =~ ^[jJyY]$ ]] || { echo "Abgebrochen."; exit 1; }
  rm -rf "$ZIEL"
fi

mkdir -p "$ZIEL"/{01_Anleitungen,02_Programm,03_Daten-Sicherung}

# ── 1. Anleitungen ──────────────────────────────────────────────────────────
echo "→ Anleitungen"
cp "$QUELLE/docs/uebergabe/00-ZUERST-LESEN.md" "$ZIEL/00-ZUERST-LESEN.md"
cp "$QUELLE"/docs/uebergabe/0[1-9]-*.md "$ZIEL/01_Anleitungen/"

# ── 2. Programm ─────────────────────────────────────────────────────────────
# Ausgeschlossen wird alles, was entweder neu erzeugt werden kann
# (node_modules, dist) oder nicht weitergegeben werden darf (.env, das
# Datenbank-Passwort, lokale Editor-Einstellungen).
echo "→ Programm"
if command -v rsync > /dev/null 2>&1; then
  rsync -a \
    --exclude node_modules --exclude dist --exclude dist-ssr \
    --exclude .env --exclude ".env.local" --exclude ".env.*.local" \
    --exclude .supabase-db-pass.txt \
    --exclude vorlagefunktionenapp --exclude test-results \
    --exclude playwright-report --exclude "*.tsbuildinfo" \
    --exclude .DS_Store --exclude "supabase/.temp" \
    --exclude .claude \
    "$QUELLE/" "$ZIEL/02_Programm/"
else
  echo "  (rsync fehlt — nutze tar)"
  tar -C "$QUELLE" \
      --exclude=node_modules --exclude=dist --exclude=dist-ssr \
      --exclude=.env --exclude=.env.local \
      --exclude=.supabase-db-pass.txt \
      --exclude=vorlagefunktionenapp --exclude=test-results \
      --exclude=playwright-report --exclude="*.tsbuildinfo" \
      --exclude=.DS_Store --exclude=supabase/.temp --exclude=.claude \
      -cf - . | tar -C "$ZIEL/02_Programm" -xf -
fi

# Die Git-Historie ist das Bautagebuch der App: jede Aenderung mit Datum und
# Begruendung, jederzeit zurueckspulbar. Sie ist geprueft frei von Schluesseln
# und darf mit. Wer sie nicht will: MIT_HISTORIE=nein voranstellen.
if [ "${MIT_HISTORIE:-ja}" = "nein" ]; then
  rm -rf "$ZIEL/02_Programm/.git"
  echo "  (Historie ausgelassen)"
else
  echo "  (mit Historie — $(git -C "$QUELLE" rev-list --count HEAD) Aenderungen)"
fi

# ── 3. Platzhalter fuer die Datensicherung ──────────────────────────────────
echo "→ Datensicherung (Platzhalter)"
cat > "$ZIEL/03_Daten-Sicherung/HIER-KOMMT-DIE-SICHERUNG-HIN.md" <<'ENDE'
# Datensicherung

Dieser Ordner ist noch leer. Hier gehoeren zwei Dinge hinein:

## 1. Die Datenbank

Kunden, Belege, Positionen, Stunden, Projekte, Benutzer — rund 32 MB.

Wird monatlich automatisch gesichert. Herunterladen:

1. GitHub oeffnen → Reiter **Actions**
2. links **Datensicherung** anklicken
3. den neuesten Lauf oeffnen
4. unten unter **Artifacts** herunterladen

Von Hand anstossen geht dort ebenfalls (**Run workflow**).

> **Wichtig:** Diese Sicherungen werden nach **90 Tagen automatisch
> geloescht**. Das ist ein Sicherheitsnetz fuer den Alltag, kein Archiv.
> Wer eine Sicherung dauerhaft behalten will — zum Jahresabschluss, vor
> einer Uebergabe, vor einer groesseren Aenderung — laedt sie herunter und
> legt sie hier in diesen Ordner.

## 2. Die hinterlegten Dateien

Fotos, Beleg-PDFs, Dokumente — rund 950 MB. Nicht automatisch, weil zu gross.

```sh
SUPABASE_URL="https://<kennung>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
node skripte/dateien-sichern.mjs "<dieser Ordner>/dateien"
```

Der Lauf ist fortsetzbar — ein Abbruch ist harmlos, einfach neu starten.

## Zurueckspielen

Steht in `02_Programm/docs/HANDBUCH.md`, Abschnitt 8.

## Wie alt darf eine Sicherung sein?

Die Datenbank moeglichst aktuell — dort steckt die tägliche Arbeit.
Die Dateien sind unkritischer; alle paar Monate reicht, und vor jeder
Uebergabe einmal.
ENDE

# ── 4. Uebersicht ins Paket ─────────────────────────────────────────────────
cat > "$ZIEL/INHALT.md" <<ENDE
# Uebergabe-Paket — App Holzbau Groismaier

Erstellt am $(date '+%d.%m.%Y')

| Ordner | Inhalt |
|---|---|
| \`00-ZUERST-LESEN.md\` | **Hier anfangen.** Eine Seite. |
| \`01_Anleitungen/\` | Fuenf Anleitungen, von einfach nach technisch |
| \`02_Programm/\` | Der komplette Quellcode |
| \`03_Daten-Sicherung/\` | Kunden, Belege, Fotos — siehe Hinweis im Ordner |

## Nicht in diesem Paket

**Die Zugangsdaten.** Absichtlich. Ein Ordner wie dieser wird kopiert,
gemailt und weitergegeben — Zugangsschluessel duerfen darin nicht liegen.
Sie werden getrennt uebergeben.

## Stand des Programms

- Letzte Aenderung: $(git -C "$QUELLE" log -1 --format='%ad — %s' --date=format:'%d.%m.%Y')
- Aenderungen insgesamt: $(git -C "$QUELLE" rev-list --count HEAD)
- Automatische Pruefungen: $(find "$QUELLE/src" -name "*.test.ts" -o -name "*.test.tsx" | wc -l | tr -d ' ') Testdateien

## Fuer den Programmierer

Alles Technische steht in \`02_Programm/docs/HANDBUCH.md\`.
Neuaufbau von Null: Abschnitt 8.
ENDE

# ── 5. Sicherheitspruefung ──────────────────────────────────────────────────
echo
echo "→ Sicherheitspruefung"
FUNDE=0

for datei in .env .env.local .supabase-db-pass.txt; do
  if [ -e "$ZIEL/02_Programm/$datei" ]; then
    echo "  ✗ $datei ist im Paket gelandet!"
    FUNDE=$((FUNDE + 1))
  fi
done

# Echte Schluesselwerte suchen — nicht blosse Variablennamen.
if grep -rIlE "eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sk-(proj-|ant-)?[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{10,}" \
     "$ZIEL" --exclude-dir=.git 2>/dev/null | head -5 | grep . ; then
  echo "  ✗ Oben stehende Dateien enthalten etwas, das nach einem Schluessel aussieht."
  FUNDE=$((FUNDE + 1))
fi

if [ "$FUNDE" -gt 0 ]; then
  echo
  echo "ABBRUCH: $FUNDE Fund(e). Das Paket NICHT weitergeben, bevor das geklaert ist."
  exit 1
fi
echo "  ✓ keine Zugangsdaten im Paket"

# ── Fertig ──────────────────────────────────────────────────────────────────
GROESSE=$(du -sh "$ZIEL" | cut -f1)
echo
echo "════════════════════════════════════════════════"
echo " Paket fertig:  $ZIEL"
echo " Groesse:       $GROESSE"
echo "════════════════════════════════════════════════"
echo
echo " Noch zu tun:"
echo "   1. Datensicherung nach 03_Daten-Sicherung/ legen"
echo "   2. In 01_Anleitungen/05-zugaenge-und-kosten.md die Tabelle ausfuellen"
echo "   3. 01_Anleitungen/04-notfall.md ausfuellen und AUSDRUCKEN"
echo "   4. Zugangsdaten GETRENNT uebergeben — nicht in diesen Ordner"
echo
