// Geteilter Helper, der die Zeilen der "Allgemeine Angaben"-Tabelle
// aus einem Invoice-Datenobjekt zusammenstellt. Wird von pdfGenerator
// (PDF) und invoiceHtml (HTML-Preview) gleichermaßen genutzt — damit
// PDF und Preview garantiert dieselben Werte rendern.
//
// Konvention: Zeilen mit leerem Wert werden weggefiltert. Wenn alle
// Zeilen leer sind (Helper liefert []), rendert der Aufrufer gar
// keine Tabelle — kein leerer Block im Dokument.

import { executingCompanyDisplay } from "@/lib/executingCompanies";

export interface AllgemeineAngabenRow {
  label: string;
  value: string; // mehrzeilig erlaubt — Renderer interpretiert "\n"
}

interface InvoiceLikeForAA {
  leistungsbeschreibung?: string | null;
  ausfuehrungsort?: string | null;
  ausfuehrungs_kw?: string | null;
  leistungsdatum?: string | null;
  leistungsdatum_bis?: string | null;
  ausfuehrende_firma?: string | null;
  ausfuehrende_firma_freitext?: string | null;
}

/** Formatiert ein ISO-Datum (YYYY-MM-DD) als deutsche Notation (DD.MM.YYYY). */
function formatDateAT(d: string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(String(d) + "T12:00:00").toLocaleDateString("de-AT");
  } catch {
    return String(d);
  }
}

/** Baut den Wert für Ausführungszeitraum: KW hat Vorrang, sonst von-bis. */
function buildZeitraumValue(invoice: InvoiceLikeForAA): string {
  const kw = (invoice.ausfuehrungs_kw || "").trim();
  if (kw) return kw;
  const von = formatDateAT(invoice.leistungsdatum);
  const bis = formatDateAT(invoice.leistungsdatum_bis);
  if (!von && !bis) return "";
  if (von && bis && von !== bis) return `${von} – ${bis}`;
  return von || bis;
}

/**
 * Baut die Zeilen der Allgemeine-Angaben-Tabelle in fester Reihenfolge:
 *   1) Leistungsbeschreibung
 *   2) Ausführungsort
 *   3) Ausführungszeitraum
 *   4) Ausführende Firma
 *
 * Leere Zeilen werden ausgefiltert; Reihenfolge bleibt sonst stabil.
 */
export function buildAllgemeineAngabenRows(invoice: InvoiceLikeForAA): AllgemeineAngabenRow[] {
  const all: AllgemeineAngabenRow[] = [
    { label: "Leistungsbeschreibung", value: (invoice.leistungsbeschreibung || "").trim() },
    { label: "Ausführungsort",        value: (invoice.ausfuehrungsort || "").trim() },
    { label: "Ausführungszeitraum",    value: buildZeitraumValue(invoice) },
    { label: "Ausführende Firma",      value: executingCompanyDisplay(invoice.ausfuehrende_firma, invoice.ausfuehrende_firma_freitext) },
  ];
  return all.filter((r) => !!r.value);
}
