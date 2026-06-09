import { useState, useCallback } from "react";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type {
  Profile,
  Project,
  Einsatz,
  Team,
  TeamMember,
  BoardProject,
  Resource,
  DailyTarget,
  LeaveRequest,
  CompanyHoliday,
  EmployeeColor,
  ScheduleMode,
} from "./scheduleTypes";

export function useScheduleData() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [boardProjects, setBoardProjects] = useState<BoardProject[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [dailyTargets, setDailyTargets] = useState<DailyTarget[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([]);
  const [employeeColors, setEmployeeColors] = useState<Record<string, EmployeeColor>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    async (weekStart: Date, weekEnd: Date, mode: ScheduleMode) => {
      setLoading(true);

      let fromDate: string;
      let toDate: string;

      if (mode === "year") {
        const yearStart = startOfYear(weekStart);
        const yearEnd = endOfYear(weekStart);
        fromDate = format(yearStart, "yyyy-MM-dd");
        toDate = format(yearEnd, "yyyy-MM-dd");
      } else if (mode === "month") {
        fromDate = format(startOfMonth(weekStart), "yyyy-MM-dd");
        toDate = format(endOfMonth(weekStart), "yyyy-MM-dd");
      } else {
        fromDate = format(weekStart, "yyyy-MM-dd");
        toDate = format(weekEnd, "yyyy-MM-dd");
      }

      // Zentral filtern: welche Projekte darf der eingeloggte User sehen?
      // Admin/Vorarbeiter: alle; Mitarbeiter: nur zugewiesene.
      const { data: { user } } = await supabase.auth.getUser();
      let accessibleProjectIds: string[] | null = null;
      if (user) {
        const { data: rpcData } = await (supabase.rpc as any)(
          "list_accessible_project_ids_for_user",
          { p_user_id: user.id, p_only_active: false },
        );
        accessibleProjectIds = ((rpcData as any[]) || []).map((p: any) => p.id);
      }

      const [
        { data: profs },
        { data: projs },
        { data: eins },
        { data: tms },
        { data: tmMembers },
        { data: brdProjects },
        { data: res },
        { data: targets },
        { data: leave },
        { data: holidays },
        { data: colors },
      ] = await Promise.all([
        (supabase.from("profiles" as never) as any)
          .select("id, vorname, nachname")
          .eq("is_active", true)
          .eq("hidden", false)
          .order("nachname"),
        // Projekte: nur die für diesen User sichtbaren
        accessibleProjectIds === null
          ? supabase.from("projects").select("id, name, status, geplanter_start, geplantes_ende, kategorie").order("name")
          : accessibleProjectIds.length === 0
            ? Promise.resolve({ data: [] } as any)
            : supabase.from("projects").select("id, name, status, geplanter_start, geplantes_ende, kategorie").in("id", accessibleProjectIds).order("name"),
        // Einsaetze that overlap with the visible date range
        // Im Year-Modus werden Einsätze nicht dargestellt → nicht laden (Performance)
        mode === "year"
          ? Promise.resolve({ data: [] } as any)
          : supabase
              .from("einsaetze")
              .select("id, user_id, project_id, name, adresse, beschreibung, start_date, end_date, ganztaegig, start_time, end_time, google_event_id")
              .lte("start_date", toDate)
              .gte("end_date", fromDate),
        supabase
          .from("teams")
          .select("id, name, sort_order")
          .order("sort_order"),
        supabase
          .from("team_members")
          .select("id, team_id, user_id, sort_order")
          .order("sort_order"),
        supabase
          .from("board_projects")
          .select("id, project_id, board_color, color_mode, sort_order, start_date, end_date, beschreibung")
          .order("sort_order"),
        supabase
          .from("assignment_resources")
          .select("id, project_id, datum, resource_name, menge, einheit")
          .gte("datum", fromDate)
          .lte("datum", toDate),
        supabase
          .from("project_daily_targets")
          .select("id, project_id, datum, tagesziel, nachkalkulation_stunden, notizen")
          .gte("datum", fromDate)
          .lte("datum", toDate),
        supabase
          .from("leave_requests")
          .select("id, user_id, start_date, end_date, type, status, days")
          .eq("status", "genehmigt")
          .lte("start_date", toDate)
          .gte("end_date", fromDate),
        supabase.from("company_holidays").select("id, datum, bezeichnung"),
        supabase.from("employee_schedule_colors").select("employee_id, bg_color, text_color"),
      ] as const);

      if (profs) setProfiles(profs);
      if (projs) setProjects(projs as Project[]);
      if (eins) setEinsaetze(eins as Einsatz[]);
      if (tms) setTeams(tms as Team[]);
      if (tmMembers) setTeamMembers(tmMembers as TeamMember[]);
      if (brdProjects) setBoardProjects(brdProjects as BoardProject[]);
      if (res) setResources(res as Resource[]);
      if (targets) setDailyTargets(targets as DailyTarget[]);
      if (leave) setLeaveRequests(leave as LeaveRequest[]);
      if (holidays) setCompanyHolidays(holidays as CompanyHoliday[]);
      if (colors) {
        // Die Tabelle speichert employee_id (=employees.id), der Renderer
        // arbeitet aber mit user_id (=profiles.id). Hier einmal mappen:
        // employees-Tabelle laden und Farbe dem user_id zuweisen.
        const map: Record<string, EmployeeColor> = {};
        const { data: empMap } = await (supabase.from("employees" as never) as any)
          .select("id, user_id");
        const empIdToUserId = new Map<string, string>();
        ((empMap as any[]) || []).forEach((e: any) => {
          if (e.user_id) empIdToUserId.set(e.id, e.user_id);
        });
        (colors as EmployeeColor[]).forEach((c) => {
          const uid = empIdToUserId.get(c.employee_id);
          if (uid) map[uid] = { ...c, employee_id: uid };
        });
        setEmployeeColors(map);
      }

      setLoading(false);
    },
    []
  );

  return {
    profiles,
    projects,
    einsaetze,
    setEinsaetze,
    teams,
    setTeams,
    teamMembers,
    setTeamMembers,
    boardProjects,
    setBoardProjects,
    resources,
    setResources,
    dailyTargets,
    setDailyTargets,
    leaveRequests,
    companyHolidays,
    setCompanyHolidays,
    employeeColors,
    loading,
    fetchData,
  };
}
