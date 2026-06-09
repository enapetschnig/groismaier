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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScheduleMode } from "./scheduleTypes";

interface Props {
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  mode: ScheduleMode;
  onModeChange?: (mode: ScheduleMode) => void;
  title?: string;
  children?: React.ReactNode;
}

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

  const getDateLabel = () => {
    if (mode === "year") return `${weekStart.getFullYear()}`;
    if (mode === "month") {
      return format(weekStart, "MMMM yyyy", { locale: de });
    }
    const weekEnd = addDays(weekStart, 6);
    return `KW ${getISOWeek(weekStart)} · ${format(weekStart, "dd.MM.", { locale: de })} – ${format(weekEnd, "dd.MM.yyyy", { locale: de })}`;
  };

  const modes: { value: ScheduleMode; label: string }[] = [
    { value: "week", label: "Woche" },
    { value: "month", label: "Monat" },
    { value: "year", label: "Jahr" },
  ];

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Left: Title + Label */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">{title ?? "Plantafel"}</h1>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium" onClick={goToday}>
            Heute
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navigateBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navigateForward}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {getDateLabel()}
        </span>
      </div>

      {/* Right: Mode tabs + children */}
      <div className="flex items-center gap-2">
        {children}

        {onModeChange && (
          <div className="flex border rounded-md overflow-hidden h-8">
            {modes.map((m) => (
              <button
                key={m.value}
                className={`px-3 text-xs font-medium transition-colors ${
                  mode === m.value
                    ? "bg-foreground text-background"
                    : "hover:bg-muted"
                }`}
                onClick={() => onModeChange(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
