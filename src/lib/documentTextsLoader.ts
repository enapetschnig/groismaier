// Lädt editierbare Textbausteine (document_texts) für einen Dokumenttyp
// und setzt sie — mit Platzhalter-Interpolation — auf ein Invoice-Objekt,
// sodass pdfGenerator / invoiceHtml sie rendern können.

import { supabase } from "@/integrations/supabase/client";
import { interpolateText } from "./documentTypes";

export interface DocumentTexts {
  intro?: string;
  closing?: string;
  zahlungsbedingungen?: string;
  anzahlung_hinweis?: string;
}

/**
 * Zahlungsfrist eines Belegs als Text für den Baustein-Platzhalter.
 *
 * Kundenmeldung 01.09.2026 (Schlussrechnung 2026-046): „die Zeile mit
 * ‚14 Tagen' bleibt immer drin". Ursache: Alle Aufrufer setzten {{tage}}
 * pauschal auf 14, sobald in den Zahlungsbedingungen keine Zahl stand —
 * also gerade bei „sofort". Der Baustein „… ist innerhalb {{tage}} Tagen
 * fällig" widersprach dann dem Zahlungs-Satz „Zahlbar sofort".
 *
 * Jetzt ist die Zahlungsbedingung des Belegs die eine Wahrheit:
 *   sofort/umgehend/prompt      → „sofort"
 *   individuell + Fälligkeitsdatum → „bis zum 15.09.2026"
 *   Zahl in den Bedingungen     → diese Zahl
 *   sonst                       → Vorgabe des Aufrufers (Standard 14)
 */
export function zahlungsfristAusBeleg(
  beleg: { zahlungsbedingungen?: string | null; faellig_am?: string | null },
  vorgabeTage = 14,
): { art: "sofort" | "datum" | "tage"; tage: number; datum: string } {
  const zb = String(beleg.zahlungsbedingungen || "").trim();
  if (/sofort|umgehend|prompt/i.test(zb)) return { art: "sofort", tage: 0, datum: "" };
  if (/individuell/i.test(zb) && beleg.faellig_am) {
    return { art: "datum", tage: 0, datum: formatDateAT(beleg.faellig_am) };
  }
  const m = zb.match(/(\d+)/);
  if (m) return { art: "tage", tage: Number(m[1]), datum: "" };
  return { art: "tage", tage: vorgabeTage, datum: "" };
}

/**
 * Setzt die Fristformulierung im Baustein: „innerhalb {{tage}} Tagen" wird
 * bei „sofort" zu „sofort", bei individuellem Datum zu „bis zum <Datum>";
 * sonst bleibt der Platzhalter und wird mit der echten Zahl gefüllt.
 */
export function fristInText(text: string, frist: ReturnType<typeof zahlungsfristAusBeleg>): string {
  const muster = /innerhalb\s+(?:von\s+)?\{\{tage\}\}\s+Tagen/gi;
  if (frist.art === "sofort") return text.replace(muster, "sofort");
  if (frist.art === "datum") return text.replace(muster, `bis zum ${frist.datum}`);
  return text;
}

/** Lädt alle Textbausteine für (typ, sprache) aus der document_texts-Tabelle. */
export async function loadDocumentTexts(typ: string, sprache = "de"): Promise<DocumentTexts> {
  if (!typ) return {};
  const { data } = await supabase
    .from("document_texts")
    .select("feld, inhalt")
    .eq("typ", typ)
    .eq("sprache", sprache);
  const out: DocumentTexts = {};
  for (const row of ((data as any[]) || [])) {
    const inhalt = (row.inhalt || "").toString().trim();
    if (inhalt) (out as any)[row.feld] = inhalt;
  }
  return out;
}

/**
 * Hängt Textbausteine an ein Invoice-Objekt an. Nutzt interpolateText für
 * {{kunde_name}}, {{prozent}}, {{tage}} etc.
 * Gesetzt werden die "custom_*_text"-Felder, die pdfGenerator und invoiceHtml
 * bereits als Override unterstützen (bzw. jetzt unterstützen sollen).
 */
// ISO-Datum (YYYY-MM-DD) → de-AT-Format (DD.MM.YYYY).
// Defensiv: leere/ungültige Werte werden zu "" zurückgegeben.
function formatDateAT(d: unknown): string {
  if (!d) return "";
  const s = String(d);
  try {
    return new Date(s + "T12:00:00").toLocaleDateString("de-AT");
  } catch {
    return s;
  }
}

export function applyDocumentTextsToInvoice<T extends object>(
  invoice: T,
  texts: DocumentTexts,
  extraVars: Record<string, string | number | null | undefined> = {},
): T {
  // Default-Werte aus dem Invoice selbst. extraVars überschreibt diese
  // (z. B. setzt der AB-Convert-Pfad in InvoiceDetail.tsx angebot_nr +
  // angebot_datum auf die Werte des Quell-Angebots).
  const eigenesDatum = formatDateAT((invoice as any).datum);
  // Zahlungsfrist aus dem Beleg selbst — nicht aus einem pauschalen „14".
  const frist = zahlungsfristAusBeleg(invoice as any, Number(extraVars.tage) || 14);
  const vars: Record<string, string | number | null | undefined> = {
    kunde_name: (invoice as any).kunde_name,
    rechnung_nr: (invoice as any).nummer,
    rechnung_datum: eigenesDatum,
    ab_nr: (invoice as any).nummer,
    ab_datum: eigenesDatum,
    angebot_nr: (invoice as any).nummer,
    angebot_datum: eigenesDatum,
    datum: eigenesDatum,
    betrag: (invoice as any).brutto_summe,
    prozent: (invoice as any).anzahlung_prozent,
    ...extraVars,
    // Die Frist aus dem Beleg gewinnt IMMER gegen die Aufrufer-Vorgabe.
    tage: frist.tage,
  };
  const merged: any = { ...invoice };
  // Beleg-eigene Texte (KingBill Vortext/Schlusstext) haben Vorrang: nur wenn
  // der Beleg KEINEN eigenen Text trägt, wird der Standardtext des Typs
  // eingesetzt. Sonst überschriebe die Vorlage die manuelle Bearbeitung.
  const hatEigenen = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  if (texts.intro && !hatEigenen(merged.custom_intro_text)) {
    merged.custom_intro_text = interpolateText(texts.intro, vars);
  }
  if (texts.closing && !hatEigenen(merged.custom_closing_text)) {
    merged.custom_closing_text = interpolateText(fristInText(texts.closing, frist), vars);
  }
  if (texts.anzahlung_hinweis && !hatEigenen(merged.custom_anzahlung_hinweis)) {
    merged.custom_anzahlung_hinweis = interpolateText(texts.anzahlung_hinweis, vars);
  }
  return merged as T;
}
