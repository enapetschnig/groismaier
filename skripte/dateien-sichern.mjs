#!/usr/bin/env node
// ============================================================================
// Die hinterlegten Dateien sichern — Fotos, Beleg-PDFs, Dokumente
//
// Die Datenbank sichert der GitHub-Workflow "Datensicherung" monatlich von
// allein. Die Dateien nicht: Sie sind rund 950 MB und wuerden den
// Artefakt-Speicher sprengen. Dafuer aendern sie sich langsamer — ein Lauf
// alle paar Monate reicht, und vor jeder Uebergabe einer.
//
// Der Lauf ist NUR LESEND. In der Ablage wird nichts geaendert oder geloescht.
//
// ── Aufruf ──────────────────────────────────────────────────────────────────
//
//   SUPABASE_URL="https://<kennung>.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
//   node skripte/dateien-sichern.mjs ~/Sicherung/dateien
//
// Der Service-Role-Key steht im Supabase-Dashboard unter
// Project Settings → API → service_role. ACHTUNG: Dieser Schluessel umgeht
// saemtliche Zugriffsbeschraenkungen. Niemals in eine Datei schreiben, die
// weitergegeben wird — nur als Umgebungsvariable uebergeben.
//
// Der Lauf ist FORTSETZBAR: Bereits vorhandene Dateien gleicher Groesse
// werden uebersprungen. Ein Abbruch (Netzausfall, Strg+C) ist also harmlos —
// einfach noch einmal starten.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZIEL = process.argv[2];

