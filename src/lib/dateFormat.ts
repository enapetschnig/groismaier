import { format, parseISO, isToday, isYesterday, differenceInDays, differenceInHours, isSameYear } from "date-fns";
import { de } from "date-fns/locale";

function asDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  try {
    // Support both "YYYY-MM-DD" (date-only) and full ISO
    const parsed = input.length === 10 ? parseISO(input + "T12:00:00") : parseISO(input);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/** "24.04.2026" */
export function formatDateShort(input: string | Date | null | undefined): string {
  const d = asDate(input);
  if (!d) return "—";
  return format(d, "dd.MM.yyyy", { locale: de });
}

/** "Do, 24.04.2026" */
export function formatDateWithDow(input: string | Date | null | undefined): string {
  const d = asDate(input);
  if (!d) return "—";
  return format(d, "EE, dd.MM.yyyy", { locale: de });
}

/** "Donnerstag, 24. April 2026" */
export function formatDateLong(input: string | Date | null | undefined): string {
  const d = asDate(input);
  if (!d) return "—";
  return format(d, "EEEE, dd. MMMM yyyy", { locale: de });
}

/** "24.04. – 30.04.2026" oder "24.04.2026 – 15.01.2027" */
export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): string {
  const s = asDate(start);
  const e = asDate(end);
  if (!s && !e) return "—";
  if (!s) return formatDateShort(e);
  if (!e) return formatDateShort(s);
  const sameYear = isSameYear(s, e);
  if (sameYear) {
    return `${format(s, "dd.MM.", { locale: de })} – ${format(e, "dd.MM.yyyy", { locale: de })}`;
  }
  return `${formatDateShort(s)} – ${formatDateShort(e)}`;
}

/** Relative Ausgabe: "heute", "gestern", "vor 3 Tagen", fallback: "24.04.2026" */
export function formatRelativeDate(input: string | Date | null | undefined): string {
  const d = asDate(input);
  if (!d) return "—";
  const now = new Date();
  if (isToday(d)) return "heute";
  if (isYesterday(d)) return "gestern";
  const diffDays = differenceInDays(now, d);
  if (diffDays > 0 && diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 0 && diffDays > -7) return `in ${Math.abs(diffDays)} Tagen`;
  // Fallback: Kurzes Datum, Jahr weglassen wenn aktuelles Jahr
  if (isSameYear(d, now)) return format(d, "dd.MM.", { locale: de });
  return formatDateShort(d);
}

/** "07:00" aus "07:00:00" */
export function formatTime(input: string | null | undefined): string {
  if (!input) return "—";
  return input.slice(0, 5);
}

/** "07:00 – 16:00" */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** Für date-Input (type="date"): "2026-04-24" */
export function toInputDate(input: string | Date | null | undefined): string {
  const d = asDate(input);
  if (!d) return "";
  return format(d, "yyyy-MM-dd");
}
