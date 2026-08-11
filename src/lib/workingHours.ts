export interface WorkTimePreset {
  startTime: string;
  endTime: string;
  pauseStart: string;
  pauseEnd: string;
  pauseMinutes: number;
  totalHours: number;
}

/**
 * Regelarbeitszeit pro Werktag (Kundenvorgabe 08/2026, 39h/Woche):
 *   Mo-Do: 9h netto (07:00-17:00, 1h Pause)
 *   Fr:    5h netto (07:00-12:00)
 * → 4×9 + 5 = 41h?  Nein: die Wochenstunden sind vertraglich 39h; die
 * anwesende Zeit (Mo-Do 9h, Fr 5h) dient nur der Zeit-Vorbelegung. Das
 * WOCHENSOLL für den Saldo ist 39h (siehe getWeeklyTargetHours), der
 * TAGES-Sollwert für Abwesenheiten 7,8h (siehe getAbsenceHoursPerDay).
 */
export function getNormalWorkingHours(date: Date): number {
  const dayOfWeek = date.getDay();
  // Tages-SOLL für das Zeitkonto = 7,8 h an jedem Werktag (Mo-Fr).
  // WICHTIG (Kundenvorgabe): Das ist NICHT die Anwesenheit! Anwesend sind
  // die Männer Mo-Do 9 h (07:00-17:00) und Fr 5 h (07:00-12:00) = 41 h/Woche;
  // das Soll sind 39 h/Woche. Die Differenz von 2 h/Woche ist der laufende
  // Zeitausgleich — deshalb rechnet der Saldo gegen 7,8 h/Tag, während die
  // Uhrzeiten unten (getDefaultWorkTimes) nur die Eingabe vorbelegen.
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return 7.8;
  return 0;
}

/** Tages-Sollstunden für Urlaub, Zeitausgleich und Krankenstand: 7,8 h
 *  (39h-Woche ÷ 5 Tage — Kundenvorgabe). */
export function getAbsenceHoursPerDay(): number {
  return 7.8;
}

/**
 * Früher gab es einen Freitags-Überstundenanteil — entfällt mit neuer
 * Regelung (Freitag arbeitsfrei). Funktion bleibt für Kompatibilität.
 */
export function getFridayOvertime(_date: Date): number {
  return 0;
}

/**
 * Gesamte Arbeitsstunden inkl. optionaler Überstunden pro Tag.
 * Deckungsgleich mit getNormalWorkingHours, da es keine automatischen
 * Überstundenanteile mehr gibt.
 */
export function getTotalWorkingHours(date: Date): number {
  return getNormalWorkingHours(date);
}

/**
 * Wochensoll: 39 Stunden (Kundenvorgabe, 5-Tage-Woche à 7,8h).
 */
export function getWeeklyTargetHours(): number {
  return 39;
}

/**
 * Standard-Arbeitszeiten für einen Tag.
 */
export function getDefaultWorkTimes(date: Date): WorkTimePreset | null {
  const dayOfWeek = date.getDay();

  // Mo-Do: 07:00 - 17:00, 1h Pause (Männer tragen die Pause selbst ein) = 9h
  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    return {
      startTime: "07:00",
      endTime: "17:00",
      pauseStart: "12:00",
      pauseEnd: "13:00",
      pauseMinutes: 60,
      totalHours: 9,
    };
  }

  // Fr: 07:00 - 12:00, keine Pause = 5h
  if (dayOfWeek === 5) {
    return {
      startTime: "07:00",
      endTime: "12:00",
      pauseStart: "12:00",
      pauseEnd: "12:00",
      pauseMinutes: 0,
      totalHours: 5,
    };
  }

  // Sa/So: arbeitsfrei
  return null;
}

/**
 * Arbeitsfrei: Samstag, Sonntag (Freitag ist wieder Arbeitstag, 5h).
 */
export function isNonWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;  // nur Sa + So
}