if (!URL || !KEY || !ZIEL) {
  console.error(`
Fehlende Angaben.

  SUPABASE_URL="https://<kennung>.supabase.co" \\
  SUPABASE_SERVICE_ROLE_KEY="<service role key>" \\
  node skripte/dateien-sichern.mjs <zielordner>
`);
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** Datei existiert bereits in derselben Groesse? Dann nicht neu laden. */
async function schonDa(pfad, groesse) {
  try {
    const s = await stat(pfad);
    return groesse ? s.size === groesse : s.size > 0;
  } catch {
    return false;
  }
}

/**
 * Eine Ablage rekursiv auflisten.
 *
 * Supabase liefert Ordner als Eintraege ohne `id` — daran erkennt man sie.
 * Die Liste ist auf 100 Eintraege je Aufruf begrenzt, deshalb die Schleife
 * ueber `offset`; ohne die fehlten bei invoice-pdfs vier Fuenftel der Belege.
 */
async function auflisten(ablage, prefix = "") {
  const gefunden = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db.storage
      .from(ablage)
      .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${ablage}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const eintrag of data) {
      const pfad = prefix ? `${prefix}/${eintrag.name}` : eintrag.name;
      if (eintrag.id === null) {
        gefunden.push(...(await auflisten(ablage, pfad)));   // Unterordner
      } else {
        gefunden.push({ pfad, groesse: eintrag.metadata?.size ?? 0 });
      }
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return gefunden;
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

async function main() {
  console.log(`Ziel: ${ZIEL}\n`);

  const { data: ablagen, error } = await db.storage.listBuckets();
  if (error) throw new Error(`Ablagen nicht lesbar: ${error.message}`);

  // Mit dem falschen Schluessel (dem oeffentlichen statt dem service_role)
  // antwortet Supabase nicht mit einem Fehler, sondern mit einer LEEREN Liste.
  // Ohne diese Pruefung meldete das Skript "Sicherung vollstaendig", obwohl
  // nichts gesichert wurde — und das faellt erst im Ernstfall auf.
  // Ein Projekt ohne eine einzige Ablage gibt es nicht.
  if (!ablagen || ablagen.length === 0) {
    throw new Error(
      "Keine einzige Ablage gefunden.\n\n" +
      "  Das liegt fast immer am Schluessel: Gebraucht wird der SERVICE-ROLE-Key\n" +
      "  (Supabase-Dashboard → Project Settings → API → service_role),\n" +
      "  nicht der oeffentliche Schluessel aus der .env.\n\n" +
      "  Es wurde NICHTS gesichert.",
    );
  }

  let gesamtNeu = 0, gesamtUeber = 0, gesamtBytes = 0;
  const fehler = [];

  for (const { name: ablage } of ablagen) {
    process.stdout.write(`${ablage} … `);

    let dateien;
    try {
      dateien = await auflisten(ablage);
    } catch (e) {
      console.log(`FEHLER (${e.message})`);
      fehler.push(`${ablage}: ${e.message}`);
      continue;
    }
    if (dateien.length === 0) { console.log("leer"); continue; }

    const summe = dateien.reduce((s, d) => s + d.groesse, 0);
    console.log(`${dateien.length} Datei(en), ${mb(summe)} MB`);

    let neu = 0, uebersprungen = 0;
    for (const { pfad, groesse } of dateien) {
      const ziel = join(ZIEL, ablage, pfad);
      if (await schonDa(ziel, groesse)) { uebersprungen++; continue; }

      const { data, error: e } = await db.storage.from(ablage).download(pfad);
      if (e) { fehler.push(`${ablage}/${pfad}: ${e.message}`); continue; }

      await mkdir(dirname(ziel), { recursive: true });
      await writeFile(ziel, Buffer.from(await data.arrayBuffer()));
      neu++;
      gesamtBytes += groesse;
      if (neu % 25 === 0) process.stdout.write(`   … ${neu} geladen\n`);
    }

    console.log(`   ✓ ${neu} neu, ${uebersprungen} schon vorhanden`);
    gesamtNeu += neu;
    gesamtUeber += uebersprungen;
  }

  // Die Eigenschaften der Ablagen mitschreiben. Ohne sie wuesste das
  // Rueckspiel-Skript nicht, welche Ablage oeffentlich lesbar sein muss und
  // welche nicht — und Mitarbeiterunterlagen laegen ploetzlich offen.
  await mkdir(ZIEL, { recursive: true });
  await writeFile(
    join(ZIEL, "_ablagen.json"),
    JSON.stringify(
      ablagen.map((a) => ({
        name: a.name,
        public: a.public,
        file_size_limit: a.file_size_limit ?? null,
        allowed_mime_types: a.allowed_mime_types ?? null,
      })),
      null,
      2,
    ),
  );

  // Eine Notiz daneben, damit man Monate spaeter weiss, was das hier ist.
  await writeFile(
    join(ZIEL, "INHALT.txt"),
    [
      "Hinterlegte Dateien der App Holzbau Groismaier",
      `Gesichert: ${new Date().toLocaleString("de-AT")}`,
      "",
      "Je Unterordner eine Ablage der App:",
      "  invoice-pdfs        die erzeugten Beleg-PDFs",
      "  project-photos      Baustellenfotos",
      "  disturbance-photos  Fotos aus Regieberichten",
      "  purchase-invoices   eingelesene Eingangsrechnungen",
      "  employee-documents  Mitarbeiterunterlagen",
      "  vehicle-documents   Fahrzeugpapiere",
      "  logos               Firmenlogos fuer die Belege",
      "  … sowie weitere",
      "",
      "Zum Zurueckspielen: skripte/dateien-zurueckspielen.mjs",
      "",
      "Diese Dateien enthalten personenbezogene Daten.",
      "Verschluesselt aufbewahren, nicht offen in einer Cloud liegen lassen.",
      "",
    ].join("\n"),
  );

  console.log(`\n${"─".repeat(46)}`);
  console.log(`Ablagen geprueft: ${ablagen.length}`);
  console.log(`Neu geladen:      ${gesamtNeu} Datei(en), ${mb(gesamtBytes)} MB`);
  console.log(`Schon vorhanden:  ${gesamtUeber}`);

  // Zweites Sicherheitsnetz: Ablagen gefunden, aber ueberall null Dateien —
  // dann greifen die Zugriffsregeln, und die Sicherung ist wertlos.
  if (gesamtNeu === 0 && gesamtUeber === 0) {
    console.error(
      "\nKEINE EINZIGE DATEI gesichert, obwohl Ablagen vorhanden sind.\n" +
      "  Vermutlich reicht der Schluessel nicht aus (service_role noetig).\n" +
      "  Diese Sicherung ist NICHT brauchbar.",
    );
    process.exit(1);
  }
  if (fehler.length > 0) {
    console.log(`\n${fehler.length} Datei(en) nicht ladbar:`);
    for (const f of fehler.slice(0, 10)) console.log(`  ${f}`);
    if (fehler.length > 10) console.log(`  … und ${fehler.length - 10} weitere`);
    process.exitCode = 1;
  } else {
    console.log("\nSicherung vollstaendig.");
  }
}

main().catch((e) => {
  console.error(`\nAbgebrochen: ${e.message}`);
  process.exit(1);
});
