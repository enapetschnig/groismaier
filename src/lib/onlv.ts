/**
 * ÖNORM A 2063 — Import von Ausschreibungs-Leistungsverzeichnissen (.onlv).
 *
 * Das ist das österreichische Austauschformat für Ausschreibungen (das
 * Gegenstück zum deutschen GAEB): reines XML, unverschlüsselt. Zwei
 * Schema-Versionen kursieren (2015-07-15 z. B. aus ABK, 2021-03-01 z. B. aus
 * iTWO) — die Struktur ist gleich, nur der Namensraum unterscheidet sich.
 *
 * Aufbau: LG (Leistungsgruppe) → ULG (Unterleistungsgruppe) → Grundtext →
 * Folgeposition. Die Positionsnummer setzt sich daraus zusammen:
 * LG 36, ULG 19, Grundtext 05, Folge L → „36.19.05L".
 *
 * Wichtig fürs Bepreisen:
 *  - Positionsarten: NUR Normalpositionen zählen in die Angebotssumme.
 *    Wahl- und Eventualpositionen werden bepreist, aber getrennt ausgewiesen.
 *  - Positionen ohne Einheit/Menge sind reine Textpositionen (Vertragstext,
 *    z. B. „Strom- u. Wasserverbrauch trägt der AG") — nicht bepreisbar.
 *  - Der Einheitspreis wird in die Preisanteile Lohn und Sonstiges geteilt.
 *  - Langtexte sind Vertragsinhalt und müssen mit Formatierung erhalten
 *    bleiben (Absätze, fett, Listen).
 *
 * Der Parser nutzt den DOMParser des Browsers (kein zusätzliches Paket im
 * Bundle); die Tests laufen mit happy-dom.
 */

export type Positionsart = "normal" | "wahl" | "eventual" | "text";

export interface OnlvPosition {
  /** Vollständige Nummer, z. B. „36.19.05L" — bei ungeteilten Positionen ohne Folgebuchstaben. */
  nummer: string;
  lg: string;
  lgUeberschrift: string;
  ulg: string;
  ulgUeberschrift: string;
  grundtextNr: string;
  /** Folgepositions-Buchstabe/Ziffer, null bei ungeteilter Position. */
  ftnr: string | null;
  stichwort: string;
  /** Bereinigtes HTML (nur p/br/b/i/u/ul/ol/li/sup/sub) — Vertragsinhalt. */
  langtextHtml: string;
  einheit: string | null;
  menge: number | null;
  positionsart: Positionsart;
  leistungsteil: string | null;
  /** Reihenfolge in der Datei — die Anzeige muss der Ausschreibung folgen. */
  sort: number;
}

/** Vorbemerkung auf LG- oder ULG-Ebene — Vertragstext, gehört zur Anzeige. */
export interface OnlvVorbemerkung {
  lg: string;
  ulg: string | null;
  html: string;
}

export interface OnlvLV {
  schemaVersion: string;
  lvcode: string;
  vorhaben: string;
  lvbezeichnung: string;
  auftraggeberName: string;
  auftraggeberAdresse: string;
  waehrung: string;
  preisbasis: string;
  erstelltAm: string;
  programmsystem: string;
  positionen: OnlvPosition[];
  vorbemerkungen: OnlvVorbemerkung[];
}

/** Erlaubte Formatierungs-Tags im Langtext. Alles andere wird zu Text. */
const ERLAUBTE_TAGS = new Set(["p", "br", "b", "i", "u", "ul", "ol", "li", "sup", "sub"]);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Langtext-XML → bereinigtes HTML. Nur die Whitelist-Tags bleiben als Tags
 * (ohne jegliche Attribute), unbekannte Elemente (z. B. grafiklink) werden
 * auf ihren Textinhalt reduziert. Damit ist die Ausgabe gefahrlos per
 * dangerouslySetInnerHTML darstellbar.
 */
function langtextZuHtml(el: Element | null): string {
  if (!el) return "";
  const serialisiere = (knoten: Node): string => {
    if (knoten.nodeType === 3 /* Text */) return escapeHtml(knoten.textContent || "");
    if (knoten.nodeType !== 1 /* Element */) return "";
    const kind = knoten as Element;
    const name = kind.localName.toLowerCase();
    const innen = Array.from(kind.childNodes).map(serialisiere).join("");
    if (name === "br") return "<br/>";
    if (ERLAUBTE_TAGS.has(name)) return `<${name}>${innen}</${name}>`;
    return innen;
  };
  return Array.from(el.childNodes).map(serialisiere).join("").trim();
}

/** Direktes Kind mit passendem Namen (namespace-agnostisch). */
function kind(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.localName === name) return c;
  }
  return null;
}

function kinder(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}

const text = (el: Element | null): string => (el?.textContent || "").trim();

