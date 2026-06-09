/** Settings for customizable invoice/quote layout (Briefkopf, Footer, Texte) */

export interface InvoiceLayoutCompany {
  name: string;
  slogan: string;
  address_line1: string;
  address_line2: string;
  phone: string;
  email: string;
  website: string;
}

export interface InvoiceLayoutLogo {
  enabled: boolean;
  position: "left" | "right" | "center";
  width_mm: number;
  height_mm: number;
  /**
   * Zusätzlicher horizontaler Versatz in mm. Nur wirksam bei
   * position = "left" (Logo wird weiter nach rechts geschoben).
   * Default 0 = bündig zum Content-Margin.
   */
  offset_x_mm?: number;
}

export interface InvoiceLayoutFooter {
  line1: string;
  line2: string;
  line3: string;
  show_bank_in_footer: boolean;
  show_page_numbers: boolean;
}

export interface InvoiceLayoutContact {
  /** Name des Ansprechpartners, der auf dem Dokument genannt wird. */
  name: string;
  phone: string;
  email: string;
}

export interface InvoiceLayoutSettings {
  company: InvoiceLayoutCompany;
  logo: InvoiceLayoutLogo;
  footer: InvoiceLayoutFooter;
  sender_line: string;
  closing_text_invoice: string;
  closing_text_angebot: string;
  danke_text: string;
  accent_color: string;
  contact: InvoiceLayoutContact;
}

export const DEFAULT_LAYOUT: InvoiceLayoutSettings = {
  company: {
    name: "Holzbau Groismaier GmbH",
    slogan: "Zimmerei & Holzbau",
    address_line1: "Dallein 43",
    address_line2: "3753 Dallein",
    phone: "+43 (0) 664 4520 758",
    email: "office@cg-holzbau.at",
    website: "www.cg-holzbau.at",
  },
  logo: {
    enabled: true,
    position: "right",
    // Das Holzbau-Groismaier-Logo ist ein hochformatiges Lockup (Würfel +
    // "HOLZBAU GROISMAIER"). Auf dem Original-Briefpapier steht es oben
    // rechts. Die Höhe wird in pdfGenerator aus dem Seitenverhältnis
    // abgeleitet — ~34 mm Breite: prominent, ohne den Briefkopf zu
    // überladen.
    width_mm: 34,
    height_mm: 34,
    offset_x_mm: 0,
  },
  footer: {
    line1: "",
    line2: "",
    line3: "",
    show_bank_in_footer: true,
    show_page_numbers: true,
  },
  sender_line: "",
  closing_text_invoice: "Wir bitten um Überweisung innerhalb von {{tage}} Tagen auf das unten angegebene Konto.",
  closing_text_angebot: "Dieses Angebot ist bis zum {{gueltig_bis}} gültig. Wir freuen uns auf Ihren Auftrag!",
  danke_text: "Vielen Dank für Ihren Auftrag!",
  accent_color: "#002337", /* Holzbau Groismaier Navy (exakt aus Logo) */
  contact: { name: "Christian Groismaier", phone: "+43 (0) 664 4520 758", email: "office@cg-holzbau.at" },
};

/** Known legacy accent colors that should auto-migrate to Holzbau Groismaier Navy */
const LEGACY_ACCENT_COLORS = new Set([
  "#E08A20", "#e08a20", // MONTI.PRO Orange (original)
  "#1F3A5F", "#1f3a5f", // BKS Dunkelblau (legacy)
  "#0077CC", "#0077cc", // BKS Blau (legacy)
  "#1C6B4C", "#1c6b4c", // Interim-Grün (vor Logo-Abgleich)
  "#0E5A44", "#0e5a44", // Holzbau Lutz Tannengrün (Basis-App)
]);

/** Safely parse layout settings JSON, merging with defaults for missing fields */
export function parseLayoutSettings(value: string | null | undefined): InvoiceLayoutSettings {
  if (!value) return { ...DEFAULT_LAYOUT };
  try {
    const parsed = JSON.parse(value);
    let accent = parsed.accent_color ?? DEFAULT_LAYOUT.accent_color;
    if (LEGACY_ACCENT_COLORS.has(accent)) accent = DEFAULT_LAYOUT.accent_color;

    // Logo-Breite. Neuer Default 110 mm (siehe DEFAULT_LAYOUT). Für
    // Bestands-User, die den alten 140-mm-Default noch gespeichert
    // haben, wird automatisch auf 110 mm zurückgedreht — damit neben
    // dem Logo wieder Platz für Adresse/UID ist. User mit explizit
    // abweichender Breite (z.B. 80 mm) bleiben unverändert.
    const parsedLogo = { ...(parsed.logo || {}) };
    const savedWidth = Number(parsedLogo.width_mm);
    if (!savedWidth) {
      parsedLogo.width_mm = DEFAULT_LAYOUT.logo.width_mm;
      parsedLogo.height_mm = DEFAULT_LAYOUT.logo.height_mm;
    } else if (savedWidth >= 130 && savedWidth <= 145) {
      // war der alte 140-mm-Default → auf neuen Default zurück
      parsedLogo.width_mm = DEFAULT_LAYOUT.logo.width_mm;
      parsedLogo.height_mm = DEFAULT_LAYOUT.logo.height_mm;
    }
    // Horizontal-Offset: Bestandsdaten haben das Feld nicht — Default 0.
    if (parsedLogo.offset_x_mm === undefined || parsedLogo.offset_x_mm === null) {
      parsedLogo.offset_x_mm = 0;
    }

    return {
      company: { ...DEFAULT_LAYOUT.company, ...(parsed.company || {}) },
      logo: { ...DEFAULT_LAYOUT.logo, ...parsedLogo },
      footer: { ...DEFAULT_LAYOUT.footer, ...(parsed.footer || {}) },
      sender_line: parsed.sender_line ?? DEFAULT_LAYOUT.sender_line,
      closing_text_invoice: parsed.closing_text_invoice ?? DEFAULT_LAYOUT.closing_text_invoice,
      closing_text_angebot: parsed.closing_text_angebot ?? DEFAULT_LAYOUT.closing_text_angebot,
      danke_text: parsed.danke_text ?? DEFAULT_LAYOUT.danke_text,
      accent_color: accent,
      contact: { ...DEFAULT_LAYOUT.contact, ...(parsed.contact || {}) },
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

/** Build sender line from company data if not manually set */
export function buildSenderLine(c: InvoiceLayoutCompany): string {
  return [c.name, c.address_line1, c.address_line2].filter(Boolean).join(" · ");
}

/** Build footer lines from company data if not manually set */
export function buildFooterLines(c: InvoiceLayoutCompany): { line1: string; line2: string } {
  const line1 = [c.name, c.slogan, c.address_line1, c.address_line2].filter(Boolean).join(" · ");
  const parts2 = [];
  if (c.phone) parts2.push("Tel: " + c.phone);
  if (c.email) parts2.push(c.email);
  if (c.website) parts2.push(c.website);
  return { line1, line2: parts2.join(" · ") };
}

/** Convert hex color to RGB tuple (default fallback: Holzbau Groismaier Navy #002337) */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) || 0,     // 0x00
    parseInt(clean.slice(2, 4), 16) || 35,    // 0x23
    parseInt(clean.slice(4, 6), 16) || 55,    // 0x37
  ];
}
