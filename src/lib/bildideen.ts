// ============================================================================
// Bildideen (KI-Bildgenerierung) — Vorlagen und Prompt-Aufbau
//
// Kundenwunsch 02.09.2026: „ein Menüpunkt, wo ich ein oder mehrere Fotos
// hochlade und er mir generiert, wie dort z. B. ein Carport aussehen würde."
//
// Der eigentliche Aufruf läuft in der Edge Function `bild-generieren`
// (OpenAI-Bildmodell). Hier liegt nur, was testbar ist: die Vorlagen und
// die Regel, wie aus Fotos + Wunsch ein brauchbarer Auftrag ans Modell wird.
// ============================================================================

export interface BildVorlage {
  key: string;
  label: string;
  /** Was ins Bild soll — kurz, konkret, in Handwerker-Sprache. */
  text: string;
}

/** Typische Holzbau-Wünsche als Ein-Klick-Vorlagen; frei ergänzbar. */
export const BILD_VORLAGEN: BildVorlage[] = [
  { key: "carport", label: "Carport", text: "ein modernes Holz-Carport mit Flachdach für zwei Autos, Lärchenholz, sichtbare Holzkonstruktion" },
  { key: "terrasse", label: "Holzterrasse", text: "eine Holzterrasse aus Lärchendielen mit Stufen zum Garten" },
  { key: "fassade", label: "Holzfassade", text: "eine hinterlüftete Holzfassade aus vertikalen Lärchenbrettern, natürlich vergrauend" },
  { key: "dachgaube", label: "Dachgaube", text: "eine Schleppgaube aus Holz mit zwei Fenstern im Dach" },
  { key: "balkon", label: "Balkon", text: "einen vorgestellten Holzbalkon mit Geländer aus senkrechten Latten" },
  { key: "pergola", label: "Pergola", text: "eine Holzpergola mit Lamellendach über der Terrasse" },
  { key: "zaun", label: "Holzzaun", text: "einen Sichtschutzzaun aus horizontalen Lärchenlatten, 1,8 m hoch" },
  { key: "wintergarten", label: "Wintergarten", text: "einen Wintergarten in Holz-Glas-Bauweise an der Hausseite" },
  { key: "gartenhaus", label: "Gartenhaus", text: "ein Gartenhaus aus Holz mit Pultdach, passend zum Wohnhaus" },
  { key: "aufstockung", label: "Aufstockung", text: "eine Aufstockung des Gebäudes um ein Geschoß in Holzbauweise mit Flachdach" },
];

export type BildFormat = "quer" | "quadrat" | "hoch";

/** Bildgrößen, die das Modell direkt kann. */
export const BILD_GROESSEN: Record<BildFormat, string> = {
  quer: "1536x1024",
  quadrat: "1024x1024",
  hoch: "1024x1536",
};

/**
 * Der Auftrag ans Modell. Zwei Regeln, die den Unterschied machen:
 *  1. Mit Foto: Das Foto ist die Wahrheit — Perspektive, Umgebung, Licht
 *     und alles Bestehende bleiben; NUR der Wunsch kommt dazu.
 *  2. Ohne Foto: Eine realistische Visualisierung aus dem Text allein,
 *     damit die Seite auch als schnelle Ideenskizze taugt.
 * Immer fotorealistisch, nie Text/Beschriftungen im Bild (das erzeugt
 * das Modell sonst gern und es sieht billig aus).
 */
export function baueBildPrompt(wunsch: string, anzahlFotos: number): string {
  const w = wunsch.trim();
  const kern = w.length > 0 ? w : "eine passende Holzbau-Erweiterung";
  if (anzahlFotos > 0) {
    return [
      `Fotorealistische Visualisierung auf Basis des Fotos: Füge ${kern} in die gezeigte Situation ein.`,
      "Behalte Perspektive, Kamerastandpunkt, Umgebung, Gebäude, Tageslicht und Farben des Fotos exakt bei.",
      "Verändere nur, was für den Wunsch nötig ist; nichts entfernen, was nicht im Weg steht.",
      "Materialien realistisch (Holzmaserung, Schatten, Anschlüsse an das Bestehende).",
      "Keine Texte, Logos oder Beschriftungen im Bild.",
    ].join(" ");
  }
  return [
    `Fotorealistische Architektur-Visualisierung: ${kern}.`,
    "Österreichisches Wohnumfeld, natürliches Tageslicht, realistische Materialien.",
    "Keine Texte, Logos oder Beschriftungen im Bild.",
  ].join(" ");
}

/** Dateiname für die Ablage — sicher und sprechend. */
export function bildDateiname(wunsch: string, datum = new Date()): string {
  const stempel = datum.toISOString().slice(0, 10);
  const kurz = wunsch.trim().toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "bildidee";
  return `${stempel}-${kurz}.png`;
}
