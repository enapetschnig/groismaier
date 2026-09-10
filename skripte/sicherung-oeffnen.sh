#!/usr/bin/env bash
# ============================================================================
# Eine verschluesselte Sicherung wieder oeffnen
#
# Gegenstueck zum Verschluesselungsschritt im Workflow "Datensicherung".
# Braucht nur openssl — das liegt auf jedem Mac und jedem Linux bereits vor,
# es muss nichts installiert werden. Genau deshalb openssl und nicht gpg:
# Im Ernstfall will niemand erst Software besorgen.
#
# Aufruf:
#   ./skripte/sicherung-oeffnen.sh ~/Downloads/sicherung-7
#
# Das Passwort wird verdeckt abgefragt (steht im Passwort-Tresor). Wer es
# lieber uebergibt:
#   SICHERUNG_PASSWORT='...' ./skripte/sicherung-oeffnen.sh <ordner>
#
# Die verschluesselten Dateien bleiben liegen; daneben entstehen die
# entschluesselten. Es wird nichts geloescht und nichts ueberschrieben.
# ============================================================================
set -euo pipefail

ORDNER="${1:-}"
if [ -z "$ORDNER" ] || [ ! -d "$ORDNER" ]; then
  echo "Aufruf: $0 <ordner mit den .enc-Dateien>"
  exit 1
fi

DATEIEN=("$ORDNER"/*.enc)
if [ ! -e "${DATEIEN[0]}" ]; then
  echo "In $ORDNER liegt keine einzige .enc-Datei."
  echo "Ist die Sicherung vielleicht unverschluesselt? Dann sind es .sql-Dateien"
  echo "und du kannst sie direkt verwenden."
  exit 1
fi

echo "Gefunden: ${#DATEIEN[@]} verschluesselte Datei(en) in $ORDNER"
echo

PASSWORT="${SICHERUNG_PASSWORT:-}"
if [ -z "$PASSWORT" ]; then
  read -r -s -p "Passwort: " PASSWORT
  echo
fi
export PASSWORT
[ -z "$PASSWORT" ] && { echo "Kein Passwort eingegeben."; exit 1; }

entschluesseln() {
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$1" -out "$2" -pass env:PASSWORT
}

# Erst an EINER Datei pruefen, ob das Passwort ueberhaupt stimmt — sonst
# entstuenden bei falschem Passwort ein Dutzend Dateien voller Datenmuell.
PROBE=$(mktemp)
if ! entschluesseln "${DATEIEN[0]}" "$PROBE" 2>/dev/null; then
  rm -f "$PROBE"
  echo
  echo "Das Passwort stimmt nicht."
  echo "Es ist dasselbe, das als GitHub-Secret SICHERUNG_PASSWORT hinterlegt ist"
  echo "und im Passwort-Tresor liegen sollte."
  exit 1
fi
rm -f "$PROBE"
echo "Passwort stimmt. Entschluessele …"
echo

FERTIG=0
for f in "${DATEIEN[@]}"; do
  ZIEL="${f%.enc}"
  if [ -e "$ZIEL" ]; then
    echo "  – $(basename "$ZIEL") gibt es schon, uebersprungen"
    continue
  fi
  entschluesseln "$f" "$ZIEL"
  echo "  ✓ $(basename "$ZIEL")  ($(du -h "$ZIEL" | cut -f1))"
  FERTIG=$((FERTIG + 1))
done

echo
echo "$FERTIG Datei(en) entschluesselt."
echo
echo "Einspielen in eine Datenbank:"
echo "  psql \"\$DATENBANK_URL\" -f $ORDNER/01_firmendaten_*.sql"
echo
echo "Reihenfolge: erst 01_firmendaten, dann 02_benutzer, dann 03_dateiverzeichnis."
echo "Die Fotos und PDFs liegen separat — siehe skripte/dateien-zurueckspielen.mjs."
