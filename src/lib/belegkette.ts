/**
 * Belegkette — Auftragsbestätigung → Anzahlungsrechnung(en) → Schlussrechnung.
 *
 * Die Kette läuft über invoices.parent_invoice_id. Diese Bibliothek ist die
 * EINE Stelle, die Ketten gruppiert und richtig summiert; Offene Posten und
 * der Beleg-Editor bauen darauf auf.
 *
 * Die Stolperfalle bei den Summen (Audit-Befund „Anzahlung doppelt gezählt"):
 * Die Schlussrechnung führt den Anzahlungsabzug als steuerfreie Bruttozeile.
 * Deshalb gilt:
 *   - brutto_summe der SR = RESTBETRAG      → brutto/offen ROH summieren
 *   - netto_summe der SR  = VOLLER Auftrag  → netto/mwst der Anzahlungen
 *     derselben Kette NICHT dazuzählen (sonst doppelt)
 * Dieselbe Semantik wie bereitsInSchlussrechnung in lib/nachkalkulation.ts.
 */

export interface KettenBeleg {
  id: string;
  typ: string;
  status: string;
  netto_summe: number | null;
  mwst_betrag?: number | null;
  brutto_summe?: number | null;
  bezahlt_betrag?: number | null;
  parent_invoice_id: string | null;
}

const zahl = (n: number | null | undefined): number => Number(n) || 0;

/**
 * Wurzel eines Belegs — folgt parent_invoice_id nach oben, solange der
 * Elternbeleg mitgeladen wurde. Zyklen-sicher.
 */
export function wurzelVon(belege: Map<string, KettenBeleg>, id: string): string {
  let aktuell = id;
  const gesehen = new Set<string>();
  while (!gesehen.has(aktuell)) {
    gesehen.add(aktuell);
    const b = belege.get(aktuell);
    if (!b?.parent_invoice_id) break;
    // Elternbeleg nicht mitgeladen (z. B. nur Rechnungen abgefragt, die AB
    // nicht): trotzdem seine ID als Kettenschlüssel verwenden — Anzahlung
    // und Schlussrechnung desselben Auftrags zeigen auf denselben Elternteil
    // und MÜSSEN zusammenfinden, sonst wird die Anzahlung doppelt gezählt.
    if (!belege.has(b.parent_invoice_id)) return b.parent_invoice_id;
    aktuell = b.parent_invoice_id;
  }
  return aktuell;
}

/** Alle Belege nach ihrer Kettenwurzel gruppiert. */
export function kettenIndex<B extends KettenBeleg>(belege: B[]): Map<string, B[]> {
  const map = new Map<string, KettenBeleg>(belege.map((b) => [b.id, b]));
  const gruppen = new Map<string, B[]>();
  for (const b of belege) {
    const wurzel = wurzelVon(map, b.id);
    (gruppen.get(wurzel) || gruppen.set(wurzel, []).get(wurzel)!).push(b);
  }
  return gruppen;
}

export interface KettenSummen {
  /** Netto/MwSt fakturiert — Anzahlungen mit Schlussrechnung NICHT doppelt. */
  netto: number;
  mwst: number;
  /** Brutto/bezahlt/offen — roh, weil die SR den Abzug schon trägt. */
  brutto: number;
  bezahlt: number;
  offen: number;
}

/** Rechnungs-Belegarten, die in Forderungssummen zählen. */
const FORDERUNGSTYPEN = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);

/**
 * Summen über beliebig viele Belege (eine Kette oder eine ganze Liste).
 * Zählt nur Forderungstypen; storniert bleibt außen vor; Gutschriften
 * mindern. Ein Beleg mit Status „bezahlt" gilt als ausgeglichen, auch wenn
 * der Rest per Skonto nachgelassen wurde (bezahlt_betrag < brutto).
 */
export function kettenSummen(belege: KettenBeleg[]): KettenSummen {
  const map = new Map<string, KettenBeleg>(belege.map((b) => [b.id, b]));

  // Ketten, in denen bereits eine (nicht stornierte) Schlussrechnung steht —
  // die netto/mwst-Werte ihrer Anzahlungen wären doppelt.
  const kettenMitSchluss = new Set<string>();
  for (const b of belege) {
    if (b.typ === "schlussrechnung" && b.status !== "storniert") {
      kettenMitSchluss.add(wurzelVon(map, b.id));
    }
  }

  const s: KettenSummen = { netto: 0, mwst: 0, brutto: 0, bezahlt: 0, offen: 0 };
  for (const b of belege) {
    if (b.status === "storniert") continue;

    if (b.typ === "gutschrift") {
      s.netto -= zahl(b.netto_summe);
      s.mwst -= zahl(b.mwst_betrag);
      s.brutto -= zahl(b.brutto_summe);
      continue;
    }
    if (!FORDERUNGSTYPEN.has(b.typ)) continue;

    const anzahlungMitSchluss =
      b.typ === "anzahlungsrechnung" && kettenMitSchluss.has(wurzelVon(map, b.id));
    if (!anzahlungMitSchluss) {
      s.netto += zahl(b.netto_summe);
      s.mwst += zahl(b.mwst_betrag);
    }

    s.brutto += zahl(b.brutto_summe);
    s.bezahlt += zahl(b.bezahlt_betrag);
    s.offen += offenerBetrag(b);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { netto: r2(s.netto), mwst: r2(s.mwst), brutto: r2(s.brutto), bezahlt: r2(s.bezahlt), offen: r2(s.offen) };
}

/**
 * Offener Betrag eines Belegs. Status „bezahlt" heißt ausgeglichen — auch
 * wenn ein Skonto den Zahlungseingang unter das Brutto gedrückt hat
 * (Audit-Befund: der Skontobetrag stand sonst ewig als „offen").
 */
export function offenerBetrag(b: KettenBeleg): number {
  if (b.status === "storniert" || b.status === "bezahlt") return 0;
  if (!FORDERUNGSTYPEN.has(b.typ)) return 0;
  return Math.max(0, Math.round((zahl(b.brutto_summe) - zahl(b.bezahlt_betrag)) * 100) / 100);
}
