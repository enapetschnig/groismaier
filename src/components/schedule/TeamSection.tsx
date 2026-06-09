import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil } from "lucide-react";
import { format } from "date-fns";
import { EinsatzBar } from "./EinsatzBar";
import { getDefaultEmployeeColor } from "./employeeColorDefaults";
import {
  getEinsaetzeForUser,
  getEinsatzColumns,
  getTeamProfiles,
  isOnLeave,
  isCompanyHoliday,
  isWeekendDay,
  getEinsatzColor,
} from "./scheduleUtils";
import type {
  Team,
  TeamMember,
  Profile,
  Einsatz,
  BoardProject,
  Project,
  LeaveRequest,
  CompanyHoliday,
  EmployeeColor,
} from "./scheduleTypes";

const WEEKEND_BG = "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 6px)";

interface Props {
  teams: Team[];
  teamMembers: TeamMember[];
  profiles: Profile[];
  einsaetze: Einsatz[];
  boardProjects: BoardProject[];
  projects: Project[];
  days: Date[];
  leaveRequests: LeaveRequest[];
  holidays: CompanyHoliday[];
  employeeColors?: Record<string, EmployeeColor>;
  onAddTeam?: () => void;
  onEditTeam: (team: Team) => void;
  onCellClick?: (userId: string, startDate: string, endDate: string) => void;
  onMultiUserCellClick?: (userIds: string[], startDate: string, endDate: string) => void;
  onEinsatzClick: (einsatz: Einsatz) => void;
  draggableEinsaetze?: boolean;
  onEinsatzDragStart?: (einsatzId: string, e: React.PointerEvent<HTMLDivElement>) => void;
  dragEinsatzId?: string | null;
  dropUserId?: string | null;
  dropDay?: string | null;
}

