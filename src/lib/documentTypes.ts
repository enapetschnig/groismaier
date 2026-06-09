// Zentrale Konfiguration aller Dokumenttypen.
// Wird von pdfGenerator.ts, invoiceHtml.ts und InvoiceDetail genutzt.

export type DocumentTyp =
  | "angebot"
  | "auftragsbestaetigung"
  | "rechnung"
  | "anzahlungsrechnung"
  | "schlussrechnung"
  | "lieferschein"
  | "gutschrift";

export interface DocConfig {
  typ: DocumentTyp;
  /** Menschlich-lesbarer Titel im PDF-Header / in der Liste. */
  label: string;
  /** "Rechnung"-Charakter: hat Fälligkeit, Bankverbindung, Zahlungsbedingungen. */
  isInvoiceLike: boolean;
  /** Kein Angebotscharakter (nicht verbindlich). */
  isAngebotLike: boolean;
  /** Lieferschein: keine Preise in der Tabelle, nur Mengen. */
  hidePrices: boolean;
  /** Zeige Fälligkeits-/Skonto-/Bankdaten. */
  showPaymentSection: boolean;
  /** Zeige Leistungszeitraum (Anfangs- + optional Enddatum). */
  showLeistungsdatum: boolean;
  /** Kurzbadge für die Liste. */
  shortLabel: string;
}

const ALL_CONFIGS: Record<DocumentTyp, DocConfig> = {
  angebot: {
    typ: "angebot",
    label: "Angebot",
    shortLabel: "AN",
    isInvoiceLike: false,
    isAngebotLike: true,
    hidePrices: false,
    showPaymentSection: false,
    showLeistungsdatum: true,
  },
  auftragsbestaetigung: {
    typ: "auftragsbestaetigung",
    label: "Auftragsbestätigung",
    shortLabel: "AB",
    isInvoiceLike: false,
    isAngebotLike: true,
    hidePrices: false,
    showPaymentSection: false,
    showLeistungsdatum: true,
  },
  rechnung: {
    typ: "rechnung",
    label: "Rechnung",
    shortLabel: "RE",
    isInvoiceLike: true,
    isAngebotLike: false,
    hidePrices: false,
    showPaymentSection: true,
    showLeistungsdatum: true,
  },
  anzahlungsrechnung: {
    typ: "anzahlungsrechnung",
    label: "Anzahlungsrechnung",
    shortLabel: "AR",
    isInvoiceLike: true,
    isAngebotLike: false,
    hidePrices: false,
    showPaymentSection: true,
    showLeistungsdatum: true,
  },
  schlussrechnung: {
    typ: "schlussrechnung",
    label: "Schlussrechnung",
    shortLabel: "SR",
    isInvoiceLike: true,
    isAngebotLike: false,
    hidePrices: false,
    showPaymentSection: true,
    showLeistungsdatum: true,
  },
  lieferschein: {
    typ: "lieferschein",
    label: "Lieferschein",
    shortLabel: "LS",
    isInvoiceLike: false,
    isAngebotLike: false,
    hidePrices: true,
    showPaymentSection: false,
    showLeistungsdatum: true,
  },
  gutschrift: {
    typ: "gutschrift",
    label: "Gutschrift",
    shortLabel: "GS",
    isInvoiceLike: true,
    isAngebotLike: false,
    hidePrices: false,
    showPaymentSection: false,
    showLeistungsdatum: true,
  },
};

export function getDocConfig(typ: string | null | undefined): DocConfig {
  if (typ && typ in ALL_CONFIGS) {
    return ALL_CONFIGS[typ as DocumentTyp];
  }
  // Fallback: alte Werte / unbekannte Typen werden als Rechnung behandelt
  return ALL_CONFIGS.rechnung;
}

export function listDocTypes(): DocConfig[] {
  return Object.values(ALL_CONFIGS);
}

/**
 * Variablen in Textbausteinen ersetzen. Unbekannte Variablen bleiben stehen.
 */
export function interpolateText(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_m, key) => {
    const v = vars[key];
    return v == null ? `{{${key}}}` : String(v);
  });
}
