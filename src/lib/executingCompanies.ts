// Hardcoded Liste der vordefinierten ausführenden Firmen für die
// "Allgemeine Angaben"-Tabelle bei Angebot + Auftragsbestätigung.
// Eine Auswahl pro Dokument. Adressen werden mehrzeilig gerendert.
//
// Wenn der User eine andere Firma braucht, wählt er im Form-UI
// "Andere Firma (Freitext)" und gibt einen freien Text ein, der in
// invoices.ausfuehrende_firma_freitext gespeichert wird.
//
// Pflege heute: direkt in dieser Datei. Wenn später eine Admin-UI
// gewünscht ist (Pflege via app_settings JSON oder eigene Tabelle),
// kann diese Lib die Quelle wechseln, ohne dass die UI / Renderer
// geändert werden müssen.

export interface ExecutingCompany {
  id: string;            // stabiler Schlüssel — wird in invoices.ausfuehrende_firma persistiert
  name: string;          // Anzeige-Name
  adressLines: string[]; // mehrzeilige Adresse für PDF/HTML
}

const GROISMAIER_ADDRESS_LINES = [
  "Dallein 43",
  "3753 Dallein",
];

export const EXECUTING_COMPANIES: ExecutingCompany[] = [
  { id: "groismaier", name: "Holzbau Groismaier GmbH", adressLines: GROISMAIER_ADDRESS_LINES },
];

export function findExecutingCompany(id: string | null | undefined): ExecutingCompany | undefined {
  if (!id) return undefined;
  return EXECUTING_COMPANIES.find((c) => c.id === id);
}

/** Liefert "Name + Adresse" als mehrzeiligen String für die Render-Spalte. */
export function executingCompanyDisplay(
  id: string | null | undefined,
  freitext: string | null | undefined,
): string {
  if (id === "freitext") return (freitext || "").trim();
  const company = findExecutingCompany(id);
  if (!company) return "";
  return [company.name, ...company.adressLines].filter(Boolean).join("\n");
}
