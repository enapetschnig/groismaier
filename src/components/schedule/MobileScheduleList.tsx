/**
 * MobileScheduleList — Plantafel für das Handy.
 *
 * Das Raster (280px-Sidebar + eine Spalte je Tag) ist auf 390px Breite
 * unbedienbar. Am Handy zeigt die Plantafel deshalb diese Tages-Karten:
 * je sichtbarem Tag eine Karte mit allen Einsätzen (Mitarbeiter, Projekt,
 * Zeit), Feiertags-/Urlaubs-Markierung und einem großen „+"-Knopf.
 *
 * Tippen auf eine Zeile öffnet denselben EinsatzDialog wie am Desktop.
 */
import { useMemo, useState } from "react";
import { format, isToday, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import { Plus, CalendarOff, Palmtree, CalendarDays } from "lucide-react";
import { getEinsatzColor, isCompanyHoliday, isOnLeave } from "./scheduleUtils";
import type {
  Profile,
  Einsatz,
  Project,
  BoardProject,
  LeaveRequest,
  CompanyHoliday,
} from "./scheduleTypes";

interface Props {
  days: Date[];
  /** Alle sichtbaren Mitarbeiter (Team-Mitglieder + Einzelne). */
  profiles: Profile[];
  einsaetze: Einsatz[];
  projects: Project[];
  boardProjects: BoardProject[];
  leaveRequests: LeaveRequest[];
  holidays: CompanyHoliday[];
  canEdit: boolean;
  /** Neuer Einsatz an diesem Tag (Mitarbeiter wird im Dialog gewählt). */
  onAdd: (date: string) => void;
  onEinsatzClick: (einsatz: Einsatz) => void;
}

export function MobileScheduleList({
  days,
  profiles,
  einsaetze,
  projects,
  boardProjects,
  leaveRequests,
  holidays,
  canEdit,
  onAdd,
  onEinsatzClick,
}: Props) {
  // Filter: alle Mitarbeiter oder nur einer („Meine Einsätze")
  const [filterUser, setFilterUser] = useState<string>("");

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const boardColorMap = useMemo(
    () => new Map(boardProjects.map((bp) => [bp.project_id, bp])),
    [boardProjects],
  );
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const visibleEinsaetze = useMemo(
    () => (filterUser ? einsaetze.filter((e) => e.user_id === filterUser) : einsaetze),
    [einsaetze, filterUser],
  );

  const rows = useMemo(
    () =>
      days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const list = visibleEinsaetze
          .filter((e) => e.start_date <= dateStr && e.end_date >= dateStr)
          .sort((a, b) => {
            const pa = profileMap.get(a.user_id);
            const pb = profileMap.get(b.user_id);
            return `${pa?.nachname ?? ""}${pa?.vorname ?? ""}`.localeCompare(
              `${pb?.nachname ?? ""}${pb?.vorname ?? ""}`,
            );
          });
        const holiday = isCompanyHoliday(holidays, day);
        const onLeave = profiles.filter(
          (p) => (!filterUser || p.id === filterUser) && isOnLeave(leaveRequests, p.id, day),
        );
        return { day, dateStr, list, holiday, onLeave };
      }),
    [days, visibleEinsaetze, holidays, leaveRequests, profiles, filterUser, profileMap],
  );

  const total = rows.reduce((s, r) => s + r.list.length, 0);

  return (
    <div className="space-y-2">
      {/* Mitarbeiter-Filter */}
      {profiles.length > 1 && (
        <div className="kb-panel flex items-center gap-2 p-2">
          <label htmlFor="kb-mobile-mitarbeiter" className="shrink-0 text-xs font-semibold">
            Mitarbeiter
          </label>
          <select
            id="kb-mobile-mitarbeiter"
            className="kb-input min-h-[44px] flex-1"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">Alle ({profiles.length})</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.vorname} {p.nachname}
              </option>
            ))}
          </select>
        </div>
      )}

      {total === 0 && (
        <div className="kb-panel flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-6 w-6 opacity-40" />
          Keine Einsätze in diesem Zeitraum
        </div>
      )}

      {rows.map(({ day, dateStr, list, holiday, onLeave }) => {
        const weekend = isWeekend(day);
        // Leere Wochenendtage ohne Besonderheit weglassen — sonst scrollt
        // man am Handy nur durch leere Samstage.
        if (weekend && list.length === 0 && !holiday && onLeave.length === 0) return null;

        return (
          <div key={dateStr} className="kb-panel overflow-hidden">
            <div
              className={`flex items-center gap-2 border-b px-3 py-2 ${
                isToday(day) ? "bg-kb-blue/10" : "bg-muted/30"
              }`}
            >
              <span className="text-sm font-bold">
                {format(day, "EEEEEE, dd.MM.", { locale: de })}
              </span>
              {isToday(day) && (
                <span className="rounded-full bg-kb-blue px-2 py-0.5 text-[10px] font-bold text-white">
                  Heute
                </span>
              )}
              {holiday && (
                <span className="flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                  <CalendarOff className="h-3 w-3" />
                  {holiday.bezeichnung || "Betriebsurlaub"}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="kb-btn ml-auto min-h-[44px] min-w-[44px] justify-center"
                  aria-label={`Einsatz am ${format(day, "dd.MM.yyyy")} anlegen`}
                  onClick={() => onAdd(dateStr)}
                >
                  <Plus className="h-5 w-5 text-kb-green" />
                </button>
              )}
            </div>

            <ul className="divide-y">
              {list.map((e) => {
                const project = projectMap.get(e.project_id);
                const prof = profileMap.get(e.user_id);
                const color = getEinsatzColor(
                  project,
                  boardColorMap.get(e.project_id)?.board_color,
                  e.project_id,
                );
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left active:bg-muted/40"
                      onClick={() => onEinsatzClick(e)}
                    >
                      <span
                        className="h-9 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {project?.name ?? "Unbekanntes Projekt"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {prof ? `${prof.vorname} ${prof.nachname}` : "—"}
                          {e.name ? ` · ${e.name}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                        {e.ganztaegig
                          ? "ganztägig"
                          : `${(e.start_time || "").slice(0, 5)}–${(e.end_time || "").slice(0, 5)}`}
                        {e.start_date !== e.end_date && (
                          <span className="block">
                            {format(new Date(e.start_date + "T12:00:00"), "dd.MM.")}–
                            {format(new Date(e.end_date + "T12:00:00"), "dd.MM.")}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}

              {onLeave.map((p) => (
                <li
                  key={`leave-${p.id}`}
                  className="flex min-h-[44px] items-center gap-3 bg-orange-50 px-3 py-2"
                >
                  <Palmtree className="h-4 w-4 shrink-0 text-orange-500" />
                  <span className="text-sm">
                    {p.vorname} {p.nachname}
                  </span>
                  <span className="ml-auto text-xs text-orange-700">Abwesend</span>
                </li>
              ))}

              {/* Wenn im ganzen Zeitraum nichts geplant ist, sagt das schon
                  die Kopfzeile — dann nicht je Tag wiederholen. */}
              {total > 0 && list.length === 0 && onLeave.length === 0 && (
                <li className="px-3 py-3 text-xs text-muted-foreground">Keine Einsätze</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
