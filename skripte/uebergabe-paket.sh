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
# Die Anleitungen als HTML: ein Doppelklick, und sie oeffnen im Browser.
# Als Markdown-Datei waeren sie fuer den Betrieb eine Huerde — unter Windows
# oeffnen sie im Editor ohne Formatierung oder gar nicht.
echo "→ Anleitungen (als Webseiten)"
node "$QUELLE/skripte/anleitungen-als-html.mjs" "$ZIEL/01_Anleitungen" "$ZIEL" \
  | sed 's/^/  /'

# Die Markdown-Fassungen kommen mit — falls jemand sie weiterbearbeiten will.
mkdir -p "$ZIEL/01_Anleitungen/Originaltexte"
cp "$QUELLE"/docs/uebergabe/*.md "$ZIEL/01_Anleitungen/Originaltexte/"
cp "$QUELLE/NOTFALL.md" "$ZIEL/01_Anleitungen/Originaltexte/"

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

# ── 3. Datensicherung ───────────────────────────────────────────────────────
# Wenn moeglich die neueste automatische Sicherung dazulegen. Ein Paket ohne
# Daten waere ein leeres Haus: Der Code allein ergibt eine App ohne einen
# einzigen Kunden.
echo "→ Datensicherung"
SICHERUNG_DA=nein

# Im GitHub-Workflow liegt die Sicherung schon fertig vor und wird ueber
# SICHERUNG_ORDNER hereingereicht — dort gibt es kein "gh run download".
if [ -n "${SICHERUNG_ORDNER:-}" ] && [ -d "${SICHERUNG_ORDNER}" ]; then
  cp "${SICHERUNG_ORDNER}"/* "$ZIEL/03_Daten-Sicherung/" 2>/dev/null || true
  if ls "$ZIEL/03_Daten-Sicherung"/*.sql > /dev/null 2>&1; then
    echo "  ✓ Sicherung uebernommen (aus ${SICHERUNG_ORDNER})"
    SICHERUNG_DA=ja
  fi
fi

if [ "$SICHERUNG_DA" = "nein" ] && command -v gh > /dev/null 2>&1 && gh auth status > /dev/null 2>&1; then
  LAUF=$(gh run list --workflow="Datensicherung" --limit 5 \
           --json databaseId,conclusion \
           -q '[.[] | select(.conclusion=="success")][0].databaseId' 2>/dev/null || true)
  if [ -n "${LAUF:-}" ] && [ "$LAUF" != "null" ]; then
    ARTEFAKT=$(gh api "repos/{owner}/{repo}/actions/runs/${LAUF}/artifacts" \
                 -q '.artifacts[0].name' 2>/dev/null || true)
    if [ -n "${ARTEFAKT:-}" ] && gh run download "$LAUF" -n "$ARTEFAKT" \
         -D "$ZIEL/03_Daten-Sicherung" > /dev/null 2>&1; then
      echo "  ✓ aktuelle Sicherung uebernommen ($ARTEFAKT)"
      SICHERUNG_DA=ja
    fi
  fi
fi

if [ "$SICHERUNG_DA" = "ja" ]; then
  cat > "$ZIEL/03_Daten-Sicherung/WAS-IST-DAS.md" <<'ENDE'
# Die Datensicherung

**Das ist der wertvolle Teil dieses Pakets.** Der Programmcode liesse sich zur
Not neu schreiben — die Rechnungshistorie nicht.

## Was drin ist

| Datei | Inhalt |
|---|---|
| `01_firmendaten_*.sql` | Kunden, Angebote, Rechnungen, Positionen, Stunden, Projekte, Regieberichte, Fahrzeuge — 84 Tabellen |
| `02_benutzer_*.sql` | Die Anmeldungen der Mitarbeiter. Mit eingespielt, bleiben alle Passwoerter gueltig. |
| `03_dateiverzeichnis_*.sql` | Das Verzeichnis der hinterlegten Dateien (nicht die Dateien selbst) |

Stand: siehe Datum im Dateinamen.

## Was NICHT drin ist

**Die hinterlegten Dateien** — Baustellenfotos, die erzeugten Beleg-PDFs,
eingelesene Eingangsrechnungen, Fahrzeugpapiere. Zusammen rund 950 MB, zu
gross fuer dieses Paket.

Wie schlimm ist das? Ueberschaubar: Die Beleg-PDFs erzeugt die App aus den
Daten jederzeit neu. Verloren waeren die Fotos und die eingelesenen
Original-Eingangsrechnungen.

Mitsichern liesse sich das so:

```sh
SUPABASE_URL="https://<kennung>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
node 02_Programm/skripte/dateien-sichern.mjs <zielordner>
```

## Wie alt darf diese Sicherung sein?

Der Programmcode altert langsam — eine Fassung von vor einem Jahr ergibt immer
noch eine laufende App, nur ohne die neuesten Funktionen.

**Die Daten altern schnell.** Eine Sicherung von vor einem Jahr bedeutet ein
Jahr fehlende Rechnungen. Wer dieses Paket als Absicherung aufbewahrt, sollte
die Datensicherung darin regelmaessig austauschen.

## Zurueckspielen

Steht in `START-HIER.html` → „Fuer den Techniker", Schritt 2.

## Datenschutz

Hier stehen saemtliche Kunden- und Mitarbeiterdaten. Das Paket gehoert nicht
offen in eine Cloud und nicht auf einen Stick, der herumliegt.
ENDE
else
  echo "  (keine Sicherung uebernommen — Platzhalter wird abgelegt)"
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
fi

# ── 4. Uebersicht ins Paket ─────────────────────────────────────────────────
cat > "$ZIEL/INHALT.md" <<ENDE
# Uebergabe-Paket — App Holzbau Groismaier

Erstellt am $(date '+%d.%m.%Y')

| Datei / Ordner | Inhalt |
|---|---|
| \`START-HIER.html\` | **Hier anfangen** — Doppelklick, oeffnet im Browser |
| \`01_Anleitungen/\` | Alle Anleitungen als Webseiten, dazu die Originaltexte |
| \`02_Programm/\` | Der komplette Quellcode |
| \`03_Daten-Sicherung/\` | Kunden, Belege, Stunden — siehe \`WAS-IST-DAS.md\` im Ordner |

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

# ── 6. ZIP zum Verschicken ──────────────────────────────────────────────────
echo
echo "→ ZIP"
ZIP="${ZIEL}.zip"
rm -f "$ZIP"
( cd "$(dirname "$ZIEL")" && zip -rq "$(basename "$ZIP")" "$(basename "$ZIEL")" -x "*.DS_Store" )
echo "  ✓ $(basename "$ZIP")  ($(du -h "$ZIP" | cut -f1))"

# ── Fertig ──────────────────────────────────────────────────────────────────
GROESSE=$(du -sh "$ZIEL" | cut -f1)
echo
echo "════════════════════════════════════════════════"
echo " Paket fertig:  $ZIEL"
echo " Groesse:       $GROESSE   (ZIP: $(du -h "$ZIP" | cut -f1))"
echo "════════════════════════════════════════════════"
echo
echo " Noch zu tun:"
if [ "$SICHERUNG_DA" = "nein" ]; then
echo "   1. Datensicherung nach 03_Daten-Sicherung/ legen"
else
echo "   1. (Datensicherung ist enthalten)"
fi
echo "   2. In 01_Anleitungen/05-zugaenge-und-kosten.md die Tabelle ausfuellen"
echo "   3. 01_Anleitungen/04-notfall.md ausfuellen und AUSDRUCKEN"
echo "   4. Zugangsdaten GETRENNT uebergeben — nicht in diesen Ordner"
echo
