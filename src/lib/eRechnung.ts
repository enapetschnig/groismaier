/**
 * E-Rechnung: ebInterface 6.1 (österreichischer Standard, www.ebinterface.at).
 *
 * Erzeugt aus einem Beleg das strukturierte XML, das u. a. e-rechnung.gv.at
 * (Bund), Buchhaltungsprogramme (BMD, RZL …) und Peppol-Konverter einlesen.
 * Struktur und Element-REIHENFOLGE folgen exakt dem offiziellen Schema
 * http://www.ebinterface.at/schema/6p1/ (Invoice.xsd, Stand 2022-06-25).
 * Die Ausgabe wurde bei der Entwicklung mit xmllint gegen das offizielle
 * Invoice.xsd (austriapro) validiert (4 Szenarien: Normal mit Rabatt/Skonto,
 * Reverse Charge, Schlussrechnung mit Anzahlungs-Abzug, Gutschrift).
 *
 * Beträge: unsere gesamte Pipeline ist netto-basiert mit EINEM USt-Satz je
 * Beleg (mwst_satz; 0 % bei Reverse Charge / steuerfrei).
 *  - Zeilen: nur betragstragende, nicht-MwSt-befreite Positionen. Der
 *    effektive Einzelpreis (gesamtpreis/menge) stellt sicher, dass
 *    Quantity × UnitPrice = LineItemAmount centgenau aufgeht.
 *  - Anzahlungs-Abzüge (mwst_exempt, negativ, brutto) werden als
 *    PrepaidAmount ausgewiesen: TotalGrossAmount ist das Brutto VOR Abzug,
 *    PayableAmount der tatsächlich zu zahlende Betrag.
 *  - Beleg-Rabatt → ReductionAndSurchargeDetails/Reduction.
 */

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** Betrag mit 2 Nachkommastellen und Punkt als Dezimaltrenner (XML). */
const amt = (n: number): string => round2(n).toFixed(2);

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Einheit → UN/ECE Rec 20 Code (Pflicht-Attribut von <Quantity Unit>). */
export function uneceUnit(einheit: string): string {
  const e = (einheit || "").trim().toLowerCase().replace(/\.$/, "");
  const map: Record<string, string> = {
    "stk": "C62", "stück": "C62", "stueck": "C62", "st": "C62",
    "pauschale": "C62", "psch": "C62", "pa": "C62", "einheit": "C62",
    "m²": "MTK", "m2": "MTK", "qm": "MTK",
    "m³": "MTQ", "m3": "MTQ",
    "m": "MTR", "lfm": "MTR", "laufmeter": "MTR",
    "h": "HUR", "std": "HUR", "stunde": "HUR", "stunden": "HUR",
    "kg": "KGM", "t": "TNE", "to": "TNE",
    "l": "LTR", "liter": "LTR",
    "km": "KMT", "tag": "DAY", "tage": "DAY",
    "paket": "PK", "pkg": "PK", "karton": "CT",
  };
  return map[e] || "C62";
}

/** ISO-Ländercode aus dem Klartext-Land des Belegs. */
export function countryCode(land: string): string {
  const l = (land || "").trim().toLowerCase();
  const map: Record<string, string> = {
    "österreich": "AT", "oesterreich": "AT", "austria": "AT", "at": "AT",
    "deutschland": "DE", "germany": "DE", "de": "DE",
    "schweiz": "CH", "switzerland": "CH", "ch": "CH",
    "italien": "IT", "italy": "IT", "it": "IT",
    "slowenien": "SI", "slovenia": "SI", "si": "SI",
    "ungarn": "HU", "hungary": "HU", "hu": "HU",
    "tschechien": "CZ", "czechia": "CZ", "cz": "CZ",
    "slowakei": "SK", "slovakia": "SK", "sk": "SK",
    "kroatien": "HR", "croatia": "HR", "hr": "HR",
    "polen": "PL", "poland": "PL", "pl": "PL",
    "frankreich": "FR", "niederlande": "NL", "belgien": "BE",
    "liechtenstein": "LI", "luxemburg": "LU",
  };
  return map[l] || "AT";
}

export interface ERechnungParty {
  name: string;
  street?: string;
  town: string;
  zip: string;
  land?: string;
  phone?: string;
  email?: string;
  /** UID (ATU…). Leer → "00000000" (ebInterface-Konvention „keine UID"). */
  uid?: string;
  /** Kontaktperson (optional). */
  contact?: string;
}

export interface ERechnungBank {
  iban?: string;
  bic?: string;
  kontoinhaber?: string;
}

