/**
 * Nachkalkulation — welche Belege zählen als Soll, welche als Erlös.
 *
 * Zwei Fehler aus dem Gesamtaudit sitzen genau hier:
 *
 *  1. Das Soll (Auftragswert und kalkulierte Stunden) verschwand, sobald aus
 *     dem Angebot eine Rechnung wurde: Gesucht wurden nur Angebote im Status
 *     „angenommen" — beim Verrechnen wechselt der Status aber auf
 *     „verrechnet". Das Projekt stand danach ohne Soll da, die Marge war
 *     rechnerisch unendlich.
 *
 *  2. Anzahlungs- und Schlussrechnung wurden BEIDE voll als Erlös gezählt.
 *     Die Schlussrechnung führt den Anzahlungsabzug als steuerbefreite
 *     BRUTTO-Zeile; ihre netto_summe ist deshalb der volle Auftragswert, nicht
 *     der Restbetrag. Der ausgewiesene Umsatz war um die Anzahlung zu hoch.
 */

export interface NkBeleg {
  id: string;
  typ: string;
  status: string;
  netto_summe: number | string | null;
  parent_invoice_id?: string | null;
  nummer?: string | null;
  datum?: string | null;
}

/** Belegarten, die eine Forderung an den Kunden darstellen. */
export const FORDERUNGS_TYPEN = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);

/** Angebots-Status, die einen erteilten Auftrag bedeuten. */
export const AUFTRAGS_STATUS = new Set(["angenommen", "verrechnet", "bezahlt", "teilbezahlt"]);

const netto = (b: NkBeleg): number => Number(b.netto_summe) || 0;
const lebt = (b: NkBeleg): boolean => b.status !== "storniert" && b.status !== "abgelehnt";

/**
 * Die Belege, die den SOLL-Auftragswert tragen.
 *
 * Vorrang haben Auftragsbestätigungen; gibt es keine, zählen Angebote, die
 * zum Auftrag geführt haben — unabhängig davon, ob daraus inzwischen eine
 * Rechnung geworden ist.
 */
export function waehleSollBelege(belege: NkBeleg[]): NkBeleg[] {
  const lebende = (belege || []).filter(lebt);
  const abs = lebende.filter((b) => b.typ === "auftragsbestaetigung");
  if (abs.length > 0) return abs;
  return lebende.filter((b) => b.typ === "angebot" && AUFTRAGS_STATUS.has(b.status));
}

/**
 * Anzahlungsrechnungen, die bereits in einer Schlussrechnung derselben Kette
 * enthalten sind — sie dürfen nicht ein zweites Mal als Erlös zählen.
 */
export function bereitsInSchlussrechnung(belege: NkBeleg[]): Set<string> {
  const lebende = (belege || []).filter(lebt);
  const ketten = new Set(
    lebende.filter((b) => b.typ === "schlussrechnung").map((b) => b.parent_invoice_id || b.id),
  );
  return new Set(
    lebende
      .filter((b) => b.typ === "anzahlungsrechnung" && ketten.has(b.parent_invoice_id || ""))
      .map((b) => b.id),
  );
}

/**
 * Verrechneter Netto-Erlös eines Projekts.
 *
 * Gutschriften mindern, stornierte Belege zählen nicht, und Anzahlungen
 * werden nicht doppelt gezählt, wenn die Schlussrechnung sie bereits enthält.
 */
export function berechneVerrechnet(
  belege: NkBeleg[],
  imZeitraum: (b: NkBeleg) => boolean = () => true,
): { summe: number; gezaehlt: NkBeleg[] } {
  const doppelt = bereitsInSchlussrechnung(belege);
  const gezaehlt: NkBeleg[] = [];
  let summe = 0;
  for (const b of (belege || []).filter(lebt)) {
    if (!imZeitraum(b)) continue;
    if (doppelt.has(b.id)) continue;
    if (FORDERUNGS_TYPEN.has(b.typ)) {
      gezaehlt.push(b);
      summe += netto(b);
    } else if (b.typ === "gutschrift") {
      gezaehlt.push(b);
      summe -= netto(b);
    }
  }
  return { summe: Math.round((summe + Number.EPSILON) * 100) / 100, gezaehlt };
}

// ============================================================================
// Eingangsrechnungen — Fremdkosten je Projekt
// ============================================================================

export interface ErRechnung {
  id: string;
  project_id?: string | null;
  status?: string | null;
  betrag_netto: number | string | null;
}

export interface ErZuordnung {
  purchase_invoice_id: string;
  project_id: string;
  betrag_netto: number | string | null;
  beschreibung?: string | null;
}

export interface ErAnteil {
  project_id: string;
  betrag: number;
  /** true = ausdrücklich zugeordneter Teilbetrag, false = Restbetrag */
  istAnteil: boolean;
  beschreibung?: string | null;
}

/**
 * Verteilt EINE Eingangsrechnung auf Projekte.
 *
 * Zugeordnete Teilbeträge zählen zu ihrem Projekt; was nicht zugeordnet ist,
 * bleibt beim Projekt der Rechnung selbst.
 *
 * Audit-Befund: Bisher fiel der Kopf-Betrag KOMPLETT weg, sobald auch nur ein
 * Teilbetrag existierte. Wer bei einer Rechnung über 5.000 € nachträglich
 * 500 € einem zweiten Projekt zuordnete, verlor die restlichen 4.500 € aus
 * der Nachkalkulation.
 */
export function verteileEingangsrechnung(
  rechnung: ErRechnung,
  zuordnungen: ErZuordnung[],
): ErAnteil[] {
  if ((rechnung.status || "").toLowerCase() === "abgelehnt") return [];
  const kopf = Number(rechnung.betrag_netto) || 0;
  const eigene = (zuordnungen || []).filter((z) => z.purchase_invoice_id === rechnung.id);

  const anteile: ErAnteil[] = eigene
    .map((z) => ({
      project_id: z.project_id,
      betrag: Math.round(((Number(z.betrag_netto) || 0) + Number.EPSILON) * 100) / 100,
      istAnteil: true,
      beschreibung: z.beschreibung ?? null,
    }))
    .filter((a) => Math.abs(a.betrag) > 0.005);

  const zugeordnet = anteile.reduce((s, a) => s + a.betrag, 0);
  const rest = Math.round((kopf - zugeordnet + Number.EPSILON) * 100) / 100;
  if (Math.abs(rest) > 0.005 && rechnung.project_id) {
    anteile.push({ project_id: rechnung.project_id, betrag: rest, istAnteil: false });
  }
  return anteile;
}

/** Fremdkosten je Projekt über alle Eingangsrechnungen. */
export function fremdkostenJeProjekt(
  rechnungen: ErRechnung[],
  zuordnungen: ErZuordnung[],
  imZeitraum: (r: ErRechnung) => boolean = () => true,
): Map<string, number> {
  const summe = new Map<string, number>();
  for (const r of rechnungen || []) {
    if (!imZeitraum(r)) continue;
    for (const a of verteileEingangsrechnung(r, zuordnungen)) {
      summe.set(a.project_id, Math.round(((summe.get(a.project_id) || 0) + a.betrag + Number.EPSILON) * 100) / 100);
    }
  }
  return summe;
}
