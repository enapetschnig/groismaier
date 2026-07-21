import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarOff, CalendarPlus, FolderPlus, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfISOWeek,
  addDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
} from "date-fns";

import type { Einsatz, ScheduleMode } from "@/components/schedule/scheduleTypes";
import { getUnteamedProfiles } from "@/components/schedule/scheduleUtils";
import { MobileScheduleList } from "@/components/schedule/MobileScheduleList";
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

/** Toolbar-Nebenaktion: am Handy nur das Icon, ab sm mit Beschriftung. */
const ICON_ONLY_ON_MOBILE = "[&>span]:hidden sm:[&>span]:inline";

export default function ScheduleBoard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // URL-Param ?view=week|month|year — /schedule?view=year öffnet direkt
  // die Jahresansicht; Umschalten hält den Param synchron.
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<ScheduleMode>(() => {
    const v = searchParams.get("view");
    return v === "week" || v === "month" || v === "year" ? v : "month";
  });
  const handleModeChange = (m: ScheduleMode) => {
    setMode(m);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", m);
        return next;
      },
      { replace: true },
    );
  };
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

  // Heutiges Datum als yyyy-MM-dd (lokal) — für Vergangenheits-Prüfungen.
  const todayStr = format(new Date(), "yyyy-MM-dd");

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
    // Frisch angelegte Projekte fehlen sonst in `projects` — die Board-Zeile
    // bliebe leer und im Einsatz-Dialog wäre das Projekt nicht wählbar.
    await fetchData(weekStart, weekEnd, mode);
    toast({ title: "Projekt auf der Plantafel" });
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
    // WICHTIG: Ein Team ist nur eine Gruppierung. Früher wurden hier ALLE
    // Einsätze sämtlicher Team-Mitglieder mitgelöscht — ein Fehlklick auf
    // „Team löschen" hat damit die komplette Planung dieser Leute
    // vernichtet. Die Einsätze bleiben jetzt erhalten, die Mitarbeiter
    // wandern zurück in die Sektion „Mitarbeiter".
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) {
      toast({ variant: "destructive", title: "Team konnte nicht gelöscht werden", description: error.message });
      return;
    }
    setTeams(prev => prev.filter(t => t.id !== teamId));
    setTeamMembers(prev => prev.filter(tm => tm.team_id !== teamId));
    setCreateTeamOpen(false);
    setEditingTeam(null);
    toast({ title: "Team gelöscht", description: "Die Einsätze der Mitarbeiter bleiben erhalten." });
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

  type EinsatzFormData = {
    name: string; project_id: string; user_id: string; adresse: string;
    start_date: string; end_date: string; ganztaegig: boolean;
    start_time: string; end_time: string; beschreibung: string; id?: string;
  };

  /** Doppelbelegung: Einsätze desselben Mitarbeiters, die sich mit dem
   *  gewünschten Zeitraum überschneiden (der bearbeitete zählt nicht). */
  const findOverlaps = (uid: string, start: string, end: string, ignoreId?: string) =>
    einsaetze.filter(
      (e) =>
        e.user_id === uid &&
        e.id !== ignoreId &&
        e.start_date <= end &&
        e.end_date >= start,
    );

  // Bestätigungsdialog bei Doppelbelegung — der Einsatz wird zwischen-
  // gespeichert, bis der Chef „Trotzdem einplanen" bestätigt.
  const [overlapWarning, setOverlapWarning] = useState<{
    data: EinsatzFormData;
    users: string[];
    text: string;
  } | null>(null);

  const persistEinsatz = async (data: EinsatzFormData, usersToCreate: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
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
      const full = { ...payload, user_id: data.user_id || usersToCreate[0] };
      const { error } = await supabase.from("einsaetze").update(full).eq("id", data.id);
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
      setEinsaetze((prev) => prev.map((e) => e.id === data.id ? { ...e, ...full } as Einsatz : e));
      toast({ title: "Einsatz gespeichert" });
    } else {
      let created = 0;
      for (const uid of usersToCreate) {
        const { data: row, error } = await supabase
          .from("einsaetze")
          .insert({ ...payload, user_id: uid, created_by: user.id })
          .select()
          .single();
        if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); continue; }
        if (row) { setEinsaetze((prev) => [...prev, row as Einsatz]); created++; }
      }
      if (created > 0) {
        toast({ title: created > 1 ? `${created} Einsätze angelegt` : "Einsatz angelegt" });
      }
    }

    setEinsatzDialogOpen(false);
    setEditEinsatz(null);
    setPrefillUserId(undefined);
    setPrefillUserIds([]);
    setPrefillStartDate(undefined);
    setPrefillEndDate(undefined);
  };

  const handleSaveEinsatz = async (data: EinsatzFormData) => {
    const usersToCreate = !data.id && prefillUserIds.length > 1
      ? prefillUserIds
      : [data.user_id].filter(Boolean);

    if (usersToCreate.length === 0) {
      toast({ variant: "destructive", title: "Mitarbeiter fehlt" });
      return;
    }

    // Doppelbelegung prüfen (kein hartes Verbot — der Chef entscheidet)
    const conflicts: string[] = [];
    for (const uid of usersToCreate) {
      const overlaps = findOverlaps(uid, data.start_date, data.end_date, data.id);
      if (overlaps.length === 0) continue;
      const prof = profiles.find((p) => p.id === uid);
      const who = prof ? `${prof.vorname} ${prof.nachname}` : "Mitarbeiter";
      for (const o of overlaps) {
        const pname = projects.find((p) => p.id === o.project_id)?.name ?? "anderes Projekt";
        conflicts.push(
          `${who}: ${pname} (${format(new Date(o.start_date + "T12:00:00"), "dd.MM.")}–${format(new Date(o.end_date + "T12:00:00"), "dd.MM.")})`,
        );
      }
    }

    if (conflicts.length > 0) {
      setOverlapWarning({ data, users: usersToCreate, text: conflicts.slice(0, 5).join("\n") });
      return;
    }

    await persistEinsatz(data, usersToCreate);
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
    setPrefillUserIds([einsatz.user_id]);
    setEinsatzDialogOpen(true);
  };

  /** „Neuer Einsatz" aus der Toolbar bzw. aus der Handy-Liste: der
   *  Mitarbeiter wird im Dialog gewählt. */
  const openNewEinsatz = (date?: string) => {
    const d = date ?? todayStr;
    setPrefillUserId(profiles.length === 1 ? profiles[0].id : undefined);
    setPrefillUserIds([]);
    setPrefillStartDate(d);
    setPrefillEndDate(d);
    setEditEinsatz(null);
    setEinsatzDialogOpen(true);
  };

  // Alle sichtbaren Mitarbeiter für die Handy-Liste (Team + Einzelne)
  const allVisibleProfiles = useMemo(() => profiles, [profiles]);

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
      <div className="kb-page flex items-center justify-center min-h-screen">
        <p className="kb-panel px-6 py-4 text-sm">Plantafel wird geladen…</p>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      {/* KingBill-Toolbar: [Zurück] Plantafel [+ Einsatz] [+ Projekt] [Team] [Betriebsurlaub]
          Am Handy tragen die Nebenaktionen nur ihr Icon (Beschriftung per
          aria-label/title) — sonst wäre die Leiste 225 px hoch. */}
      <KBToolbar onBack={() => navigate("/")} title="Plantafel">
        {canEdit && (
          <KBToolbarButton
            icon={CalendarPlus}
            iconClassName="text-kb-green"
            label="Einsatz"
            title="Neuen Einsatz anlegen"
            onClick={() => openNewEinsatz()}
          />
        )}
        {canEdit && (
          <KBToolbarButton
            className={ICON_ONLY_ON_MOBILE}
            icon={FolderPlus}
            label="Projekt"
            aria-label="Projekt auf die Plantafel legen"
            title="Projekt auf die Plantafel legen"
            onClick={() => setAddProjectOpen(true)}
          />
        )}
        {canEdit && (
          <KBToolbarButton
            className={ICON_ONLY_ON_MOBILE}
            icon={Users}
            label="Team"
            aria-label="Team anlegen"
            title="Team anlegen"
            onClick={() => { setEditingTeam(null); setCreateTeamOpen(true); }}
          />
        )}
        {canManageHolidays && (
          <CompanyHolidayManager
            holidays={companyHolidays}
            onUpdate={() => fetchData(weekStart, weekEnd, mode)}
            userId={userId}
            trigger={
              <KBToolbarButton
                className={ICON_ONLY_ON_MOBILE}
                icon={CalendarOff}
                label="Betriebsurlaub"
                aria-label="Betriebsurlaub verwalten"
                title="Betriebsurlaub verwalten"
              />
            }
          />
        )}
      </KBToolbar>

      <main className="mx-auto w-full max-w-[1800px] px-3 py-3 sm:px-4 sm:py-4">
        {/* Zeitraum-Navigation */}
        <div className="kb-panel p-2 sm:p-3">
          <ScheduleHeader
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            mode={mode}
            onModeChange={handleModeChange}
          />
        </div>

        {/* ── Handy: Tages-Karten statt Raster ── */}
        {mode !== "year" && (
          <div className="mt-3 md:hidden">
            <MobileScheduleList
              days={weekDays}
              profiles={allVisibleProfiles}
              einsaetze={einsaetze}
              projects={projects}
              boardProjects={boardProjects}
              leaveRequests={leaveRequests}
              holidays={companyHolidays}
              canEdit={canEdit}
              onAdd={(d) => openNewEinsatz(d)}
              onEinsatzClick={handleEinsatzClick}
            />
          </div>
        )}

        {mode !== "year" ? (
          <div
            className="kb-panel hidden md:block overflow-x-auto mt-3"
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
            boardProjects={boardProjects}
            projects={projects}
            einsaetze={einsaetze}
            profiles={profiles}
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
          if (!open) { setEditEinsatz(null); setPrefillUserId(undefined); setPrefillUserIds([]); }
        }}
        projects={projects}
        profiles={profiles}
        editEinsatz={editEinsatz}
        prefillUserId={prefillUserId}
        prefillUserIds={prefillUserIds}
        prefillStartDate={prefillStartDate}
        prefillEndDate={prefillEndDate}
        onSave={handleSaveEinsatz}
        onDelete={handleDeleteEinsatz}
      />

      {/* Doppelbelegung: der Chef bestätigt bewusst */}
      <AlertDialog
        open={!!overlapWarning}
        onOpenChange={(open) => { if (!open) setOverlapWarning(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Doppelbelegung</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>In diesem Zeitraum ist bereits etwas eingeplant:</p>
                <ul className="list-disc pl-5">
                  {(overlapWarning?.text ?? "").split("\n").filter(Boolean).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p>Trotzdem einplanen?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={async () => {
                const w = overlapWarning;
                setOverlapWarning(null);
                if (w) await persistEinsatz(w.data, w.users);
              }}
            >
              Trotzdem einplanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
