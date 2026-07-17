// Gemeinsame Typen und Helfer für das Modul Finanzplanung (Liquiditätsvorschau).
//
// Hinweis: Die Tabelle `fixkosten` ist in den generierten Supabase-Typen noch
// nicht enthalten (Migration 20260716090100_fixkosten.sql). Queries laufen
// deshalb – wie an anderen Stellen im Projekt (z.B. admin_config_options,
// time_accounts) – über `(supabase.from("fixkosten" as never) as any)` und
// werden hier lokal typisiert.

export type FixkostenIntervall = "monatlich" | "quartalsweise" | "jaehrlich";

export interface Fixkosten {
  id: string;
  name: string;
  betrag: number;
  intervall: FixkostenIntervall;
  /** 1-12; für quartalsweise/jährlich der erste Fälligkeitsmonat, für monatlich null. */
  faellig_monat: number | null;
  faellig_tag: number | null;
  aktiv: boolean;
  notiz: string | null;
  created_at: string;
}

export const INTERVALL_LABELS: Record<FixkostenIntervall, string> = {
  monatlich: "Monatlich",
  quartalsweise: "Quartalsweise",
  jaehrlich: "Jährlich",
};

export const MONATE = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Anteilige monatliche Belastung eines Fixkosten-Eintrags (für Übersichten). */
export function monatlicheBelastung(fk: Pick<Fixkosten, "betrag" | "intervall">): number {
  const betrag = Number(fk.betrag) || 0;
  if (fk.intervall === "quartalsweise") return betrag / 3;
  if (fk.intervall === "jaehrlich") return betrag / 12;
  return betrag;
}

/**
 * Konkrete Fälligkeitstermine eines Fixkosten-Eintrags im Zeitraum [von, bis]
 * (beide inklusive). Der Fälligkeitstag wird auf die Monatslänge begrenzt
 * (Tag 31 im Februar → Monatsletzter).
 */
export function fixkostenTermine(fk: Fixkosten, von: Date, bis: Date): Date[] {
  const tag = fk.faellig_tag ?? 1;
  const startMonat = fk.faellig_monat ?? 1;

  let monate: number[]; // 1-12
  if (fk.intervall === "monatlich") {
    monate = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  } else if (fk.intervall === "quartalsweise") {
    monate = [0, 3, 6, 9].map((offset) => ((startMonat - 1 + offset) % 12) + 1);
  } else {
    monate = [startMonat];
  }

  const termine: Date[] = [];
  for (let jahr = von.getFullYear(); jahr <= bis.getFullYear(); jahr++) {
    for (const monat of monate) {
      const tageImMonat = new Date(jahr, monat, 0).getDate();
      const termin = new Date(jahr, monat - 1, Math.min(tag, tageImMonat));
      if (termin >= von && termin <= bis) termine.push(termin);
    }
  }
  return termine.sort((a, b) => a.getTime() - b.getTime());
}

/** Betrag als Euro-String im deutschen Format ("1.234,56 €"). */
export function eur(betrag: number): string {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(betrag);
}
