#!/usr/bin/env node
// ============================================================================
// Die Anleitungen als HTML aufbereiten
//
// Grund: Markdown-Dateien sind fuer den Betrieb eine Huerde. Unter Windows
// oeffnen sie im Editor ohne Formatierung, auf manchen Rechnern gar nicht.
// Als HTML genuegt ein Doppelklick, und es sieht aus wie eine Webseite.
//
// Erzeugt wird ausserdem eine Startseite mit Kacheln, damit im Uebergabe-
// Paket sofort sichtbar ist, wo man anfaengt.
//
// Alles ist in sich geschlossen: Stil inline, keine externen Dateien, keine
// Internetverbindung noetig. Das Paket muss auch in zehn Jahren noch
// funktionieren.
//
// Aufruf:
//   node skripte/anleitungen-als-html.mjs <zielordner> [startseiten-ordner]
//
// Mit zweitem Argument landet die Startseite eine Ebene hoeher als die
// Unterseiten — im Uebergabe-Paket soll sie ganz oben liegen, damit sie
// sofort ins Auge faellt, waehrend die uebrigen Seiten aufgeraeumt in einem
// Unterordner stehen. Die Verlinkung wird dabei mitgezogen.
// ============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ZIEL = process.argv[2];
const START_ORDNER = process.argv[3] || null;   // Startseite eine Ebene hoeher
if (!ZIEL) {
  console.error("Aufruf: node skripte/anleitungen-als-html.mjs <zielordner> [startseiten-ordner]");
  process.exit(1);
}
/** Wie die Unterseiten von der Startseite aus erreichbar sind. */
const ZU_UNTERSEITE = START_ORDNER ? `${ZIEL.split("/").pop()}/` : "";
/** Wie die Startseite von einer Unterseite aus erreichbar ist. */
const ZUR_STARTSEITE = START_ORDNER ? "../START-HIER.html" : "START-HIER.html";

/** Die Seiten in der Reihenfolge, in der man sie lesen sollte. */
const SEITEN = [
  { quelle: "docs/uebergabe/00-ZUERST-LESEN.md", datei: "00-Zuerst-lesen.html",
    titel: "Zuerst lesen", untertitel: "Eine Seite. Worum es hier geht.", symbol: "①" },
  { quelle: "docs/uebergabe/01-was-ist-das-alles.md", datei: "01-Was-ist-das-alles.html",
    titel: "Was ist das alles?", untertitel: "Woraus die App besteht — 10 Minuten", symbol: "②" },
  { quelle: "docs/uebergabe/02-app-selbst-betreiben.md", datei: "02-Selbst-betreiben.html",
    titel: "Die App selbst betreiben", untertitel: "Was das bedeutet, was es kostet", symbol: "③" },
  { quelle: "docs/uebergabe/03-aendern-mit-ki.md", datei: "03-Aendern-mit-KI.html",
    titel: "Etwas ändern mit einer KI", untertitel: "Selbst Kleinigkeiten anpassen", symbol: "④" },
  { quelle: "docs/uebergabe/04-notfall.md", datei: "04-Notfall.html",
    titel: "Notfall", untertitel: "Ausdrucken und ins Büro hängen", symbol: "⑤" },
  { quelle: "docs/uebergabe/05-zugaenge-und-kosten.md", datei: "05-Zugaenge-und-Kosten.html",
    titel: "Zugänge und Kosten", untertitel: "Was läuft wo, was kostet es", symbol: "⑥" },
  { quelle: "NOTFALL.md", datei: "Fuer-den-Techniker.html",
    titel: "Für den Techniker", untertitel: "Die App wieder online bringen — halber Tag",
    symbol: "🔧", technisch: true },
];

const STIL = `
  :root {
    --grund: #ffffff; --text: #1f2328; --gedaempft: #59636e;
    --linie: #d8dee4; --akzent: #8b5a2b; --kachel: #f6f8fa;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--text); background: var(--grund);
  }
  .blatt { max-width: 760px; margin: 0 auto; padding: 32px 24px 80px; }
  .zurueck {
    display: inline-block; margin-bottom: 28px; padding: 7px 14px;
    border: 1px solid var(--linie); border-radius: 7px;
    color: var(--gedaempft); text-decoration: none; font-size: 15px;
  }
  .zurueck:hover { background: var(--kachel); color: var(--text); }
  h1 { font-size: 30px; line-height: 1.25; margin: 0 0 22px; letter-spacing: -0.01em; }
  h2 {
    font-size: 22px; margin: 40px 0 14px; padding-bottom: 7px;
    border-bottom: 1px solid var(--linie);
  }
  h3 { font-size: 18px; margin: 30px 0 10px; }
  p, li { font-size: 17px; }
  ul, ol { padding-left: 24px; }
  li { margin: 6px 0; }
  a { color: var(--akzent); }
  code {
    background: var(--kachel); padding: 2px 6px; border-radius: 4px;
    font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  pre {
    background: var(--kachel); padding: 16px; border-radius: 8px;
    overflow-x: auto; border: 1px solid var(--linie);
  }
  pre code { background: none; padding: 0; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 16px; }
  th, td { border: 1px solid var(--linie); padding: 9px 12px; text-align: left; vertical-align: top; }
  th { background: var(--kachel); font-weight: 600; }
  blockquote {
    margin: 20px 0; padding: 14px 18px; border-left: 4px solid var(--akzent);
    background: var(--kachel); border-radius: 0 8px 8px 0;
  }
  blockquote p:first-child { margin-top: 0; }
  blockquote p:last-child { margin-bottom: 0; }
  hr { border: none; border-top: 1px solid var(--linie); margin: 36px 0; }
  strong { font-weight: 650; }
  /* Ausfuellbare Zeilen im Notfallblatt sichtbar machen */
  pre:has(code:empty), pre code:only-child:not(:has(*)) { min-height: 1em; }
  @media print {
    body { font-size: 12pt; }
    .zurueck, .fuss { display: none; }
    .blatt { max-width: none; padding: 0; }
    pre, blockquote, table { break-inside: avoid; }
  }
  .fuss {
    margin-top: 60px; padding-top: 20px; border-top: 1px solid var(--linie);
    color: var(--gedaempft); font-size: 14px;
  }
`;

