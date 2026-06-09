/**
 * Konfiguration für Mahnungen.
 * Wird im Admin-Bereich editiert und bei der PDF-Generierung verwendet.
 *
 * Platzhalter im Text:
 *   {{tage}}           — Frist in Tagen aus dieser Stufe
 *   {{rechnungsnummer}}— Rechnungsnummer
 *   {{betrag}}         — Offener Betrag (z.B. "€ 1.234,56")
 */
import { supabase } from "@/integrations/supabase/client";

export interface MahnungStufe {
  /** Titel oben im PDF */
  titel: string;
  /** Frist in Tagen bis zur Zahlung */
  frist_tage: number;
  /** Mahngebühr in EUR (0 = keine) */
  gebuehr: number;
  /** Anschreibe-Text. Darf {{tage}}/{{rechnungsnummer}}/{{betrag}} enthalten */
  text: string;
}

export interface MahnungSettings {
  stufen: [MahnungStufe, MahnungStufe, MahnungStufe];
}

export const DEFAULT_MAHNUNG_SETTINGS: MahnungSettings = {
  stufen: [
    {
      titel: "Zahlungserinnerung",
      frist_tage: 7,
      gebuehr: 0,
      text:
        "Sehr geehrte Damen und Herren,\n\n" +
        "bei der Überprüfung unserer Konten haben wir festgestellt, dass die folgende Rechnung noch nicht beglichen wurde. Möglicherweise handelt es sich um ein Versehen.\n\n" +
        "Wir bitten Sie freundlich, den offenen Betrag innerhalb der nächsten {{tage}} Tage zu überweisen.",
    },
    {
      titel: "2. Mahnung",
      frist_tage: 7,
      gebuehr: 5,
      text:
        "Sehr geehrte Damen und Herren,\n\n" +
        "trotz unserer Zahlungserinnerung ist die folgende Rechnung weiterhin offen. Wir bitten Sie dringend, den ausstehenden Betrag innerhalb von {{tage}} Tagen zu begleichen.\n\n" +
        "Für diese Mahnung erlauben wir uns eine Mahngebühr zu verrechnen.",
    },
    {
      titel: "Letzte Mahnung",
      frist_tage: 5,
      gebuehr: 10,
      text:
        "Sehr geehrte Damen und Herren,\n\n" +
        "trotz wiederholter Aufforderung ist die nachstehende Rechnung noch immer unbeglichen. Wir fordern Sie hiermit letztmalig auf, den offenen Betrag innerhalb von {{tage}} Werktagen zu überweisen.\n\n" +
        "Sollte die Zahlung nicht fristgerecht eingehen, sehen wir uns gezwungen, rechtliche Schritte einzuleiten.",
    },
  ],
};

/** Lädt die Mahnung-Einstellungen aus app_settings, fällt auf Defaults zurück. */
export async function loadMahnungSettings(): Promise<MahnungSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "mahnung_settings")
    .maybeSingle();
  return parseMahnungSettings((data as any)?.value);
}

/** Parst gespeicherten JSON-String. Fehlende Felder werden aus Defaults gefüllt. */
export function parseMahnungSettings(value: string | null | undefined): MahnungSettings {
  if (!value) return JSON.parse(JSON.stringify(DEFAULT_MAHNUNG_SETTINGS));
  try {
    const parsed = JSON.parse(value);
    const result: MahnungSettings = JSON.parse(JSON.stringify(DEFAULT_MAHNUNG_SETTINGS));
    if (Array.isArray(parsed?.stufen)) {
      for (let i = 0; i < 3 && i < parsed.stufen.length; i++) {
        const s = parsed.stufen[i];
        if (s?.titel) result.stufen[i].titel = s.titel;
        if (typeof s?.frist_tage === "number") result.stufen[i].frist_tage = s.frist_tage;
        if (typeof s?.gebuehr === "number") result.stufen[i].gebuehr = s.gebuehr;
        if (typeof s?.text === "string") result.stufen[i].text = s.text;
      }
    }
    return result;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_MAHNUNG_SETTINGS));
  }
}

/** Platzhalter im Mahnungstext ersetzen. */
export function renderMahnungText(
  template: string,
  ctx: { tage: number; rechnungsnummer: string; betrag: string },
): string {
  return template
    .replace(/\{\{\s*tage\s*\}\}/g, String(ctx.tage))
    .replace(/\{\{\s*rechnungsnummer\s*\}\}/g, ctx.rechnungsnummer)
    .replace(/\{\{\s*betrag\s*\}\}/g, ctx.betrag);
}
