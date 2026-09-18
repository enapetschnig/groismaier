// ============================================================================
// Mail-Vorlagen für den Belegversand + Signaturen je Postfach
// (Kundenwunsch 18.09.2026: „Kann ich den Standard-Text, der beim Mail-
// Versenden aus einem Angebot oder einer Rechnung erscheint, irgendwo selbst
// einstellen? Meine Mailsignatur muss noch rein.")
//
// Bis dahin stand der Mailtext fest im Code (BelegMailDialog) und endete mit
// „Mit freundlichen Grüßen / Holzbau Groismaier GmbH"; die Signaturen der
// Postfächer lagen als Konstanten in der Mail-Maske.
//
// Ablage in document_texts (Admin → Rechnungs-Layout → Textbausteine):
//   typ = Belegtyp (angebot, rechnung, …)   feld = mail_betreff | mail_text
//   typ = "mail"                             feld = mail_betreff | mail_text
//                                             (Standard für alle Belegtypen)
//   typ = "mail"                             feld = signatur:<postfach-adresse>
// Leer → eingebauter Standard (unten). Platzhalter siehe MAIL_PLATZHALTER.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

export const MAIL_TYP = "mail";
export const POSTFAECHER = [
  { adresse: "christian.groismaier@cg-holzbau.at", kurz: "Christian" },
  { adresse: "office@cg-holzbau.at", kurz: "Office" },
  { adresse: "buchhaltung@cg-holzbau.at", kurz: "Buchhaltung" },
] as const;

const FIRMEN_SIGNATUR = `-----------------------------------
HOLZBAU GROISMAIER GMBH
3753 Dallein 43

M +43 (0) 664 4520 758
T +43 (0) 2913 221 30

office@cg-holzbau.at
www.cg-holzbau.at
-----------------------------------`;

/** Eingebaute Signaturen — Wortlaut aus Christians eigenen Mails. */
export const STANDARD_SIGNATUREN: Record<string, string> = {
  "christian.groismaier@cg-holzbau.at": `Mit freundlichen Grüßen

Christian Groismaier
Holzbaumeister

${FIRMEN_SIGNATUR}`,
};
export const standardSignatur = (postfach: string): string =>
  STANDARD_SIGNATUREN[postfach] || `Mit freundlichen Grüßen

${FIRMEN_SIGNATUR}`;

export const STANDARD_MAIL_BETREFF = "{{belegbezeichnung}} {{nummer}}";
export const STANDARD_MAIL_TEXT = `{{anrede}}

anbei erhalten Sie {{belegbezeichnung}} {{nummer}}.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

{{signatur}}`;

export const MAIL_PLATZHALTER = [
  { name: "{{anrede}}", hinweis: "Sehr geehrte Frau Salat, / Sehr geehrter Herr … / Sehr geehrte Damen und Herren," },
  { name: "{{belegbezeichnung}}", hinweis: "Angebot, Rechnung, Anzahlungsrechnung …" },
  { name: "{{nummer}}", hinweis: "Belegnummer, z. B. 2026-044" },
  { name: "{{kunde_name}}", hinweis: "Name des Kunden" },
  { name: "{{datum}}", hinweis: "heutiges Datum" },
  { name: "{{signatur}}", hinweis: "Signatur des sendenden Postfachs (siehe unten)" },
];

export interface MailVorlagen {
  /** typ → { mail_betreff, mail_text } — typ „mail" ist der Standard für alle. */
  texte: Record<string, { mail_betreff?: string; mail_text?: string }>;
  /** postfach-adresse → Signatur (nur wenn im Admin hinterlegt). */
  signaturen: Record<string, string>;
}

export const LEERE_VORLAGEN: MailVorlagen = { texte: {}, signaturen: {} };

export const signaturFuer = (postfach: string, vorlagen: MailVorlagen = LEERE_VORLAGEN): string =>
  (vorlagen.signaturen[postfach] || "").trim() || standardSignatur(postfach);

export function anredeFuer(kundeAnrede: string | null | undefined, kundeName: string | null | undefined): string {
  const nachname = (kundeName || "").trim().split(/\s+/).slice(-1)[0] || "";
  if (kundeAnrede === "Frau" && nachname) return `Sehr geehrte Frau ${nachname},`;
  if (kundeAnrede === "Herr" && nachname) return `Sehr geehrter Herr ${nachname},`;
  return "Sehr geehrte Damen und Herren,";
}

