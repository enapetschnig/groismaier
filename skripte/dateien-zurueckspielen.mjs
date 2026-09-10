#!/usr/bin/env node
// ============================================================================
// Gesicherte Dateien in ein Supabase-Projekt zurueckspielen
//
// Gegenstueck zu dateien-sichern.mjs. Gebraucht wird es in genau zwei Faellen:
// beim Neuaufbau nach einem Totalausfall und beim Befuellen einer Spielwiese.
//
// ── Aufruf ──────────────────────────────────────────────────────────────────
//
//   SUPABASE_URL="https://<kennung>.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
//   node skripte/dateien-zurueckspielen.mjs ~/Sicherung/dateien
//
// Erst ein Trockenlauf, der nur zeigt was passieren wuerde:
//   … node skripte/dateien-zurueckspielen.mjs ~/Sicherung/dateien --probe
//
// ── Wichtig ─────────────────────────────────────────────────────────────────
//
// Vorhandene Dateien werden NICHT ueberschrieben. Das Skript kann also gegen
// ein teilweise gefuelltes Projekt laufen, ohne Schaden anzurichten.
//
// Die URL zweimal pruefen, bevor man es startet: Auf das PRODUKTIVE Projekt
// gehoert es nur beim echten Neuaufbau.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const QUELLE = process.argv[2];
const PROBE = process.argv.includes("--probe");

if (!URL || !KEY || !QUELLE) {
  console.error(`
Fehlende Angaben.

  SUPABASE_URL="https://<kennung>.supabase.co" \\
  SUPABASE_SERVICE_ROLE_KEY="<service role key>" \\
  node skripte/dateien-zurueckspielen.mjs <quellordner> [--probe]
`);
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const TYPEN = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", heic: "image/heic", gif: "image/gif",
  svg: "image/svg+xml", csv: "text/csv", txt: "text/plain", json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const typVon = (n) => TYPEN[n.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** Alle Dateien unterhalb eines Ordners, relativ zu ihm. */
async function alleDateien(wurzel, unter = "") {
  const raus = [];
  for (const eintrag of await readdir(join(wurzel, unter), { withFileTypes: true })) {
    if (eintrag.name.startsWith(".") || eintrag.name.startsWith("_")) continue;
    if (eintrag.name === "INHALT.txt") continue;
    const p = unter ? join(unter, eintrag.name) : eintrag.name;
    if (eintrag.isDirectory()) raus.push(...(await alleDateien(wurzel, p)));
    else raus.push(p);
  }
  return raus;
}

async function main() {
  console.log(`Quelle: ${QUELLE}`);
  console.log(`Ziel:   ${URL}`);
  if (PROBE) console.log("\n*** TROCKENLAUF — es wird nichts geschrieben ***");
  console.log();

  // Eigenschaften der Ablagen, falls mitgesichert. Ohne diese Datei wird jede
  // Ablage vorsichtshalber NICHT oeffentlich angelegt — lieber zu streng.
  let eigenschaften = [];
  try {
    eigenschaften = JSON.parse(await readFile(join(QUELLE, "_ablagen.json"), "utf8"));
  } catch {
    console.log("Hinweis: _ablagen.json fehlt — alle Ablagen werden nicht-oeffentlich angelegt.\n");
  }
  const eigenschaftVon = (name) => eigenschaften.find((a) => a.name === name);

  const { data: vorhandene } = await db.storage.listBuckets();
  const daSchon = new Set((vorhandene ?? []).map((b) => b.name));

  const ablagen = (await readdir(QUELLE, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);

  let gesamtNeu = 0, gesamtUeber = 0;
  const fehler = [];

  for (const ablage of ablagen) {
    // Ablage anlegen, falls sie fehlt.
    if (!daSchon.has(ablage)) {
      const e = eigenschaftVon(ablage);
      if (PROBE) {
        console.log(`${ablage}: wuerde angelegt (oeffentlich: ${e?.public ? "ja" : "nein"})`);
      } else {
        const { error } = await db.storage.createBucket(ablage, {
          public: e?.public ?? false,
          fileSizeLimit: e?.file_size_limit ?? undefined,
          allowedMimeTypes: e?.allowed_mime_types ?? undefined,
        });
        if (error) { fehler.push(`Ablage ${ablage}: ${error.message}`); continue; }
        console.log(`${ablage}: angelegt (oeffentlich: ${e?.public ? "ja" : "nein"})`);
      }
    }

    const dateien = await alleDateien(join(QUELLE, ablage));
    process.stdout.write(`${ablage}: ${dateien.length} Datei(en) … `);

    let neu = 0, uebersprungen = 0;
    for (const rel of dateien) {
      const pfad = rel.split(sep).join("/");        // Windows-Trenner vereinheitlichen
      const voll = join(QUELLE, ablage, rel);

      if (PROBE) { neu++; continue; }

      const inhalt = await readFile(voll);
      const { error } = await db.storage.from(ablage).upload(pfad, inhalt, {
        contentType: typVon(pfad),
        upsert: false,                              // niemals ueberschreiben
      });
      if (error) {
        // "already exists" ist kein Fehler, sondern der Normalfall beim
        // zweiten Lauf — und genau das Verhalten, das wir wollen.
        if (/exists|duplicate/i.test(error.message)) uebersprungen++;
        else fehler.push(`${ablage}/${pfad}: ${error.message}`);
        continue;
      }
      neu++;
      if (neu % 25 === 0) process.stdout.write(`\n   … ${neu} hochgeladen`);
    }
    console.log(`\n   ✓ ${neu} ${PROBE ? "waeren neu" : "neu"}, ${uebersprungen} schon vorhanden`);
    gesamtNeu += neu;
    gesamtUeber += uebersprungen;
  }

  console.log(`\n${"─".repeat(46)}`);
  console.log(`${PROBE ? "Wuerden hochgeladen" : "Hochgeladen"}: ${gesamtNeu}`);
  console.log(`Schon vorhanden:     ${gesamtUeber}`);
  if (fehler.length > 0) {
    console.log(`\n${fehler.length} Fehler:`);
    for (const f of fehler.slice(0, 10)) console.log(`  ${f}`);
    if (fehler.length > 10) console.log(`  … und ${fehler.length - 10} weitere`);
    process.exitCode = 1;
  }
  if (PROBE) console.log("\nTrockenlauf beendet. Ohne --probe wird tatsaechlich geschrieben.");
}

main().catch((e) => {
  console.error(`\nAbgebrochen: ${e.message}`);
  process.exit(1);
});
