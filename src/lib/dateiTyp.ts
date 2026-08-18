/**
 * Microsoft Graph (und manche e-Billing-Absender wie JAF/Frischeis) liefern
 * für Mail-Anhänge oft nur "application/octet-stream" oder gar keinen
 * Content-Type. Der KI-Scan und die PDF-Vorschau verzweigen aber über den
 * MIME-Typ — darum wird der Typ hier anhand der Dateiendung normalisiert,
 * bevor ein File-Objekt entsteht.
 */
const TYP_JE_ENDUNG: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp",
};

export function normalisierterDateityp(name: string | undefined, typ: string | undefined): string {
  const t = (typ || "").toLowerCase();
  if (t === "application/pdf" || t.startsWith("image/")) return t;
  const endung = (name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  return TYP_JE_ENDUNG[endung] || typ || "application/octet-stream";
}

/** PDF anhand von MIME-Typ ODER Dateiendung erkennen. */
export const istPdfDatei = (f: File): boolean =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Bild anhand von MIME-Typ ODER Dateiendung erkennen. */
export const istBildDatei = (f: File): boolean =>
  f.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/i.test(f.name);
