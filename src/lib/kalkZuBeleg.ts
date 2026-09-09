// ============================================================================
// Kalkulationszeile → Belegzeile: EINE Stelle für alle Wege
//
// Aus der Auftragskalkulation kommen Positionen auf zwei Wegen in den Beleg:
//   1. „Als Angebot übernehmen" (frischer Beleg, sessionStorage-Übergabe)
//   2. „Positionen neu übernehmen" (bestehender Beleg wird ersetzt)
//
// Beide bauten die Zeile bisher getrennt zusammen — leicht unterschiedlich.
// Als am 28.08.2026 die INFOPOSITION dazukam, wurde sie in Weg 1 eingetragen
// und in Weg 2 vergessen. Folge (Kundenmeldung 08.09.2026): Nach jedem
// „Positionen neu übernehmen" verlor die Infoposition ihr Kennzeichen, der
// Text „INFOPOSITION: …" blieb stehen — und der Betrag zählte wieder in die
// Angebotssumme. Im Angebot A-2026-037 waren das 73.144,15 €.
//
// Deshalb: NUR HIER wird eine Kalkulationszeile zur Belegzeile. Kommt ein
// neues Kennzeichen dazu, genügt diese eine Datei — und der Test darunter
// hält beide Wege deckungsgleich.
// ============================================================================

/** Zeile, wie buildAngebotItems (kalkulationEngine) sie liefert. */
export interface KalkZeile {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
  gruppe?: string | null;
  bereich?: string | null;
  auf_pdf?: boolean;
  ist_gruppensumme?: boolean;
  ist_info?: boolean;
  ek_preis?: number;
}

/** Belegzeile (invoice_items) mit allen Kennzeichen, die die Kalkulation setzt. */
export interface Belegzeile {
  position: number;
  beschreibung: string;
  kurztext: string;
  langtext: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  rabatt_prozent: number;
  gesamtpreis: number;
  gruppe: string | null;
  bereich: string | null;
  auf_pdf: boolean;
  ist_gruppensumme: boolean;
  ist_info: boolean;
  ek_preis: number;
}

/**
 * Was der Chef am Beleg bereits entschieden hatte — beim Neu-Übernehmen darf
 * das nicht von der Kalkulation überfahren werden.
 */
export interface BisherigeWahl {
  /** Auge: sieht der Kunde die Zeile? undefined = Vorschlag der Kalkulation. */
  auf_pdf?: boolean;
  /**
   * War die Zeile am Beleg als Infoposition gekennzeichnet? Sie BLEIBT es
   * dann — auch wenn die Kalkulation den Aufbau nicht als optional führt
   * (z. B. von Hand über den „i"-Schalter gesetzt, Kundenhinweis 08.09.2026).
   * Aufheben geht nur bewusst über denselben Schalter.
   */
  ist_info?: boolean;
}

/**
 * Eine Kalkulationszeile als Belegzeile.
 *
 * @param position 1-basierte Positionsnummer im Beleg
 * @param bisher Entscheidungen, die am Beleg schon getroffen waren.
 */
export function belegzeileAusKalk(
  n: KalkZeile,
  position: number,
  bisher?: BisherigeWahl,
): Belegzeile {
  const beschreibung = String(n.beschreibung || "");
  // menge 0 + einheit "" NICHT auf 1/"Stk." zwingen: reine Textzeilen
  // (Bereichs-/Kapitelüberschriften) drucken sonst „1 Stk. 0,00 €".
  const menge = n.menge === 0 ? 0 : Number(n.menge) || 1;
  const einheit = n.einheit === "" ? "" : String(n.einheit || "Stk.");
  return {
    position,
    beschreibung,
    kurztext: beschreibung,
    langtext: "",
    menge,
    einheit,
    einzelpreis: Number(n.einzelpreis) || 0,
    rabatt_prozent: 0,
    gesamtpreis: Number(n.gesamtpreis) || 0,
    gruppe: n.gruppe ? String(n.gruppe) : null,
    bereich: n.bereich ? String(n.bereich) : null,
    // Sammelzeilen sieht der Kunde immer; sonst zählt die Vorgabe, sonst der
    // Vorschlag der Kalkulation (Detailzeilen kommen mit auf_pdf=false).
    auf_pdf: n.ist_gruppensumme ? true : (bisher?.auf_pdf ?? n.auf_pdf !== false),
    ist_gruppensumme: !!n.ist_gruppensumme,
    // Der Betrag steht am Beleg, zählt aber NICHT in die Belegsumme.
    // ODER-Verknüpfung: Die Kalkulation kann eine Infoposition NEU setzen,
    // eine am Beleg vorhandene geht dabei nie verloren.
    ist_info: !!n.ist_info || !!bisher?.ist_info,
    ek_preis: Number(n.ek_preis) || 0,
  };
}

/**
 * Präfix, das buildAngebotItems einer optionalen Position voranstellt.
 * Das alte „INFOPOSITION:" wird weiter erkannt (Belege von vor dem 09.09.2026).
 */
export const OPTIONAL_PRAEFIX = "OPTIONAL:";
export const OPTIONAL_PRAEFIXE = [OPTIONAL_PRAEFIX, "INFOPOSITION:"] as const;

/**
 * Stammt die Belegzeile aus der Kalkulation? Beim „Positionen neu übernehmen"
 * werden genau diese Zeilen ersetzt, alles andere (von Hand ergänzt) bleibt.
 *
 * Zeilen MIT Gruppe sind eindeutig. Ungruppiert erzeugt die Kalkulation nur
 * zweierlei: Bereichs-/Kapitelüberschriften („Bereich: …") und die
 * Nebenkosten-Pauschale. Die wurden früher allein über den Text des NEUEN
 * Durchlaufs erkannt — fiel die Nebenkosten-Pauschale weg oder wurde ein
 * Kapitel umbenannt, blieb die alte Zeile als „von Hand ergänzt" stehen:
 * eine doppelte Überschrift, im Fall der Pauschale sogar ein doppelter Betrag.
 */
export function istKalkulationsZeile(
  it: { gruppe?: string | null; beschreibung?: string | null },
  neueUngruppierteTexte: Set<string>,
  nebenkostenText: string,
): boolean {
  if (String(it?.gruppe || "").trim()) return true;
  const text = String(it?.beschreibung || "").trim();
  if (!text) return false;
  return neueUngruppierteTexte.has(text)
    || text.startsWith(BEREICH_PRAEFIX)
    || text === nebenkostenText;
}

/** Präfix der Bereichs-/Kapitelüberschrift (siehe kalkulationEngine). */
export const BEREICH_PRAEFIX = "Bereich: ";

/**
 * Zeile trägt den Optional-Text, ist aber nicht als solche gekennzeichnet
 * — Altbestand aus der Zeit vor dem Fix. Der Beleg weist darauf hin, statt
 * still die Summe zu ändern: ein ausgestelltes Angebot darf seinen Preis nicht
 * von selbst wechseln.
 */
export const istInfoTextOhneKennzeichen = (
  it: { beschreibung?: string | null; ist_info?: boolean | null },
): boolean =>
  !it?.ist_info
  && OPTIONAL_PRAEFIXE.some((p) => String(it?.beschreibung || "").trim().toUpperCase().startsWith(p));
