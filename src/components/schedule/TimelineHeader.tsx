import { format, getISOWeek, getMonth, isToday, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import { useMemo } from "react";
import type { CompanyHoliday } from "./scheduleTypes";
import { isCompanyHoliday } from "./scheduleUtils";

interface Props {
  days: Date[];
  holidays: CompanyHoliday[];
}

/** Group consecutive days that share a key into spans with start index and count. */
function groupSpans(
  days: Date[],
  keyFn: (d: Date) => string
): { key: string; label: string; startIdx: number; count: number }[] {
  const spans: { key: string; label: string; startIdx: number; count: number }[] = [];
  for (let i = 0; i < days.length; i++) {
    const key = keyFn(days[i]);
    if (spans.length > 0 && spans[spans.length - 1].key === key) {
      spans[spans.length - 1].count++;
    } else {
      spans.push({ key, label: key, startIdx: i, count: 1 });
    }
  }
  return spans;
}

export function TimelineHeader({ days, holidays }: Props) {
  const monthSpans = useMemo(
    () =>
      groupSpans(days, (d) => format(d, "LLLL yyyy", { locale: de })),
    [days]
  );

  const weekSpans = useMemo(
    () =>
      groupSpans(days, (d) => `KW${getISOWeek(d)}`),
    [days]
  );

  const gridCols = `280px repeat(${days.length}, minmax(28px, 1fr))`;

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
      {/* Row 1: Months */}
      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
        <div className="border-r border-gray-200" />
        {monthSpans.map((span) => (
          <div
            key={span.key}
            className="text-xs font-semibold text-gray-700 px-2 py-1 border-r border-gray-200 truncate"
            style={{ gridColumn: `${span.startIdx + 2} / span ${span.count}` }}
          >
            {span.label}
          </div>
        ))}
      </div>

      {/* Row 2: Calendar weeks */}
      <div className="grid border-t border-gray-100" style={{ gridTemplateColumns: gridCols }}>
        <div className="border-r border-gray-200" />
        {weekSpans.map((span, i) => (
          <div
            key={`${span.key}-${i}`}
            className="text-[11px] font-medium text-gray-500 px-1 py-0.5 border-r border-gray-100 text-center truncate"
            style={{ gridColumn: `${span.startIdx + 2} / span ${span.count}` }}
          >
            {span.label}
          </div>
        ))}
      </div>

      {/* Row 3: Day numbers */}
      <div className="grid border-t border-gray-100" style={{ gridTemplateColumns: gridCols }}>
        <div className="border-r border-gray-200" />
        {days.map((day, i) => {
          const weekend = isWeekend(day);
          const today = isToday(day);
          const holiday = isCompanyHoliday(holidays, day);

          return (
            <div
              key={i}
              className="flex items-center justify-center py-1 border-r border-gray-100"
              style={
                weekend
                  ? {
                      background:
                        "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 6px)",
                    }
                  : undefined
              }
              title={
                holiday
                  ? holiday.bezeichnung || "Feiertag"
                  : format(day, "EEEE, d. MMMM yyyy", { locale: de })
              }
            >
              <span
                className={`text-xs leading-none ${
                  today
                    ? "bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-semibold"
                    : holiday
                      ? "text-red-400 font-medium"
                      : weekend
                        ? "text-gray-400"
                        : "text-gray-600"
                }`}
              >
                {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
