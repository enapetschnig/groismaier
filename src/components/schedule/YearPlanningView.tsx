import { useMemo } from "react";
import {
  endOfYear,
  startOfISOWeek,
  addWeeks,
  addDays,
  getISOWeek,
  format,
  isSameDay,
  isBefore,
} from "date-fns";
import { de } from "date-fns/locale";
import { getEinsatzColor } from "./scheduleUtils";
import type {
  Profile,
  Project,
  Einsatz,
  BoardProject,
  CompanyHoliday,
  LeaveRequest,
} from "./scheduleTypes";

// ─── Kapazitäts-Konstanten ──────────────────────────────────────────
/** Auslastung unterhalb dieses Werts (%) gilt als „Kapazität frei" (grün). */
const AUSLASTUNG_GRUEN_UNTER = 75;
/** Auslastung bis zu diesem Wert (%) gilt als „knapp" (gelb), darüber rot. */
const AUSLASTUNG_GELB_BIS = 95;
/** Arbeitstage pro Woche: Montag–Freitag. */
const ARBEITSTAGE_PRO_WOCHE = 5;

interface Props {
  year: number;
  boardProjects: BoardProject[];
  projects: Project[];
  einsaetze: Einsatz[];
  /** Aktive, sichtbare Mitarbeiter (bereits in useScheduleData gefiltert). */
  profiles: Profile[];
  holidays: CompanyHoliday[];
  /** Genehmigte Abwesenheiten (bereits in useScheduleData gefiltert). */
  leaveRequests: LeaveRequest[];
}

type WeekInfo = {
  weekNum: number;
  start: Date; // Montag der ISO-Woche
  month: string;
  /** Arbeitstage (Mo–Fr, ohne Betriebsfeiertage) als yyyy-MM-dd. */
  workdays: string[];
  holidayCount: number;
};

