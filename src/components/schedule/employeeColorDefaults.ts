// Gemeinsame Default-Farben für Mitarbeiter in der Plantafel.
// Werden sowohl im Admin (als UI-Vorschlag) als auch in der Plantafel
// als Fallback verwendet, wenn für den Mitarbeiter noch kein
// individueller employee_schedule_colors-Eintrag existiert.
// Dadurch stimmen Admin- und Plantafel-Darstellung überein.

export interface DefaultColor {
  bg: string;
  text: string;
}

export const DEFAULT_EMPLOYEE_COLORS: DefaultColor[] = [
  { bg: "#3b82f6", text: "#ffffff" }, // Blue
  { bg: "#1F3A5F", text: "#ffffff" }, // Dunkelblau
  { bg: "#10b981", text: "#ffffff" }, // Green
  { bg: "#8b5cf6", text: "#ffffff" }, // Purple
  { bg: "#ef4444", text: "#ffffff" }, // Red
  { bg: "#f59e0b", text: "#ffffff" }, // Amber
  { bg: "#06b6d4", text: "#ffffff" }, // Cyan
  { bg: "#ec4899", text: "#ffffff" }, // Pink
  { bg: "#14b8a6", text: "#ffffff" }, // Teal
  { bg: "#6366f1", text: "#ffffff" }, // Indigo
];

/** Deterministisch gleiche Default-Farbe für einen Index. */
export function getDefaultEmployeeColor(index: number): DefaultColor {
  return DEFAULT_EMPLOYEE_COLORS[((index % DEFAULT_EMPLOYEE_COLORS.length) + DEFAULT_EMPLOYEE_COLORS.length) % DEFAULT_EMPLOYEE_COLORS.length];
}
