import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { CompanyHoliday } from "./scheduleTypes";
import { isCompanyHoliday } from "./scheduleUtils";

interface Props {
  days: Date[];
  holidays: CompanyHoliday[];
}

export function GanttTimeline({ days, holidays }: Props) {
  return (
    <div
      className="grid border-b sticky top-0 z-20 bg-card"
      style={{
        gridTemplateColumns: `minmax(120px, 180px) repeat(${days.length}, minmax(${days.length > 10 ? "32px" : "40px"}, 1fr))`,
      }}
    >
      <div className="p-2 border-r font-medium text-sm sticky left-0 bg-card z-30" />
      {days.map((day) => {
        const holiday = isCompanyHoliday(holidays, day);
        return (
          <div
            key={day.toISOString()}
            className={`p-1.5 text-center border-r text-xs ${
              holiday ? "bg-gray-200 text-gray-500" : ""
            }`}
          >
            <div className="font-medium">
              {format(day, "EEE", { locale: de })}
            </div>
            <div className="text-muted-foreground">
              {format(day, "dd.MM.")}
            </div>
            {holiday && (
              <div className="text-[10px] text-gray-400 truncate">
                {holiday.bezeichnung || "Feiertag"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