const seite = (titel, inhalt, mitZurueck = true) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titel} — Holzbau Groismaier</title>
<style>${STIL}</style>
</head>
<body>
<div class="blatt">
${mitZurueck ? `<a class="zurueck" href="${ZUR_STARTSEITE}">← Übersicht</a>` : ""}
${inhalt}
<div class="fuss">Holzbau Groismaier GmbH — Unterlagen zur App</div>
</div>
</body>
</html>`;

function nachHtml(mdPfad) {
  const md = readFileSync(join(WURZEL, mdPfad), "utf8");
  // marked ueber npx: keine Abhaengigkeit im Projekt noetig, und das Skript
  // laeuft auch auf einem frisch ausgepackten Ordner.
  return execFileSync("npx", ["--yes", "marked@15", "--gfm"], {
    input: md, encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
  });
}

mkdirSync(ZIEL, { recursive: true });

console.log("Anleitungen werden aufbereitet …\n");
for (const s of SEITEN) {
  const html = nachHtml(s.quelle);
  writeFileSync(join(ZIEL, s.datei), seite(s.titel, html));
  console.log(`  ✓ ${s.datei}`);
}

// ── Startseite ──────────────────────────────────────────────────────────────
const kachel = (s) => `
    <a class="karte${s.technisch ? " technisch" : ""}" href="${ZU_UNTERSEITE}${s.datei}">
      <span class="zeichen">${s.symbol}</span>
      <span class="text">
        <span class="titel">${s.titel}</span>
        <span class="unter">${s.untertitel}</span>
      </span>
    </a>`;

const start = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deine App — Holzbau Groismaier</title>
<style>${STIL}
  .kopf { margin-bottom: 34px; }
  .kopf p { color: var(--gedaempft); font-size: 18px; margin: 0; }
  .karte {
    display: flex; align-items: center; gap: 16px;
    padding: 16px 18px; margin-bottom: 10px;
    border: 1px solid var(--linie); border-radius: 10px;
    text-decoration: none; color: inherit; background: var(--grund);
  }
  .karte:hover { background: var(--kachel); border-color: var(--akzent); }
  .karte.technisch { border-style: dashed; margin-top: 26px; }
  .zeichen { font-size: 26px; color: var(--akzent); flex: 0 0 auto; width: 34px; text-align: center; }
  .text { display: flex; flex-direction: column; }
  .titel { font-weight: 650; font-size: 18px; }
  .unter { color: var(--gedaempft); font-size: 15px; }
  .hinweis {
    margin-top: 34px; padding: 16px 18px;
    background: var(--kachel); border-radius: 10px; border: 1px solid var(--linie);
    font-size: 16px;
  }
  .hinweis p { margin: 0 0 8px; }
  .hinweis p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
<div class="blatt">
  <div class="kopf">
    <h1>Deine App</h1>
    <p>Holzbau Groismaier GmbH — alle Unterlagen an einem Ort</p>
  </div>

  ${SEITEN.filter((s) => !s.technisch).map(kachel).join("")}
  ${SEITEN.filter((s) => s.technisch).map(kachel).join("")}

  <div class="hinweis">
    <p><strong>Wenn du nur eines liest:</strong> die erste Seite. Zehn Minuten,
    danach weißt du, woraus deine App besteht und was dieser Ordner soll.</p>
    <p><strong>Wenn es einmal ernst wird:</strong> „Für den Techniker" weitergeben.
    Damit bringt jeder IT-Fachmann die App wieder online — er braucht nur diesen
    Ordner und die Datensicherung, sonst nichts.</p>
  </div>

  <div class="fuss">
    Stand: ${new Date().toLocaleDateString("de-AT", { day: "2-digit", month: "long", year: "numeric" })}
  </div>
</div>
</body>
</html>`;

const startZiel = START_ORDNER || ZIEL;
mkdirSync(startZiel, { recursive: true });
writeFileSync(join(startZiel, "START-HIER.html"), start);
console.log(`  ✓ START-HIER.html${START_ORDNER ? "  (eine Ebene hoeher)" : ""}\n`);
console.log(`Fertig: ${ZIEL}`);
