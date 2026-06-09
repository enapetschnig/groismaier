import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { GanttBar } from "./GanttBar";
import {
  getAssignmentForDay,
  isOnLeave,
  isCompanyHoliday,
  getEmployeeColor,
} from "./scheduleUtils";
import type {
  Profile,
  Project,
  Assignment,
  LeaveRequest,
  CompanyHoliday,
} from "./scheduleTypes";

interface Props {
  profiles: Profile[];
  projects: Project[];
  assignments: Assignment[];
  leaveRequests: LeaveRequest[];
  holidays: CompanyHoliday[];
  days: Date[];
  canEditProject: (projectId: string) => boolean;
  onCellClick?: (userId: string, date: Date) => void;
  onRangeSelect?: (userId: string, days: Date[]) => void;
}

export function TeamGanttSection({
  profiles,
  projects,
  assignments,
  leaveRequests,
  holidays,
  days,
  canEditProject,
  onCellClick,
  onRangeSelect,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragUserId, setDragUserId] = useState<string | null>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  useEffect(() => {
    const onMouseUp = () => {
      if (dragUserId !== null && dragStartIdx !== null && dragEndIdx !== null) {
        const lo = Math.min(dragStartIdx, dragEndIdx);
        const hi = Math.max(dragStartIdx, dragEndIdx);
        const selectedDays = days.slice(lo, hi + 1);
        if (selectedDays.length === 1 && onCellClick) {
          onCellClick(dragUserId, selectedDays[0]);
        } else if (selectedDays.length > 1 && onRangeSelect) {
          onRangeSelect(dragUserId, selectedDays);
        }
      }
      setDragUserId(null);
      setDragStartIdx(null);
      setDragEndIdx(null);
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragUserId, dragStartIdx, dragEndIdx, days, onCellClick, onRangeSelect]);

  return (
    <div className="border-b">
      {/* Section header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
        <Users className="h-4 w-4 shrink-0" />
        <span className="font-semibold text-sm">Teammitglieder</span>
        <span className="text-xs text-muted-foreground">
          {profiles.length} Mitarbeiter
        </span>
      </button>

      {!collapsed &&
        profiles.map((profile) => {
          const empColor = getEmployeeColor(profile.id, profiles.map(p => p.id));
          return (
          <div
            key={profile.id}
            className="grid border-t"
            style={{
              gridTemplateColumns: `minmax(120px, 180px) repeat(${days.length}, minmax(${days.length > 10 ? "32px" : "40px"}, 1fr))`,
            }}
          >
            {/* Label */}
            <div className={`p-2 border-r text-sm font-medium truncate sticky left-0 z-10 flex items-center ${empColor.bg} ${empColor.text}`}>
              {profile.vorname} {profile.nachname}
            </div>

            {/* Day cells */}
            {days.map((day, dayIdx) => {
              const holiday = isCompanyHoliday(holidays, day);
              const leave = isOnLeave(leaveRequests, profile.id, day);
              const assignment = getAssignmentForDay(
                assignments,
                profile.id,
                day
              );
              const projectName = assignment
                ? projectMap[assignment.project_id]
                : null;
              const editable = assignment
                ? canEditProject(assignment.project_id)
                : true;

              const isDragSelected =
                dragUserId === profile.id &&
                dragStartIdx !== null &&
                dragEndIdx !== null &&
                dayIdx >= Math.min(dragStartIdx, dragEndIdx) &&
                dayIdx <= Math.max(dragStartIdx, dragEndIdx);

              return (
                <div
                  key={day.toISOString()}
                  className={`p-0.5 border-r min-h-[40px] select-none ${
                    holiday ? "bg-gray-100" : ""
                  } ${
                    !editable && !holiday && !leave
                      ? "opacity-60"
                      : ""
                  } ${
                    isDragSelected && !holiday && !leave
                      ? "bg-blue-100 ring-1 ring-inset ring-blue-400"
                      : ""
                  }`}
                  onMouseDown={() => {
                    if (!holiday && !leave && editable && (onCellClick || onRangeSelect)) {
                      setDragUserId(profile.id);
                      setDragStartIdx(dayIdx);
                      setDragEndIdx(dayIdx);
                    }
                  }}
                  onMouseEnter={() => {
                    if (dragUserId === profile.id) {
                      setDragEndIdx(dayIdx);
                    }
                  }}
                >
                  {holiday ? (
                    <GanttBar
                      label={holiday.bezeichnung || "Feiertag"}
                      variant="holiday"
                    />
                  ) : leave ? (
                    <GanttBar
                      label={
                        leave.type === "urlaub"
                          ? "Urlaub"
                          : leave.type === "krankenstand"
                          ? "Krank"
                          : leave.type === "za"
                          ? "ZA"
                          : leave.type
                      }
                      variant="leave"
                    />
                  ) : assignment ? (
                    <GanttBar
                      projectId={assignment.project_id}
                      label={projectName || "–"}
                      colorOverride={empColor}
                    />
                  ) : (
                    <div
                      className={`min-h-[32px] rounded-md border border-dashed border-muted-foreground/20 ${
                        (onCellClick || onRangeSelect) && editable
                          ? "cursor-pointer hover:bg-muted/30"
                          : ""
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
        })}

      {!collapsed && profiles.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          Keine aktiven Mitarbeiter
        </div>
      )}
    </div>
  );
}
