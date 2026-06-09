import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { parseISO } from "date-fns";
import type { BoardProject, Project } from "./scheduleTypes";
import { isWeekendDay } from "./scheduleUtils";

interface Props {
  boardProjects: BoardProject[];
  projects: Project[];
  days: Date[];
  onAddClick?: () => void;
  onRemove?: (boardProjectId: string) => void;
}

function darkenHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  const num = parseInt(raw, 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

const WEEKEND_BG = "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 6px)";

export function ProjectBoardSection({ boardProjects, projects, days, onAddClick, onRemove }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="border-b">
      {/* Section header */}
      <div className="flex items-center border-b">
        <button
          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
          style={{ width: 280 }}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          <span className="font-semibold text-sm">Projekte</span>
          {onAddClick && (
            <button
              className="ml-auto p-1 rounded hover:bg-muted/40"
              onClick={(e) => { e.stopPropagation(); onAddClick(); }}
              title="Projekt hinzufügen"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </button>
      </div>

      {!collapsed && boardProjects.map((bp) => {
        const project = projectMap.get(bp.project_id);
        if (!project) return null;

        const barColor = bp.board_color || "#A7C7E7";

        // Use board_projects dates
        let barStartIdx = -1;
        let barEndIdx = -1;

        if (bp.start_date && bp.end_date) {
          const pStart = parseISO(bp.start_date);
          const pEnd = parseISO(bp.end_date);
          for (let i = 0; i < days.length; i++) {
            if (days[i] >= pStart && days[i] <= pEnd) {
              if (barStartIdx === -1) barStartIdx = i;
              barEndIdx = i;
            }
          }
        }

        const hasBar = barStartIdx >= 0;
        const leftPct = hasBar ? (barStartIdx / days.length) * 100 : 0;
        const widthPct = hasBar ? ((barEndIdx - barStartIdx + 1) / days.length) * 100 : 0;

        return (
          <div key={bp.id} className="flex border-t group" style={{ minHeight: 36 }}>
            {/* Sidebar */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-r bg-white shrink-0" style={{ width: 280 }}>
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: barColor }} />
              <span className="text-sm truncate flex-1">{project.name}</span>
              {onRemove && (
                <button
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity"
                  onClick={() => onRemove(bp.id)}
                >
                  <X className="h-3.5 w-3.5 text-red-400" />
                </button>
              )}
            </div>

            {/* Timeline */}
            <div className="flex-1 relative">
              {/* Day grid */}
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(28px, 1fr))` }}>
                {days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="border-r border-gray-100"
                    style={isWeekendDay(day) ? { background: WEEKEND_BG } : undefined}
                  />
                ))}
              </div>

              {/* Bar */}
              {hasBar && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 rounded-md flex items-center px-2 text-xs font-medium truncate"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    height: 24,
                    backgroundColor: barColor,
                    border: `1px solid ${darkenHex(barColor, 0.12)}`,
                    color: "#1e293b",
                  }}
                  title={`${project.name}: ${bp.start_date} – ${bp.end_date}`}
                >
                  <span className="truncate">{project.name}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {!collapsed && boardProjects.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          Keine Projekte auf dem Board
        </div>
      )}
    </div>
  );
}
