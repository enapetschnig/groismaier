// ============================================================================
// Fotos für ein PDF auf Druckgröße bringen (Kundenmeldung 09.09.2026)
//
// „Der Rechnungsversand per Mail hat nicht geklappt … sind das vielleicht die
//  vielen Regieberichte als Anhang?"
//
// Gemessen: Das Sammel-PDF aus 25 Regieberichten war 120 MB groß, die
// Mail-Anfrage 161 MB — Microsoft Graph nimmt bei diesem Weg rund 4 MB.
// Ursache: Handy-Fotos landeten in voller Auflösung (12 MP, 3–5 MB je Bild)
// unverändert im Dokument, obwohl sie darin nur ~85 mm breit gedruckt werden.
//
// Hier werden sie vorher auf eine sinnvolle Druckauflösung gerechnet und als
// JPEG eingebettet. 85 mm bei 200 dpi sind rund 670 px — mit 1400 px Kante
// bleibt genug Reserve für Zoom am Bildschirm, und aus 4 MB werden ~150 KB.
// ============================================================================

/** Längste Kante eines Fotos im PDF. Reicht für ~200 dpi bei halber Seitenbreite. */
export const MAX_KANTE_PX = 1400;
/** JPEG-Qualität: sichtbar sauber, aber ein Bruchteil der Dateigröße. */
export const JPEG_QUALITAET = 0.72;

/** Zielmaße unter Beibehaltung des Seitenverhältnisses. */
export function zielMasse(
  breite: number,
  hoehe: number,
  maxKante = MAX_KANTE_PX,
): { breite: number; hoehe: number } {
  const groesste = Math.max(breite, hoehe);
  if (!groesste || groesste <= maxKante) return { breite, hoehe };
  const faktor = maxKante / groesste;
  return { breite: Math.round(breite * faktor), hoehe: Math.round(hoehe * faktor) };
}

/**
 * Foto verkleinern und als JPEG-DataURL liefern.
 *
 * Läuft nur im Browser (Canvas). Schlägt etwas fehl — kein Canvas, kaputtes
 * Bild, fremdes Format — kommt das Original zurück: Ein Bericht darf nie an
 * der Bildaufbereitung scheitern.
 */
export async function bildFuerPdf(
  dataUrl: string,
  maxKante = MAX_KANTE_PX,
  qualitaet = JPEG_QUALITAET,
): Promise<{ dataUrl: string; typ: "JPEG" | "PNG" }> {
  const originalTyp: "JPEG" | "PNG" = /^data:image\/png/i.test(dataUrl) ? "PNG" : "JPEG";
  try {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      return { dataUrl, typ: originalTyp };
    }
    const bild = await new Promise<HTMLImageElement>((auf, ab) => {
      const i = new Image();
      i.onload = () => auf(i);
      i.onerror = () => ab(new Error("Bild nicht lesbar"));
      i.src = dataUrl;
    });
    const { breite, hoehe } = zielMasse(bild.naturalWidth, bild.naturalHeight, maxKante);
    if (breite === bild.naturalWidth && hoehe === bild.naturalHeight && originalTyp === "JPEG") {
      return { dataUrl, typ: "JPEG" };   // schon klein genug
    }
    const canvas = document.createElement("canvas");
    canvas.width = breite;
    canvas.height = hoehe;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { dataUrl, typ: originalTyp };
    // Weißer Grund: PNG mit Transparenz würde sonst schwarz.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, breite, hoehe);
    ctx.drawImage(bild, 0, 0, breite, hoehe);
    const klein = canvas.toDataURL("image/jpeg", qualitaet);
    // Sicherheitsnetz: Wenn das Ergebnis wider Erwarten größer ist, Original.
    return klein.length < dataUrl.length ? { dataUrl: klein, typ: "JPEG" } : { dataUrl, typ: originalTyp };
  } catch {
    return { dataUrl, typ: originalTyp };
  }
}