/** Hex-Farbe (#rgb / #rrggbb) → rgba-String mit Alpha. */
function hexToRgba(hex: string, alpha: number): string {
  let raw = hex.replace("#", "");
  if (raw.length === 3) raw = raw.split("").map((c) => c + c).join("");
  const num = parseInt(raw, 16);
  if (Number.isNaN(num) || raw.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Ampelfarbe für Auslastungs-% (Tailwind-Klassen). */
function ampelClasses(pct: number): string {
  if (pct > AUSLASTUNG_GELB_BIS) return "bg-red-200 text-red-900";
  if (pct >= AUSLASTUNG_GRUEN_UNTER) return "bg-yellow-200 text-yellow-900";
  return "bg-green-200 text-green-900";
}

export function YearPlanningView({
  year,
  boardProjects,
  projects,
  einsaetze,
  profiles,
  holidays,
  leaveRequests,
}: Props) {
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const holidaySet = useMemo(
    () => new Set(holidays.map((h) => h.datum)),
    [holidays],
  );

  // Alle ISO-Wochen des Jahres inkl. Arbeitstagen (Mo–Fr ohne Feiertage)
  const weeks = useMemo<WeekInfo[]>(() => {
    const result: WeekInfo[] = [];
    let current = startOfISOWeek(new Date(year, 0, 4)); // KW 1 (ISO)
    const yearEnd = endOfYear(new Date(year, 0, 1));

    while (isBefore(current, yearEnd) || isSameDay(current, yearEnd)) {
      const allWeekdays = Array.from({ length: ARBEITSTAGE_PRO_WOCHE }, (_, i) =>
        format(addDays(current, i), "yyyy-MM-dd"),
      );
      const workdays = allWeekdays.filter((d) => !holidaySet.has(d));
      result.push({
        weekNum: getISOWeek(current),
        start: current,
        month: format(current, "MMM", { locale: de }),
        workdays,
        holidayCount: allWeekdays.length - workdays.length,
      });
      current = addWeeks(current, 1);
      if (result.length > 53) break;
    }
    return result;
  }, [year, holidaySet]);

  // Monats-Header-Gruppen
  const monthGroups = useMemo(() => {
    const groups: { month: string; span: number }[] = [];
    let lastMonth = "";
    for (const w of weeks) {
      if (w.month !== lastMonth) {
        groups.push({ month: w.month, span: 1 });
        lastMonth = w.month;
      } else {
        groups[groups.length - 1].span++;
      }
    }
    return groups;
  }, [weeks]);

  // Verplante Manntage: pro Projekt und KW (Arbeitstage innerhalb des
  // Einsatz-Zeitraums, Betriebsfeiertage zählen nicht).
  // Zusätzlich Gesamtsumme über ALLE Einsätze (auch von Projekten,
  // die nicht auf dem Board liegen) für die Kapazitätszeile.
  const { plannedByProject, plannedTotal } = useMemo(() => {
    const byProject = new Map<string, number[]>();
    const total = new Array<number>(weeks.length).fill(0);

    for (const e of einsaetze) {
      let counts = byProject.get(e.project_id);
      if (!counts) {
        counts = new Array<number>(weeks.length).fill(0);
        byProject.set(e.project_id, counts);
      }
      weeks.forEach((w, wi) => {
        for (const d of w.workdays) {
          if (d >= e.start_date && d <= e.end_date) {
            counts![wi] += 1;
            total[wi] += 1;
          }
        }
      });
    }
    return { plannedByProject: byProject, plannedTotal: total };
  }, [einsaetze, weeks]);

  // Verfügbare Manntage pro KW:
  //   aktive Mitarbeiter × Arbeitstage (Mo–Fr, ohne Feiertage)
  //   − genehmigte Urlaubstage (nur Arbeitstage, nur aktive Mitarbeiter)
  const availablePerWeek = useMemo(() => {
    const activeIds = new Set(profiles.map((p) => p.id));
    return weeks.map((w) => {
      let leaveDays = 0;
      for (const lr of leaveRequests) {
        if (lr.status !== "genehmigt" || !activeIds.has(lr.user_id)) continue;
        for (const d of w.workdays) {
          if (d >= lr.start_date && d <= lr.end_date) leaveDays += 1;
        }
      }
      return Math.max(0, profiles.length * w.workdays.length - leaveDays);
    });
  }, [weeks, profiles, leaveRequests]);

  const todayWeekStart = startOfISOWeek(new Date());
  const isCurrentWeek = (w: WeekInfo) => isSameDay(w.start, todayWeekStart);

  // Zell-Deckkraft: mehr Manntage → intensivere Farbe
  const cellAlpha = (count: number) => Math.min(1, 0.35 + count * 0.06);

  const gridCols = `minmax(160px, 220px) repeat(${weeks.length}, minmax(26px, 1fr))`;

  return (
    <div className="mt-3 space-y-2">
      <div className="border rounded-lg overflow-x-auto bg-white">
        {/* Monats-Header */}
        <div
          className="grid sticky top-0 z-20 bg-white border-b"
          style={{
            gridTemplateColumns: `minmax(160px, 220px) ${monthGroups
              .map((g) => `repeat(${g.span}, minmax(26px, 1fr))`)
              .join(" ")}`,
          }}
        >
          <div className="p-1 border-r sticky left-0 bg-white z-30 text-xs font-semibold flex items-center px-2">
            {year}
          </div>
          {monthGroups.map((g, i) => (
            <div
              key={i}
              className="text-xs font-medium text-center py-1 border-r"
              style={{ gridColumn: `span ${g.span}` }}
            >
              {g.month}
            </div>
          ))}
        </div>

        {/* KW-Header */}
        <div
          className="grid sticky top-[26px] z-20 bg-white border-b"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="p-1 px-2 border-r text-xs text-muted-foreground sticky left-0 bg-white z-30">
            KW
          </div>
          {weeks.map((w, wi) => (
            <div
              key={wi}
              className={`text-[10px] text-center py-0.5 border-r ${
                isCurrentWeek(w)
                  ? "bg-foreground text-background font-semibold rounded-sm"
                  : w.holidayCount > 0
                    ? "bg-gray-100 text-muted-foreground"
                    : "text-muted-foreground"
              }`}
              title={
                w.holidayCount > 0
                  ? `KW ${w.weekNum}: ${w.holidayCount} Feiertag(e)`
                  : `KW ${w.weekNum}`
              }
            >
              {w.weekNum}
            </div>
          ))}
        </div>

        {/* Kapazitätszeile (Auslastung je KW) */}
        <div
          className="grid sticky top-[47px] z-20 bg-white border-b-2"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-2 py-1 border-r text-xs font-semibold sticky left-0 bg-white z-30">
            Auslastung
          </div>
          {weeks.map((w, wi) => {
            const available = availablePerWeek[wi];
            const planned = plannedTotal[wi];
            const overbookedNoCapacity = available === 0 && planned > 0;
            const pct = available > 0 ? Math.round((planned / available) * 100) : 0;
            const tooltip = `KW ${w.weekNum}: ${planned} von ${available} Manntagen verplant (${profiles.length} Mitarbeiter × ${w.workdays.length} Arbeitstage${w.holidayCount > 0 ? `, ${w.holidayCount} Feiertag(e)` : ""})`;
            return (
              <div
                key={wi}
                className={`text-[9px] text-center py-1 border-r font-medium ${
                  overbookedNoCapacity
                    ? "bg-red-200 text-red-900"
                    : ampelClasses(pct)
                } ${isCurrentWeek(w) ? "ring-1 ring-inset ring-foreground/40" : ""}`}
                title={tooltip}
              >
                {overbookedNoCapacity ? "!" : `${pct}%`}
              </div>
            );
          })}
        </div>

        {/* Projekt-Zeilen (board_projects mit deren Farben) */}
        {boardProjects.map((bp) => {
          const project = projectMap.get(bp.project_id);
          const name = project?.name ?? "Unbekanntes Projekt";
          const colorHex = getEinsatzColor(project, bp.board_color, bp.project_id);
          const counts = plannedByProject.get(bp.project_id);
          return (
            <div
              key={bp.id}
              className="grid border-b"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="px-2 py-1.5 border-r text-xs font-medium truncate sticky left-0 bg-white z-10 flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: colorHex }}
                />
                <span className="truncate">{name}</span>
              </div>
              {weeks.map((w, wi) => {
                const count = counts?.[wi] ?? 0;
                // Geplanter Projekt-Zeitraum (board_projects) als leichte Tönung
                const weekMon = format(w.start, "yyyy-MM-dd");
                const weekFri = format(addDays(w.start, ARBEITSTAGE_PRO_WOCHE - 1), "yyyy-MM-dd");
                const inPlannedRange =
                  !!bp.start_date &&
                  !!bp.end_date &&
                  bp.start_date <= weekFri &&
                  bp.end_date >= weekMon;
                return (
                  <div
                    key={wi}
                    className={`relative border-r min-h-[26px] ${
                      isCurrentWeek(w) ? "bg-muted/40" : ""
                    }`}
                  >
                    {inPlannedRange && count === 0 && (
                      <div
                        className="absolute inset-x-0 inset-y-[7px]"
                        style={{ backgroundColor: hexToRgba(colorHex, 0.25) }}
                        title={`${name} – KW ${w.weekNum}: geplanter Zeitraum, keine Einsätze`}
                      />
                    )}
                    {count > 0 && (
                      <div
                        className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-slate-800"
                        style={{ backgroundColor: hexToRgba(colorHex, cellAlpha(count)) }}
                        title={`${name} – KW ${w.weekNum}: ${count} Manntage verplant`}
                      >
                        {count}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {boardProjects.length === 0 && (
          <div className="px-3 py-8 text-sm text-muted-foreground text-center">
            Keine Projekte auf der Plantafel für {year}
          </div>
        )}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <span className="font-medium text-foreground">Auslastung:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-200 border border-green-300" />
          unter {AUSLASTUNG_GRUEN_UNTER} % – Kapazität frei
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-200 border border-yellow-300" />
          {AUSLASTUNG_GRUEN_UNTER}–{AUSLASTUNG_GELB_BIS} % – knapp
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-300" />
          über {AUSLASTUNG_GELB_BIS} % – voll / überbucht
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-foreground" />
          aktuelle KW
        </span>
        <span className="ml-auto">
          Zellenwert = verplante Manntage je KW (Mo–Fr, ohne Feiertage)
        </span>
      </div>
    </div>
  );
}
