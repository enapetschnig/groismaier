// Geteilte Farb-Kategorie-Definitionen für UI-Komponenten (Plantafel,
// Filter-Badges). Dienen als optionale Farbmarkierung von Projekten.
// Keys bleiben stabil (Persistenz), Labels sind markenneutrale Farben.

export type ProjektKategorie =
  | "montipro"
  | "bks"
  | "gartenmacher"
  | "fensterwerk"
  | "ladenbau"
  | "portas"
  | "chef";

export interface KategorieMeta {
  label: string;
  /** Hex — Vollfarbe, geeignet für absolute/canvas Bars (EinsatzBar). */
  fill: string;
  /** Hex — gedämpfter Hintergrund-Tint (Badges, Filter-Chips, Banner). */
  bg: string;
  /** Hex — kontrastsicherer Vordergrund-Text auf bg. */
  text: string;
  /** Tailwind-Klassen-Variante (für Komponenten, die nicht direkt CSS setzen). */
  badgeClass: string;
  barClass: string;
}

export const KATEGORIE_META: Record<ProjektKategorie | "default", KategorieMeta> = {
  montipro:     { label: "Grün",     fill: "#86efac", bg: "#dcfce7", text: "#166534", badgeClass: "bg-green-100 text-green-800",   barClass: "bg-green-500" },
  bks:          { label: "Blau",     fill: "#93c5fd", bg: "#dbeafe", text: "#1e40af", badgeClass: "bg-blue-100 text-blue-800",     barClass: "bg-blue-500" },
  gartenmacher: { label: "Limette",  fill: "#bef264", bg: "#ecfccb", text: "#3f6212", badgeClass: "bg-lime-100 text-lime-800",     barClass: "bg-lime-500" },
  fensterwerk:  { label: "Cyan",     fill: "#67e8f9", bg: "#cffafe", text: "#155e75", badgeClass: "bg-cyan-100 text-cyan-800",     barClass: "bg-cyan-500" },
  ladenbau:     { label: "Gelb",     fill: "#fcd34d", bg: "#fef3c7", text: "#92400e", badgeClass: "bg-amber-100 text-amber-800",   barClass: "bg-amber-500" },
  portas:       { label: "Orange",   fill: "#fdba74", bg: "#ffedd5", text: "#9a3412", badgeClass: "bg-orange-100 text-orange-800", barClass: "bg-orange-500" },
  chef:         { label: "Violett",  fill: "#c4b5fd", bg: "#ede9fe", text: "#5b21b6", badgeClass: "bg-purple-100 text-purple-800", barClass: "bg-purple-500" },
  default:      { label: "Default",      fill: "#cbd5e1", bg: "#f1f5f9", text: "#334155", badgeClass: "bg-slate-100 text-slate-700",   barClass: "bg-slate-400" },
};

export const KATEGORIE_VALUES: ProjektKategorie[] = [
  "montipro", "bks", "gartenmacher", "fensterwerk", "ladenbau", "portas", "chef",
];

export function isKategorie(v: unknown): v is ProjektKategorie {
  return typeof v === "string" && (KATEGORIE_VALUES as string[]).includes(v);
}

/**
 * Liefert die Meta-Info zu einer Kategorie. Bei `null`/unbekannten
 * Werten kommt der Default zurück — sicher für JSX-Rendering.
 */
export function metaFor(kategorie: string | null | undefined): KategorieMeta {
  return isKategorie(kategorie ?? "")
    ? KATEGORIE_META[kategorie as ProjektKategorie]
    : KATEGORIE_META.default;
}