export interface ERechnungItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  /** Zeilensumme netto (nach Positionsrabatt). */
  gesamtpreis: number;
  /** true = Anzahlungs-Abzugszeile (brutto, MwSt-frei) — wird zu PrepaidAmount. */
  mwst_exempt?: boolean;
  produktnummer?: string;
}

export interface ERechnungInvoice {
  typ: string;
  nummer: string;
  datum: string;              // YYYY-MM-DD
  leistungsdatum?: string;
  leistungsdatum_bis?: string;
  faellig_am?: string;
  referenz?: string;          // Bestell-/Auftragsnummer des Kunden → OrderReference
  mwst_satz: number;
  reverse_charge?: boolean;
  rabatt_prozent?: number;
  rabatt_betrag?: number;
  skonto_prozent?: number;
  skonto_tage?: number;
  zahlungstext?: string;
  betreff?: string;
  /** Abweichende Lieferanschrift (Freitext) → Delivery/Description. */
  lieferadresse?: string;
}

/** Belegtyp → ebInterface DocumentType. */
function documentType(typ: string): string {
  switch (typ) {
    case "gutschrift": return "CreditMemo";
    case "anzahlungsrechnung": return "InvoiceForAdvancePayment";
    case "schlussrechnung": return "FinalSettlement";
    default: return "Invoice";
  }
}

/**
 * Baut das ebInterface-6.1-XML. Wirft Error mit verständlicher Meldung,
 * wenn Pflichtangaben fehlen (Nummer, Datum, Kunde, Positionen).
 */
