import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfISOWeek,
  addDays,
  addWeeks,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
} from "date-fns";

import type { Einsatz, ScheduleMode } from "@/components/schedule/scheduleTypes";
import { getUnteamedProfiles } from "@/components/schedule/scheduleUtils";
import { useScheduleData } from "@/components/schedule/useScheduleData";
import { useSchedulePermissions } from "@/components/schedule/useSchedulePermissions";
import { ScheduleHeader } from "@/components/schedule/ScheduleHeader";
import { TimelineHeader } from "@/components/schedule/TimelineHeader";
import { ProjectBoardSection } from "@/components/schedule/ProjectBoardSection";
import { TeamSection } from "@/components/schedule/TeamSection";
import { MitarbeiterSection } from "@/components/schedule/MitarbeiterSection";
import { AddProjectToBoardDialog } from "@/components/schedule/AddProjectToBoardDialog";
import { CreateTeamDialog } from "@/components/schedule/CreateTeamDialog";
import { EinsatzDialog } from "@/components/schedule/EinsatzDialog";
import { CompanyHolidayManager } from "@/components/schedule/CompanyHolidayManager";
import { YearPlanningView } from "@/components/schedule/YearPlanningView";

export default function ScheduleBoard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<ScheduleMode>("month");
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));

  const {
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
    leaveRequests,
    companyHolidays,
    employeeColors,
    loading,
    fetchData,
  } = useScheduleData();

  const {
    userId,
    isAdmin,
    isVorarbeiter,
    isExtern,
    canManageHolidays,
    loading: permLoading,
  } = useSchedulePermissions();

  // Calculate visible days
  const weekDays = (() => {
    if (mode === "month") {
      const mStart = startOfMonth(weekStart);
      const mEnd = endOfMonth(weekStart);
      return eachDayOfInterval({ start: mStart, end: mEnd });
    }
    // Week: Mon-Sun (7 days)
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  })();
  const weekEnd = weekDays[weekDays.length - 1] || addDays(weekStart, 6);

  // Dialog states
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string } | null>(null);
  const [einsatzDialogOpen, setEinsatzDialogOpen] = useState(false);
  const [editEinsatz, setEditEinsatz] = useState<Einsatz | null>(null);
  const [prefillUserId, setPrefillUserId] = useState<string | undefined>();
  const [prefillUserIds, setPrefillUserIds] = useState<string[]>([]);
  const [prefillStartDate, setPrefillStartDate] = useState<string | undefined>();
  const [prefillEndDate, setPrefillEndDate] = useState<string | undefined>();

  useEffect(() => {
    if (!permLoading && !isAdmin && !isVorarbeiter && !isExtern) {
      navigate("/");
    }
  }, [permLoading, isAdmin, isVorarbeiter, isExtern, navigate]);

  useEffect(() => {
    if (!permLoading) {
      fetchData(weekStart, weekEnd, mode);
    }
  }, [weekStart, mode, permLoading]);

  const canEdit = isAdmin || isVorarbeiter;
  const unteamedProfiles = getUnteamedProfiles(profiles, teamMembers);

  // Available projects (not yet on board)
  const boardProjectIds = new Set(boardProjects.map((bp) => bp.project_id));
  const availableProjects = projects.filter((p) => !boardProjectIds.has(p.id));

  // --- Handlers ---

  const handleAddProjectToBoard = async (projectId: string, color: string, startDate: string, endDate: string, beschreibung: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("board_projects")
      .insert({
        project_id: projectId,
        board_color: color,
        color_mode: "custom",
        start_date: startDate,
        end_date: endDate,
        beschreibung: beschreibung || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    if (data) setBoardProjects((prev) => [...prev, data as any]);
    setAddProjectOpen(false);
  };

  const handleRemoveBoardProject = async (boardProjectId: string) => {
    await supabase.from("board_projects").delete().eq("id", boardProjectId);
    setBoardProjects((prev) => prev.filter((bp) => bp.id !== boardProjectId));
  };

  const handleCreateTeam = async (name: string, memberIds: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: team, error } = await supabase
      .from("teams")
      .insert({ name, created_by: user.id })
      .select()
      .single();
    if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    if (team) {
      setTeams((prev) => [...prev, team as any]);
      if (memberIds.length > 0) {
        const { data: members } = await supabase
          .from("team_members")
          .insert(memberIds.map((uid) => ({ team_id: team.id, user_id: uid })))
          .select();
        if (members) setTeamMembers((prev) => [...prev, ...(members as any[])]);
      }
    }
    setCreateTeamOpen(false);
  };

  const handleEditTeam = (team: { id: string; name: string }) => {
    setEditingTeam(team);
    setCreateTeamOpen(true);
  };

  const handleDeleteTeam = async (teamId: string) => {
    // Get all team member user_ids
    const memberUserIds = teamMembers.filter(tm => tm.team_id === teamId).map(tm => tm.user_id);

    // Einsätze dieser Mitarbeiter löschen — der DB-Trigger sync't automatisch
    // den Google-Kalender, kein manueller Function-Call mehr nötig.
    for (const uid of memberUserIds) {
      const userEinsaetze = einsaetze.filter(e => e.user_id === uid);
      for (const e of userEinsaetze) {
        await supabase.from("einsaetze").delete().eq("id", e.id);
      }
    }

    // Delete team (cascades to team_members)
    await supabase.from("teams").delete().eq("id", teamId);
    setTeams(prev => prev.filter(t => t.id !== teamId));
    setTeamMembers(prev => prev.filter(tm => tm.team_id !== teamId));
    setEinsaetze(prev => prev.filter(e => !memberUserIds.includes(e.user_id)));
    setCreateTeamOpen(false);
    setEditingTeam(null);
    toast({ title: "Team gelöscht" });
  };

  const handleUpdateTeam = async (name: string, memberIds: string[]) => {
    if (!editingTeam) {
      // Create new team
      await handleCreateTeam(name, memberIds);
      return;
    }
    // Update team name
    await supabase.from("teams").update({ name }).eq("id", editingTeam.id);
    setTeams(prev => prev.map(t => t.id === editingTeam.id ? { ...t, name } : t));

    // Sync members: find added/removed
    const currentMemberIds = teamMembers.filter(tm => tm.team_id === editingTeam.id).map(tm => tm.user_id);
    const toAdd = memberIds.filter(id => !currentMemberIds.includes(id));
    const toRemove = currentMemberIds.filter(id => !memberIds.includes(id));

    for (const uid of toRemove) {
      await supabase.from("team_members").delete().eq("team_id", editingTeam.id).eq("user_id", uid);
    }
    setTeamMembers(prev => prev.filter(tm => !(tm.team_id === editingTeam.id && toRemove.includes(tm.user_id))));

    if (toAdd.length > 0) {
      const { data: newMembers } = await supabase
        .from("team_members")
        .insert(toAdd.map(uid => ({ team_id: editingTeam.id, user_id: uid })))
        .select();
      if (newMembers) setTeamMembers(prev => [...prev, ...(newMembers as any[])]);
    }

    setCreateTeamOpen(false);
    setEditingTeam(null);
    toast({ title: "Team aktualisiert" });
  };

  const handleSaveEinsatz = async (data: {
    name: string; project_id: string; adresse: string;
    start_date: string; end_date: string; ganztaegig: boolean;
    start_time: string; end_time: string; beschreibung: string; id?: string;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      user_id: prefillUserId || user.id,
      project_id: data.project_id,
      name: data.name || null,
      adresse: data.adresse || null,
      beschreibung: data.beschreibung || null,
      start_date: data.start_date,
      end_date: data.end_date,
      ganztaegig: data.ganztaegig,
      start_time: data.ganztaegig ? "07:00" : (data.start_time || "07:00"),
      end_time: data.ganztaegig ? "16:00" : (data.end_time || "16:00"),
    };

    // Google-Calendar-Sync läuft automatisch via DB-Trigger bei INSERT/UPDATE.
    if (data.id) {
      const { error } = await supabase.from("einsaetze").update(payload).eq("id", data.id);
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
      setEinsaetze((prev) => prev.map((e) => e.id === data.id ? { ...e, ...payload } as Einsatz : e));
    } else {
      const usersToCreate = prefillUserIds.length > 1 ? prefillUserIds : [payload.user_id];
      for (const uid of usersToCreate) {
        const { data: created, error } = await supabase
          .from("einsaetze")
          .insert({ ...payload, user_id: uid, created_by: user.id })
          .select()
          .single();
        if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); continue; }
        if (created) setEinsaetze((prev) => [...prev, created as Einsatz]);
      }
    }

    setEinsatzDialogOpen(false);
    setEditEinsatz(null);
    setPrefillUserId(undefined);
    setPrefillStartDate(undefined);
    setPrefillEndDate(undefined);
  };

  const handleDeleteEinsatz = async (id: string) => {
    // Google-Calendar-Sync (Löschen) läuft automatisch via DB-Trigger BEFORE DELETE.
    await supabase.from("einsaetze").delete().eq("id", id);
    setEinsaetze((prev) => prev.filter((e) => e.id !== id));
    setEinsatzDialogOpen(false);
    setEditEinsatz(null);
  };

  const handleCellClick = (userId: string, startDate: string, endDate: string) => {
    setPrefillUserId(userId);
    setPrefillUserIds([userId]);
    setPrefillStartDate(startDate);
    setPrefillEndDate(endDate);
    setEditEinsatz(null);
    setEinsatzDialogOpen(true);
  };

  const handleMultiUserCellClick = (userIds: string[], startDate: string, endDate: string) => {
    setPrefillUserId(userIds[0]);
    setPrefillUserIds(userIds);
    setPrefillStartDate(startDate);
    setPrefillEndDate(endDate);
    setEditEinsatz(null);
    setEinsatzDialogOpen(true);
  };

  const handleEinsatzClick = (einsatz: Einsatz) => {
    setEditEinsatz(einsatz);
    setPrefillUserId(einsatz.user_id);
    setEinsatzDialogOpen(true);
  };

  // ─── Drag & Drop: bestehenden Einsatz verschieben ─────────
  // Pointer-Events-basierte Lösung — keine externe Library. Drop-
  // Target-Detection via document.elementFromPoint, das nach
  // data-cell-user/data-cell-day-Attributen sucht (auf den Tageszellen
  // in MitarbeiterSection / TeamSection).
  type DragState = {
    einsatzId: string;
    origUserId: string;
    origStart: string;
    origEnd: string;
    durationDays: number;
    dropUserId: string | null;
    dropStart: string | null;
  };
  const [drag, setDrag] = useState<DragState | null>(null);

  const handleDragStart = (einsatzId: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const ein = einsaetze.find((x) => x.id === einsatzId);
    if (!ein) return;
    const start = new Date(ein.start_date + "T12:00:00");
    const end = new Date(ein.end_date + "T12:00:00");
    const duration = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    // Pointer ab jetzt auf das Element capturen, damit alle Bewegungen
    // garantiert von uns konsumiert werden (auch wenn die Maus die
    // Bar verlässt).
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* tolerant */ }
    setDrag({
      einsatzId,
      origUserId: ein.user_id,
      origStart: ein.start_date,
      origEnd: ein.end_date,
      durationDays: duration,
      dropUserId: null,
      dropStart: null,
    });
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!target) return;
    const cell = target.closest<HTMLElement>("[data-cell-user][data-cell-day]");
    if (!cell) return;
    const cellUser = cell.dataset.cellUser || null;
    const cellDay = cell.dataset.cellDay || null;
    if (cellUser !== drag.dropUserId || cellDay !== drag.dropStart) {
      setDrag((prev) => prev ? { ...prev, dropUserId: cellUser, dropStart: cellDay } : prev);
    }
  };

  const handleDragEnd = async () => {
    if (!drag) return;
    const { einsatzId, origUserId, origStart, durationDays, dropUserId, dropStart } = drag;
    setDrag(null);
    if (!dropUserId || !dropStart) return;
    if (dropUserId === origUserId && dropStart === origStart) return;
    const newStart = new Date(dropStart + "T12:00:00");
    const newEnd = format(addDays(newStart, durationDays), "yyyy-MM-dd");
    // Optimistic Update — Bar springt sofort um
    setEinsaetze((prev) => prev.map((e) =>
      e.id === einsatzId
        ? { ...e, user_id: dropUserId, start_date: dropStart, end_date: newEnd }
        : e,
    ));
    const { error } = await (supabase.from("einsaetze" as never) as any)
      .update({ user_id: dropUserId, start_date: dropStart, end_date: newEnd })
      .eq("id", einsatzId);
    if (error) {
      toast({ variant: "destructive", title: "Verschieben fehlgeschlagen", description: error.message });
      // Rollback durch reload
      fetchData(weekStart, weekEnd, mode);
    }
    // DB-Trigger synct den Google-Termin automatisch — kein expliziter Aufruf nötig.
  };

  if (loading || permLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Lade...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base sm:text-lg font-bold">Plantafel</h1>
          <div className="flex-1" />
          {canManageHolidays && (
            <CompanyHolidayManager
              holidays={companyHolidays}
              onUpdate={() => fetchData(weekStart, weekEnd, mode)}
              userId={userId}
            />
          )}
        </div>
      </header>

      <main className="px-4 py-4">
        {/* Navigation Header */}
        <ScheduleHeader
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          mode={mode}
          onModeChange={setMode}
          title="Plantafel"
        />

        {mode !== "year" ? (
          <div
            className="border rounded-lg overflow-x-auto bg-white mt-3"
            onPointerMove={drag ? handleDragMove : undefined}
            onPointerUp={drag ? handleDragEnd : undefined}
            onPointerCancel={drag ? () => setDrag(null) : undefined}
          >
            {/* Timeline Header */}
            <TimelineHeader days={weekDays} holidays={companyHolidays} />

            {/* Projekte Section */}
            <ProjectBoardSection
              boardProjects={boardProjects}
              projects={projects}
              days={weekDays}
              onAddClick={canEdit ? () => setAddProjectOpen(true) : undefined}
              onRemove={canEdit ? handleRemoveBoardProject : undefined}
            />

            {/* Teams Section */}
            <TeamSection
              teams={teams}
              teamMembers={teamMembers}
              profiles={profiles}
              einsaetze={einsaetze}
              boardProjects={boardProjects}
              projects={projects}
              days={weekDays}
              leaveRequests={leaveRequests}
              holidays={companyHolidays}
              employeeColors={employeeColors}
              onAddTeam={canEdit ? () => { setEditingTeam(null); setCreateTeamOpen(true); } : undefined}
              onEditTeam={canEdit ? handleEditTeam : (() => {})}
              onCellClick={canEdit ? handleCellClick : undefined}
              onMultiUserCellClick={canEdit ? handleMultiUserCellClick : undefined}
              onEinsatzClick={handleEinsatzClick}
              draggableEinsaetze={canEdit}
              onEinsatzDragStart={handleDragStart}
              dragEinsatzId={drag?.einsatzId ?? null}
              dropUserId={drag?.dropUserId ?? null}
              dropDay={drag?.dropStart ?? null}
            />

            {/* Mitarbeiter Section */}
            <MitarbeiterSection
              profiles={unteamedProfiles}
              einsaetze={einsaetze}
              boardProjects={boardProjects}
              projects={projects}
              days={weekDays}
              leaveRequests={leaveRequests}
              holidays={companyHolidays}
              employeeColors={employeeColors}
              onManageClick={() => {}}
              onCellClick={canEdit ? handleCellClick : undefined}
              onEinsatzClick={handleEinsatzClick}
              draggableEinsaetze={canEdit}
              onEinsatzDragStart={handleDragStart}
              dragEinsatzId={drag?.einsatzId ?? null}
              dropUserId={drag?.dropUserId ?? null}
              dropDay={drag?.dropStart ?? null}
            />
          </div>
        ) : (
          <YearPlanningView
            year={weekStart.getFullYear()}
            projects={projects}
            assignments={[]}
            holidays={companyHolidays}
            leaveRequests={leaveRequests}
          />
        )}
      </main>

      {/* Dialogs */}
      <AddProjectToBoardDialog
        open={addProjectOpen}
        onOpenChange={setAddProjectOpen}
        availableProjects={availableProjects}
        onSave={handleAddProjectToBoard}
      />

      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={(open) => { setCreateTeamOpen(open); if (!open) setEditingTeam(null); }}
        profiles={profiles}
        existingTeamMemberIds={teamMembers.filter(tm => tm.team_id !== editingTeam?.id).map(tm => tm.user_id)}
        onSave={handleUpdateTeam}
        editTeam={editingTeam}
        editMemberIds={editingTeam ? teamMembers.filter(tm => tm.team_id === editingTeam.id).map(tm => tm.user_id) : undefined}
        onDelete={editingTeam ? () => handleDeleteTeam(editingTeam.id) : undefined}
      />

      <EinsatzDialog
        open={einsatzDialogOpen}
        onOpenChange={(open) => {
          setEinsatzDialogOpen(open);
          if (!open) { setEditEinsatz(null); setPrefillUserId(undefined); }
        }}
        projects={projects}
        editEinsatz={editEinsatz}
        prefillUserId={prefillUserId}
        prefillStartDate={prefillStartDate}
        prefillEndDate={prefillEndDate}
        onSave={handleSaveEinsatz}
        onDelete={handleDeleteEinsatz}
      />
    </div>
  );
}