export interface BelegMailArgs {
  belegTyp?: string | null;
  belegBezeichnung: string;
  belegNummer: string;
  kundeAnrede?: string | null;
  kundeName?: string | null;
  postfach: string;
  vorlagen?: MailVorlagen;
  heute?: Date;
}

/** Vorlage für einen Belegtyp: erst der Typ, dann „mail" (alle), dann eingebaut. */
export function vorlageFuer(vorlagen: MailVorlagen, belegTyp: string | null | undefined, feld: "mail_betreff" | "mail_text"): string {
  const typ = (belegTyp || "").trim();
  const eigen = typ ? (vorlagen.texte[typ]?.[feld] || "").trim() : "";
  if (eigen) return eigen;
  const allgemein = (vorlagen.texte[MAIL_TYP]?.[feld] || "").trim();
  if (allgemein) return allgemein;
  return feld === "mail_betreff" ? STANDARD_MAIL_BETREFF : STANDARD_MAIL_TEXT;
}

export function platzhalterEinsetzen(vorlage: string, werte: Record<string, string>): string {
  return vorlage.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => werte[k.toLowerCase()] ?? "")
    // Doppelte Leerzeichen/Leerzeilen durch leere Platzhalter (z. B. keine Nummer beim Entwurf) glätten
    .replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").replace(/ \./g, ".").replace(/\n{3,}/g, "\n\n").trim();
}

/** Betreff und Text der Beleg-Mail aus Vorlagen + Belegdaten. */
export function baueBelegMail(a: BelegMailArgs): { betreff: string; text: string } {
  const vorlagen = a.vorlagen || LEERE_VORLAGEN;
  const werte: Record<string, string> = {
    anrede: anredeFuer(a.kundeAnrede, a.kundeName),
    belegbezeichnung: (a.belegBezeichnung || "").trim(),
    nummer: (a.belegNummer || "").trim(),
    kunde_name: (a.kundeName || "").trim(),
    datum: (a.heute || new Date()).toLocaleDateString("de-AT"),
    signatur: signaturFuer(a.postfach, vorlagen),
  };
  return {
    betreff: platzhalterEinsetzen(vorlageFuer(vorlagen, a.belegTyp, "mail_betreff"), werte).replace(/\n+/g, " "),
    text: platzhalterEinsetzen(vorlageFuer(vorlagen, a.belegTyp, "mail_text"), werte),
  };
}

/** Text mit alter Signatur → Text mit neuer Signatur (Postfachwechsel im Dialog). */
export function signaturTauschen(text: string, alt: string, neu: string): string {
  const t = text.replace(/\s+$/, "");
  return t.endsWith(alt) ? t.slice(0, -alt.length) + neu : text;
}

// ── Datenbank ────────────────────────────────────────────────────────────────

let cache: { wert: MailVorlagen; bis: number } | null = null;
export function mailVorlagenVergessen(): void { cache = null; }

/** Vorlagen und Signaturen laden — bei Fehler (z. B. fehlende Rechte) die Standards. */
export async function ladeMailVorlagen(): Promise<MailVorlagen> {
  if (cache && Date.now() < cache.bis) return cache.wert;
  const out: MailVorlagen = { texte: {}, signaturen: {} };
  try {
    const { data } = await (supabase.from("document_texts" as never) as any)
      .select("typ, feld, inhalt").eq("sprache", "de")
      .or("feld.eq.mail_betreff,feld.eq.mail_text,feld.like.signatur:%");
    for (const r of ((data as any[]) || [])) {
      const inhalt = String(r.inhalt || "");
      if (!inhalt.trim()) continue;
      if (r.typ === MAIL_TYP && String(r.feld).startsWith("signatur:")) out.signaturen[String(r.feld).slice("signatur:".length)] = inhalt;
      else if (r.feld === "mail_betreff" || r.feld === "mail_text") (out.texte[r.typ] ||= {})[r.feld as "mail_betreff" | "mail_text"] = inhalt;
    }
  } catch { /* Standards */ }
  cache = { wert: out, bis: Date.now() + 60_000 };
  return out;
}
