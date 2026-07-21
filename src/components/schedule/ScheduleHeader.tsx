import {
  startOfISOWeek,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  getISOWeek,
  format,
  addDays,
} from "date-fns";
import { de } from "date-fns/locale";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import type { ScheduleMode } from "./scheduleTypes";

interface Props {
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  mode: ScheduleMode;
  onModeChange?: (mode: ScheduleMode) => void;
  title?: string;
  children?: React.ReactNode;
}

/**
 * Zeitraum-Navigation der Plantafel (Heute / vor / zurück / Ansicht).
 *
 * Am Handy bricht die Leiste um (früher lief sie 125 px über den Rand
 * hinaus) und alle Knöpfe sind mindestens 44 px hoch.
 */
export function ScheduleHeader({
  weekStart,
  onWeekChange,
  mode,
  onModeChange,
  title,
  children,
}: Props) {
  const navigateBack = () => {
    if (mode === "month") onWeekChange(startOfISOWeek(subMonths(weekStart, 1)));
    else if (mode === "year") {
      const prev = new Date(weekStart);
      prev.setFullYear(prev.getFullYear() - 1);
      onWeekChange(startOfISOWeek(prev));
    } else onWeekChange(subWeeks(weekStart, 1));
  };

  const navigateForward = () => {
    if (mode === "month") onWeekChange(startOfISOWeek(addMonths(weekStart, 1)));
    else if (mode === "year") {
      const next = new Date(weekStart);
      next.setFullYear(next.getFullYear() + 1);
      onWeekChange(startOfISOWeek(next));
    } else onWeekChange(addWeeks(weekStart, 1));
  };

  const goToday = () => onWeekChange(startOfISOWeek(new Date()));

  const unitLabel = mode === "year" ? "Jahr" : mode === "month" ? "Monat" : "Woche";

  const getDateLabel = () => {
    if (mode === "year") return `${weekStart.getFullYear()}`;
    if (mode === "month") {
      return format(weekStart, "MMMM yyyy", { locale: de });
    }
    const weekEnd = addDays(weekStart, 6);
    return `KW ${getISOWeek(weekStart)} · ${format(weekStart, "dd.MM.", { locale: de })} – ${format(weekEnd, "dd.MM.yyyy", { locale: de })}`;
  };

  /** Kurzfassung fürs Handy — die lange lief sonst ins „…".
   *  Bei Monatswechsel innerhalb der Woche steht der Monat auch vorne,
   *  sonst läse sich KW 31 als „27.–02.08." (statt 27.07.–02.08.). */
  const getShortLabel = () => {
    if (mode !== "week") return getDateLabel();
    const weekEnd = addDays(weekStart, 6);
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
    const from = format(weekStart, sameMonth ? "dd." : "dd.MM.", { locale: de });
    return `KW ${getISOWeek(weekStart)} · ${from}–${format(weekEnd, "dd.MM.", { locale: de })}`;
  };

  const modes: { value: ScheduleMode; label: string }[] = [
    { value: "week", label: "Woche" },
    { value: "month", label: "Monat" },
    { value: "year", label: "Jahr" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {title && <h1 className="text-base font-bold">{title}</h1>}

      {/* Navigation */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="kb-btn min-h-[44px] px-3"
          onClick={goToday}
          title="Zum heutigen Zeitraum springen"
        >
          <CalendarCheck className="h-4 w-4 text-kb-blue-dark" />
          Heute
        </button>
        <button
          type="button"
          className="kb-btn min-h-[44px] min-w-[44px] justify-center px-2"
          onClick={navigateBack}
          aria-label={`${unitLabel} zurück`}
          title={`${unitLabel} zurück`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="kb-btn min-h-[44px] min-w-[44px] justify-center px-2"
          onClick={navigateForward}
          aria-label={`${unitLabel} vor`}
          title={`${unitLabel} vor`}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <span
        data-testid="kb-zeitraum"
        className="min-w-0 flex-1 text-sm font-semibold leading-tight text-foreground sm:truncate"
      >
        <span className="sm:hidden">{getShortLabel()}</span>
        <span className="hidden sm:inline">{getDateLabel()}</span>
      </span>

      {children}

      {onModeChange && (
        <div className="flex overflow-hidden rounded-md border border-[hsl(var(--kb-btn-border))]">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              className={`min-h-[44px] px-3 text-xs font-semibold transition-colors ${
                mode === m.value
                  ? "bg-kb-blue-dark text-white"
                  : "bg-white text-kb-blue-dark hover:bg-muted"
              }`}
              onClick={() => onModeChange(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