export function buildEbInterfaceXml(
  invoice: ERechnungInvoice,
  items: ERechnungItem[],
  biller: ERechnungParty,
  recipient: ERechnungParty,
  bank: ERechnungBank,
): string {
  if (!invoice.nummer?.trim()) throw new Error("Belegnummer fehlt — bitte den Beleg zuerst speichern.");
  if (!invoice.datum) throw new Error("Belegdatum fehlt.");
  if (!recipient.name?.trim()) throw new Error("Kundenname fehlt.");
  if (!biller.uid?.trim()) throw new Error("Eigene Firmen-UID fehlt — bitte im Admin-Bereich → Rechnungslayout hinterlegen.");

  // Nur echte Leistungs-Zeilen; Anzahlungs-Abzüge separat als PrepaidAmount.
  const zeilen = items.filter((it) => !it.mwst_exempt && Math.abs(Number(it.gesamtpreis) || 0) > 0.004);
  if (zeilen.length === 0) throw new Error("Keine betragstragenden Positionen vorhanden.");
  const prepaid = round2(Math.abs(items
    .filter((it) => it.mwst_exempt)
    .reduce((s, it) => s + (Number(it.gesamtpreis) || 0), 0)));

  const satz = Number(invoice.mwst_satz) || 0;
  const reverse = !!invoice.reverse_charge;
  // TaxCategoryCode: S Normalsatz · AA ermäßigt · AE Reverse Charge · E steuerfrei
  const taxCode = reverse ? "AE" : satz === 20 ? "S" : satz > 0 ? "AA" : "E";
  const taxComment = reverse
    ? "Übergang der Steuerschuld gemäß § 19 Abs. 1a UStG (Reverse Charge)."
    : satz === 0 ? "Steuerfreier Umsatz." : undefined;

  const positionenNetto = round2(zeilen.reduce((s, it) => s + (Number(it.gesamtpreis) || 0), 0));
  const rabattP = Number(invoice.rabatt_prozent) || 0;
  const rabattB = Number(invoice.rabatt_betrag) || 0;
  const rabatt = round2(rabattP > 0 ? positionenNetto * (rabattP / 100) : rabattB);
  const netto = round2(positionenNetto - rabatt);
  const steuer = reverse || satz === 0 ? 0 : round2(netto * (satz / 100));
  const bruttoVorAbzug = round2(netto + steuer);
  const zahlbar = round2(bruttoVorAbzug - prepaid);

  const x: string[] = [];
  x.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  x.push(
    `<Invoice xmlns="http://www.ebinterface.at/schema/6p1/" ` +
    `GeneratingSystem="Holzbau Groismaier Business-App" ` +
    `DocumentType="${documentType(invoice.typ)}" ` +
    `InvoiceCurrency="EUR" ` +
    `DocumentTitle="${esc(invoice.betreff || invoice.nummer)}" ` +
    `Language="de">`,
  );
  x.push(`  <InvoiceNumber>${esc(invoice.nummer)}</InvoiceNumber>`);
  x.push(`  <InvoiceDate>${esc(invoice.datum)}</InvoiceDate>`);

  // Leistungszeitraum/-datum
  const von = invoice.leistungsdatum || invoice.datum;
  const bis = invoice.leistungsdatum_bis || "";
  if (von) {
    x.push(`  <Delivery>`);
    if (bis && bis !== von) {
      x.push(`    <Period>`);
      x.push(`      <FromDate>${esc(von)}</FromDate>`);
      x.push(`      <ToDate>${esc(bis)}</ToDate>`);
      x.push(`    </Period>`);
    } else {
      x.push(`    <Date>${esc(von)}</Date>`);
    }
    // Abweichende Lieferadresse (Freitext) als Delivery-Beschreibung.
    if (invoice.lieferadresse?.trim()) {
      x.push(`    <Description>Lieferadresse: ${esc(invoice.lieferadresse.trim().replace(/\s*\n\s*/g, ", "))}</Description>`);
    }
    x.push(`  </Delivery>`);
  }

  const address = (p: ERechnungParty, indent: string): string[] => {
    const a: string[] = [];
    a.push(`${indent}<Address>`);
    a.push(`${indent}  <Name>${esc(p.name)}</Name>`);
    if (p.street?.trim()) a.push(`${indent}  <Street>${esc(p.street)}</Street>`);
    a.push(`${indent}  <Town>${esc(p.town || "-")}</Town>`);
    a.push(`${indent}  <ZIP>${esc(p.zip || "-")}</ZIP>`);
    const cc = countryCode(p.land || "");
    a.push(`${indent}  <Country CountryCode="${cc}">${esc(p.land || "Österreich")}</Country>`);
    if (p.phone?.trim()) a.push(`${indent}  <Phone>${esc(p.phone)}</Phone>`);
    if (p.email?.trim()) a.push(`${indent}  <Email>${esc(p.email)}</Email>`);
    a.push(`${indent}</Address>`);
    if (p.contact?.trim()) {
      a.push(`${indent}<Contact>`);
      a.push(`${indent}  <Name>${esc(p.contact)}</Name>`);
      a.push(`${indent}</Contact>`);
    }
    return a;
  };

  // Biller (wir)
  x.push(`  <Biller>`);
  x.push(`    <VATIdentificationNumber>${esc(biller.uid)}</VATIdentificationNumber>`);
  x.push(...address(biller, "    "));
  x.push(`  </Biller>`);

  // InvoiceRecipient (Kunde) — OrderReference aus dem Referenz-Feld
  x.push(`  <InvoiceRecipient>`);
  x.push(`    <VATIdentificationNumber>${esc(recipient.uid?.trim() || "00000000")}</VATIdentificationNumber>`);
  if (invoice.referenz?.trim()) {
    x.push(`    <OrderReference>`);
    x.push(`      <OrderID>${esc(invoice.referenz.trim())}</OrderID>`);
    x.push(`    </OrderReference>`);
  }
  x.push(...address(recipient, "    "));
  x.push(`  </InvoiceRecipient>`);

  // Positionen
  x.push(`  <Details>`);
  x.push(`    <ItemList>`);
  zeilen.forEach((it, i) => {
    // Menge mit 3 Nachkommastellen drucken (der Editor erlaubt 3) und den
    // Einzelpreis gegen exakt die GEDRUCKTE Menge rechnen — sonst geht
    // Quantity × UnitPrice ≠ LineItemAmount auf (Audit-Befund).
    const mengeRoh = Number(it.menge) || 1;
    const mengeStr = mengeRoh.toFixed(3);
    const menge = Number(mengeStr) || 1;
    const zeilensumme = round2(Number(it.gesamtpreis) || 0);
    const einzel = menge !== 0 ? zeilensumme / menge : zeilensumme;
    x.push(`      <ListLineItem>`);
    x.push(`        <PositionNumber>${i + 1}</PositionNumber>`);
    x.push(`        <Description>${esc(it.beschreibung || "Position")}</Description>`);
    if (it.produktnummer?.trim()) {
      x.push(`        <ArticleNumber ArticleNumberType="BillersArticleNumber">${esc(it.produktnummer)}</ArticleNumber>`);
    }
    x.push(`        <Quantity Unit="${uneceUnit(it.einheit)}">${mengeStr}</Quantity>`);
    x.push(`        <UnitPrice>${einzel.toFixed(4)}</UnitPrice>`);
    x.push(`        <TaxItem>`);
    x.push(`          <TaxableAmount>${amt(zeilensumme)}</TaxableAmount>`);
    x.push(`          <TaxPercent TaxCategoryCode="${taxCode}">${reverse ? 0 : satz}</TaxPercent>`);
    x.push(`        </TaxItem>`);
    x.push(`        <LineItemAmount>${amt(zeilensumme)}</LineItemAmount>`);
    x.push(`      </ListLineItem>`);
  });
  x.push(`    </ItemList>`);
  x.push(`  </Details>`);

  // Beleg-Rabatt
  if (rabatt > 0) {
    x.push(`  <ReductionAndSurchargeDetails>`);
    x.push(`    <Reduction>`);
    x.push(`      <BaseAmount>${amt(positionenNetto)}</BaseAmount>`);
    if (rabattP > 0) x.push(`      <Percentage>${amt(rabattP)}</Percentage>`);
    x.push(`      <Amount>${amt(rabatt)}</Amount>`);
    x.push(`      <Comment>Rabatt</Comment>`);
    x.push(`      <TaxItem>`);
    x.push(`        <TaxableAmount>${amt(-rabatt)}</TaxableAmount>`);
    x.push(`        <TaxPercent TaxCategoryCode="${taxCode}">${reverse ? 0 : satz}</TaxPercent>`);
    x.push(`      </TaxItem>`);
    x.push(`    </Reduction>`);
    x.push(`  </ReductionAndSurchargeDetails>`);
  }

  // Steuer-Zusammenfassung (ein Satz je Beleg)
  x.push(`  <Tax>`);
  x.push(`    <TaxItem>`);
  x.push(`      <TaxableAmount>${amt(netto)}</TaxableAmount>`);
  x.push(`      <TaxPercent TaxCategoryCode="${taxCode}">${reverse ? 0 : satz}</TaxPercent>`);
  x.push(`      <TaxAmount>${amt(steuer)}</TaxAmount>`);
  if (taxComment) x.push(`      <Comment>${esc(taxComment)}</Comment>`);
  x.push(`    </TaxItem>`);
  x.push(`  </Tax>`);

  x.push(`  <TotalGrossAmount>${amt(bruttoVorAbzug)}</TotalGrossAmount>`);
  if (prepaid > 0) x.push(`  <PrepaidAmount>${amt(prepaid)}</PrepaidAmount>`);
  x.push(`  <PayableAmount>${amt(zahlbar)}</PayableAmount>`);

  // Zahlung (Überweisung) — nur wenn IBAN bekannt
  if (bank.iban?.trim()) {
    x.push(`  <PaymentMethod>`);
    x.push(`    <UniversalBankTransaction>`);
    x.push(`      <BeneficiaryAccount>`);
    if (bank.bic?.trim()) x.push(`        <BIC>${esc(bank.bic.trim())}</BIC>`);
    x.push(`        <IBAN>${esc(bank.iban.replace(/\s+/g, ""))}</IBAN>`);
    if (bank.kontoinhaber?.trim()) x.push(`        <BankAccountOwner>${esc(bank.kontoinhaber)}</BankAccountOwner>`);
    x.push(`      </BeneficiaryAccount>`);
    x.push(`      <PaymentReference>${esc(invoice.nummer)}</PaymentReference>`);
    x.push(`    </UniversalBankTransaction>`);
    x.push(`  </PaymentMethod>`);
  }

  // Zahlungsbedingungen (Fälligkeit + Skonto)
  const skontoP = Number(invoice.skonto_prozent) || 0;
  const skontoT = Number(invoice.skonto_tage) || 0;
  // Auch bei reinem Zahlungstext (ohne Fälligkeit/Skonto) den Block drucken —
  // sonst ginge der beleg-eigene Text verloren (Audit-Befund).
  if (invoice.faellig_am || (skontoP > 0 && skontoT > 0) || invoice.zahlungstext?.trim()) {
    x.push(`  <PaymentConditions>`);
    x.push(`    <DueDate>${esc(invoice.faellig_am || invoice.datum)}</DueDate>`);
    if (skontoP > 0 && skontoT > 0 && invoice.datum) {
      const skontoDatum = new Date(invoice.datum + "T12:00:00");
      skontoDatum.setDate(skontoDatum.getDate() + skontoT);
      x.push(`    <Discount>`);
      x.push(`      <PaymentDate>${skontoDatum.toISOString().slice(0, 10)}</PaymentDate>`);
      x.push(`      <Percentage>${amt(skontoP)}</Percentage>`);
      x.push(`      <Amount>${amt(zahlbar * (skontoP / 100))}</Amount>`);
      x.push(`    </Discount>`);
    }
    if (invoice.zahlungstext?.trim()) x.push(`    <Comment>${esc(invoice.zahlungstext.trim())}</Comment>`);
    x.push(`  </PaymentConditions>`);
  }

  x.push(`</Invoice>`);
  return x.join("\n");
}