/** lvmenge steht im XML mit Punkt-Dezimal („130.00"). */
const zahl = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function positionsartAus(posEigenschaften: Element): Positionsart {
  const pzzv = kind(posEigenschaften, "pzzv");
  if (!pzzv) {
    // Kein pzzv, aber Menge und Einheit vorhanden: Manche AVA-Programme
    // lassen das Element bei Normalpositionen weg. Als „text" eingestuft
    // wäre die Position bepreisbar, ihr Preis fiele aber aus allen Summen
    // (Review-Befund) — deshalb zählt sie als Normalposition.
    const hatMenge = text(kind(posEigenschaften, "lvmenge")).trim() !== "";
    const hatEinheit = text(kind(posEigenschaften, "einheit")).trim() !== "";
    return hatMenge && hatEinheit ? "normal" : "text";
  }
  if (kind(pzzv, "wahlposition")) return "wahl";
  if (kind(pzzv, "eventualposition")) return "eventual";
  return "normal";
}

export class OnlvFehler extends Error {}

export function parseOnlv(xml: string): OnlvLV {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const wurzel = doc.documentElement;
  if (!wurzel || wurzel.localName !== "onlv" || kind(wurzel, "parsererror")) {
    throw new OnlvFehler("Die Datei ist keine gültige ÖNORM-A-2063-Datei (.onlv).");
  }

  const schemaVersion = (wurzel.getAttribute("xmlns") || wurzel.namespaceURI || "")
    .replace("http://www.oenorm.at/schema/A2063/", "");

  // Ausschreibungs-LV; theoretisch kann auch ein Angebots-/Vertrags-LV
  // hereinkommen — die Gliederung ist identisch.
  const lvEl =
    kind(wurzel, "ausschreibungs-lv") ||
    kind(wurzel, "angebots-lv") ||
    kind(wurzel, "alternativangebots-lv") ||
    kind(wurzel, "vertrags-lv");
  if (!lvEl) {
    throw new OnlvFehler("Die Datei enthält kein Leistungsverzeichnis (ausschreibungs-lv fehlt).");
  }

  const kenndaten = kind(lvEl, "kenndaten");
  const auftraggeberFirma = kenndaten ? kind(kind(kenndaten, "auftraggeber") || kenndaten, "firma") : null;
  const adresseEl = auftraggeberFirma
    ? kind(kind(auftraggeberFirma, "kommunikation") || auftraggeberFirma, "adresse")
    : null;
  const adresse = adresseEl
    ? [text(kind(adresseEl, "strasse")), `${text(kind(adresseEl, "plz"))} ${text(kind(adresseEl, "ort"))}`.trim()]
        .filter(Boolean)
        .join(", ")
    : "";

  const metadaten = kind(wurzel, "metadaten");

  const positionen: OnlvPosition[] = [];
  const vorbemerkungen: OnlvVorbemerkung[] = [];
  let sort = 0;

  const gliederung = kind(lvEl, "gliederung-lg");
  const lgListe = gliederung ? kind(gliederung, "lg-liste") : null;

  for (const lg of lgListe ? kinder(lgListe, "lg") : []) {
    const lgNr = lg.getAttribute("nr") || "";
    const lgEig = kind(lg, "lg-eigenschaften");
    const lgUeberschrift = text(lgEig ? kind(lgEig, "ueberschrift") : null);
    const lgVorbemerkung = lgEig ? kind(lgEig, "vorbemerkung") : null;
    if (lgVorbemerkung) {
      vorbemerkungen.push({ lg: lgNr, ulg: null, html: langtextZuHtml(lgVorbemerkung) });
    }

    const ulgListe = kind(lg, "ulg-liste");
    for (const ulg of ulgListe ? kinder(ulgListe, "ulg") : []) {
      const ulgNr = ulg.getAttribute("nr") || "";
      const ulgEig = kind(ulg, "ulg-eigenschaften");
      const ulgUeberschrift = text(ulgEig ? kind(ulgEig, "ueberschrift") : null);
      const ulgVorbemerkung = ulgEig ? kind(ulgEig, "vorbemerkung") : null;
      if (ulgVorbemerkung) {
        vorbemerkungen.push({ lg: lgNr, ulg: ulgNr, html: langtextZuHtml(ulgVorbemerkung) });
      }

      const posListe = kind(ulg, "positionen");
      for (const gt of posListe ? kinder(posListe, "grundtextnr") : []) {
        const gtNr = gt.getAttribute("nr") || "";
        // Grundtext-Langtext gilt für alle Folgepositionen darunter und wird
        // jeder Position vorangestellt — er ist Teil der Leistungsbeschreibung.
        const grundtextEl = kind(gt, "grundtext");
        const grundtextHtml = grundtextEl ? langtextZuHtml(kind(grundtextEl, "langtext")) : "";

        const posElemente = [
          ...kinder(gt, "ungeteilteposition"),
          ...kinder(gt, "folgeposition"),
        ];
        for (const pos of posElemente) {
          const eig = kind(pos, "pos-eigenschaften");
          if (!eig) continue;
          const ftnr = pos.localName === "folgeposition" ? pos.getAttribute("ftnr") || "" : null;
          const eigenerText = langtextZuHtml(kind(eig, "langtext"));
          positionen.push({
            nummer: `${lgNr}.${ulgNr}.${gtNr}${ftnr || ""}`,
            lg: lgNr,
            lgUeberschrift,
            ulg: ulgNr,
            ulgUeberschrift,
            grundtextNr: gtNr,
            ftnr,
            stichwort: text(kind(eig, "stichwort")),
            langtextHtml: [grundtextHtml, eigenerText].filter(Boolean).join(""),
            einheit: text(kind(eig, "einheit")) || null,
            menge: zahl(text(kind(eig, "lvmenge"))),
            positionsart: positionsartAus(eig),
            leistungsteil: text(kind(eig, "leistungsteil")) || null,
            sort: sort++,
          });
        }
      }
    }
  }

  if (positionen.length === 0) {
    throw new OnlvFehler("Die Datei enthält keine Positionen.");
  }

  return {
    schemaVersion,
    lvcode: text(kenndaten ? kind(kenndaten, "lvcode") : null),
    vorhaben: text(kenndaten ? kind(kenndaten, "vorhaben") : null),
    lvbezeichnung: text(kenndaten ? kind(kenndaten, "lvbezeichnung") : null),
    auftraggeberName: text(auftraggeberFirma ? kind(auftraggeberFirma, "name") : null),
    auftraggeberAdresse: adresse,
    waehrung: text(kenndaten ? kind(kenndaten, "wkz") : null) || "EUR",
    preisbasis: text(kenndaten ? kind(kenndaten, "preisbasis") : null),
    erstelltAm: text(metadaten ? kind(metadaten, "erstelltam") : null),
    programmsystem: text(metadaten ? kind(metadaten, "programmsystem") : null),
    positionen,
    vorbemerkungen,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Summenlogik der Bepreisung — reine Funktionen, von der Seite und den Tests
// gemeinsam genutzt.
// ─────────────────────────────────────────────────────────────────────────────

export interface BepreistePosition {
  positionsart: Positionsart;
  menge: number | null;
  einheit: string | null;
  ep_lohn: number | null;
  ep_sonstiges: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Einheitspreis gesamt = Lohn + Sonstiges; null solange nichts erfasst ist. */
export const epGesamt = (p: BepreistePosition): number | null => {
  if (p.ep_lohn === null && p.ep_sonstiges === null) return null;
  return r2((p.ep_lohn || 0) + (p.ep_sonstiges || 0));
};

/** Positionspreis = Menge × EP, kaufmännisch auf Cent gerundet. */
export const positionspreis = (p: BepreistePosition): number | null => {
  const ep = epGesamt(p);
  if (ep === null || p.menge === null) return null;
  return r2(p.menge * ep);
};

/** Bepreisbar = hat Einheit und Menge (Textpositionen sind es nicht).
 *  Nimmt bewusst nur die zwei Felder — so passt es auch auf frisch
 *  geparste Positionen, die noch keine Preisfelder tragen. */
export const istBepreisbar = (p: Pick<BepreistePosition, "einheit" | "menge">): boolean =>
  p.einheit !== null && p.menge !== null;

export interface LvSummen {
  /** Angebotssumme — NUR Normalpositionen. */
  netto: number;
  /** Wahl- und Eventualpositionen: bepreist, aber getrennt ausgewiesen. */
  wahl: number;
  eventual: number;
  lohnanteil: number;
  bepreisbar: number;
  bepreist: number;
}

export function lvSummen(positionen: BepreistePosition[]): LvSummen {
  const s: LvSummen = { netto: 0, wahl: 0, eventual: 0, lohnanteil: 0, bepreisbar: 0, bepreist: 0 };
  for (const p of positionen) {
    if (!istBepreisbar(p)) continue;
    s.bepreisbar++;
    const preis = positionspreis(p);
    if (preis === null) continue;
    s.bepreist++;
    if (p.positionsart === "normal") {
      s.netto = r2(s.netto + preis);
      s.lohnanteil = r2(s.lohnanteil + r2((p.menge || 0) * (p.ep_lohn || 0)));
    } else if (p.positionsart === "wahl") {
      s.wahl = r2(s.wahl + preis);
    } else if (p.positionsart === "eventual") {
      s.eventual = r2(s.eventual + preis);
    }
  }
  return s;
}