export function TeamSection({
  teams, teamMembers, profiles, einsaetze, boardProjects, projects, days,
  leaveRequests, holidays, employeeColors, onAddTeam, onEditTeam, onCellClick, onMultiUserCellClick, onEinsatzClick,
  draggableEinsaetze = false, onEinsatzDragStart, dragEinsatzId = null, dropUserId = null, dropDay = null,
}: Props) {
  const [sectionCollapsed, setSectionCollapsed] = useState(false);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  // Drag state — supports multi-row selection within a team
  const [dragUserId, setDragUserId] = useState<string | null>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);
  const [dragTeamId, setDragTeamId] = useState<string | null>(null);
  const [dragStartRowIdx, setDragStartRowIdx] = useState<number | null>(null);
  const [dragEndRowIdx, setDragEndRowIdx] = useState<number | null>(null);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const boardColorMap = new Map(boardProjects.map((bp) => [bp.project_id, bp]));

  function toggleTeam(teamId: string) {
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  }

  function getBarColor(projectId: string): string {
    return getEinsatzColor(
      projectMap.get(projectId),
      boardColorMap.get(projectId)?.board_color,
      projectId,
    );
  }

  // Mouse up for drag selection (supports multi-row within a team)
  useEffect(() => {
    const onMouseUp = () => {
      if (dragStartIdx !== null && dragEndIdx !== null) {
        const lo = Math.min(dragStartIdx, dragEndIdx);
        const hi = Math.max(dragStartIdx, dragEndIdx);
        const startDate = format(days[lo], "yyyy-MM-dd");
        const endDate = format(days[hi], "yyyy-MM-dd");

        // Multi-row: if drag spans multiple rows within a team
        if (dragTeamId && dragStartRowIdx !== null && dragEndRowIdx !== null) {
          const teamProfiles = getTeamProfiles(profiles, teamMembers, dragTeamId);
          const rLo = Math.min(dragStartRowIdx, dragEndRowIdx);
          const rHi = Math.max(dragStartRowIdx, dragEndRowIdx);
          const selectedUsers = teamProfiles.slice(rLo, rHi + 1).map(p => p.id);
          if (selectedUsers.length > 1 && onMultiUserCellClick) {
            onMultiUserCellClick(selectedUsers, startDate, endDate);
          } else if (selectedUsers.length === 1 && onCellClick) {
            onCellClick(selectedUsers[0], startDate, endDate);
          }
        } else if (dragUserId && onCellClick) {
          onCellClick(dragUserId, startDate, endDate);
        }
      }
      setDragUserId(null);
      setDragStartIdx(null);
      setDragEndIdx(null);
      setDragTeamId(null);
      setDragStartRowIdx(null);
      setDragEndRowIdx(null);
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragUserId, dragStartIdx, dragEndIdx, dragTeamId, dragStartRowIdx, dragEndRowIdx, days, onCellClick, onMultiUserCellClick, profiles, teamMembers]);

  function renderMemberRow(profile: Profile, teamId: string, rowIdx: number) {
    const userEinsaetze = getEinsaetzeForUser(einsaetze, profile.id);

    // Check if this row is part of a multi-row drag selection
    const isInMultiRowDrag = dragTeamId === teamId &&
      dragStartRowIdx !== null && dragEndRowIdx !== null &&
      rowIdx >= Math.min(dragStartRowIdx, dragEndRowIdx) &&
      rowIdx <= Math.max(dragStartRowIdx, dragEndRowIdx);

    const empColor = employeeColors?.[profile.id];
    const fallback = getDefaultEmployeeColor(rowIdx);
    const bg = empColor?.bg_color ?? fallback.bg;
    const fg = empColor?.text_color ?? fallback.text;
    const sidebarStyle: React.CSSProperties = {
      width: 280,
      backgroundColor: bg,
      color: fg,
    };
    return (
      <div key={profile.id} className="flex border-t" style={{ minHeight: 36 }}>
        <div
          className="flex items-center px-3 py-1 border-r shrink-0"
          style={sidebarStyle}
        >
          <span className="text-sm truncate pl-4 font-medium">{profile.vorname} {profile.nachname}</span>
        </div>

        <div className="flex-1 relative min-h-[36px]">
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(28px, 1fr))` }}
          >
            {days.map((day, dayIdx) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const holiday = isCompanyHoliday(holidays, day);
              const leave = isOnLeave(leaveRequests, profile.id, day);
              const weekend = isWeekendDay(day);

              const isDragSelectedSingle =
                dragUserId === profile.id &&
                dragStartIdx !== null &&
                dragEndIdx !== null &&
                dayIdx >= Math.min(dragStartIdx, dragEndIdx) &&
                dayIdx <= Math.max(dragStartIdx, dragEndIdx);

              const isDragSelectedMulti = isInMultiRowDrag &&
                dragStartIdx !== null && dragEndIdx !== null &&
                dayIdx >= Math.min(dragStartIdx, dragEndIdx) &&
                dayIdx <= Math.max(dragStartIdx, dragEndIdx);

              const isDragSelected = isDragSelectedSingle || isDragSelectedMulti;

              let cellStyle: React.CSSProperties = {};
              if (weekend && !holiday && !leave) cellStyle.background = WEEKEND_BG;

              const isDropTarget = dropUserId === profile.id && dropDay === dateStr;
              return (
                <div
                  key={dateStr}
                  data-cell-user={profile.id}
                  data-cell-day={dateStr}
                  className={`border-r border-gray-100 ${
                    holiday ? "bg-gray-50" : leave ? "bg-orange-50" : ""
                  } ${isDragSelected ? "bg-blue-100" : ""} ${
                    isDropTarget ? "bg-blue-200 ring-1 ring-blue-400" : ""
                  } ${
                    !holiday && !leave && onCellClick ? "cursor-crosshair" : ""
                  }`}
                  style={!isDragSelected && !isDropTarget ? cellStyle : undefined}
                  onMouseDown={() => {
                    if (!holiday && !leave && onCellClick) {
                      setDragUserId(profile.id);
                      setDragStartIdx(dayIdx);
                      setDragEndIdx(dayIdx);
                      setDragTeamId(teamId);
                      setDragStartRowIdx(rowIdx);
                      setDragEndRowIdx(rowIdx);
                    }
                  }}
                  onMouseEnter={() => {
                    if (dragTeamId === teamId && dragStartIdx !== null) {
                      setDragEndIdx(dayIdx);
                      setDragEndRowIdx(rowIdx);
                    }
                  }}
                />
              );
            })}
          </div>

          {userEinsaetze.map((einsatz) => {
            const cols = getEinsatzColumns(einsatz, days);
            if (!cols) return null;
            const project = projectMap.get(einsatz.project_id);
            return (
              <EinsatzBar
                key={einsatz.id}
                einsatz={einsatz}
                projectName={project?.name ?? "–"}
                color={getBarColor(einsatz.project_id)}
                startCol={cols.startCol}
                endCol={cols.endCol}
                totalDays={days.length}
                onClick={() => onEinsatzClick(einsatz)}
                draggable={draggableEinsaetze}
                onDragStart={onEinsatzDragStart}
                isDragging={dragEinsatzId === einsatz.id}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b">
      <div className="flex items-center border-b">
        <button
          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
          style={{ width: 280 }}
          onClick={() => setSectionCollapsed(!sectionCollapsed)}
        >
          {sectionCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          <span className="font-semibold text-sm">Teams</span>
          {onAddTeam && (
            <button className="ml-auto p-1 rounded hover:bg-muted/40" onClick={(e) => { e.stopPropagation(); onAddTeam(); }}>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </button>
      </div>

      {!sectionCollapsed && teams.map((team) => {
        const teamProfiles = getTeamProfiles(profiles, teamMembers, team.id);
        const isTeamCollapsed = collapsedTeams.has(team.id);

        return (
          <div key={team.id}>
            <div className="flex items-center border-t bg-muted/20">
              <button
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 transition-colors text-left"
                style={{ width: 280 }}
                onClick={() => toggleTeam(team.id)}
              >
                {isTeamCollapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                <span className="text-sm font-medium truncate">{team.name}</span>
                <span className="text-xs text-muted-foreground">{teamProfiles.length}</span>
                <button className="p-0.5 rounded hover:bg-muted/60 ml-auto" onClick={(e) => { e.stopPropagation(); onEditTeam(team); }}>
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              </button>
            </div>
            {!isTeamCollapsed && teamProfiles.map((p, idx) => renderMemberRow(p, team.id, idx))}
            {!isTeamCollapsed && teamProfiles.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center border-t">Keine Mitarbeiter in diesem Team</div>
            )}
          </div>
        );
      })}

      {!sectionCollapsed && teams.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">Keine Teams erstellt</div>
      )}
    </div>
  );
}
