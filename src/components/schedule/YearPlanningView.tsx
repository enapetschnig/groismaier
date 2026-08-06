import { useEffect, useMemo, useState } from "react";
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
import { JahresWandkalender } from "./JahresWandkalender";
import { supabase } from "@/integrations/supabase/client";
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

  // ── Solltage aus den kalkulierten Stunden des Angebots (Kundenwunsch:
  //    „die Kalendertage belegen, die sie anhand der kalkulierten Stunden
  //    brauchen"). Ein Manntag = 10 h (Regelarbeitszeit Mo–Do). ──
  const STUNDEN_PRO_MANNTAG = 10;
  const [sollManntage, setSollManntage] = useState<Map<string, number>>(new Map());
  /** Darstellung: Wandkalender (Kundenvorlage) oder Wochenraster mit Auslastung. */
  const [ansicht, setAnsicht] = useState<"wandkalender" | "wochen">("wandkalender");
  useEffect(() => {
    const ids = boardProjects.map((bp) => bp.project_id);
    if (ids.length === 0) { setSollManntage(new Map()); return; }
    let abgebrochen = false;
    (async () => {
      // Referenz-Angebot je Projekt: gleiche Rangfolge wie in der
      // Projektübersicht (angenommen vor verrechnet vor offen vor Entwurf).
      const { data: angebote } = await supabase
        .from("invoices")
        .select("id, project_id, status, datum")
        .in("project_id", ids)
        .eq("typ", "angebot")
        .not("status", "in", '("storniert","abgelehnt")')
        .or("archiviert.is.null,archiviert.eq.false");
      const rang = (st: string) =>
        st === "angenommen" ? 0
        : ["verrechnet", "bezahlt", "teilbezahlt"].includes(st) ? 1
        : ["offen", "gesendet"].includes(st) ? 2 : 3;
      const beste = new Map<string, { id: string; r: number; datum: string }>();
      for (const a of ((angebote as { id: string; project_id: string; status: string; datum: string }[]) || [])) {
        const b = beste.get(a.project_id);
        const r = rang(a.status);
        if (!b || r < b.r || (r === b.r && a.datum > b.datum)) beste.set(a.project_id, { id: a.id, r, datum: a.datum });
      }
      const invoiceIds = [...beste.values()].map((b) => b.id);
      if (invoiceIds.length === 0) { if (!abgebrochen) setSollManntage(new Map()); return; }
      const { data: items } = await supabase
        .from("invoice_items")
        .select("invoice_id, menge, arbeitszeit_minuten")
        .in("invoice_id", invoiceIds);
      const stundenJeInvoice = new Map<string, number>();
      for (const it of ((items as { invoice_id: string; menge: number | null; arbeitszeit_minuten: number | null }[]) || [])) {
        const h = ((Number(it.arbeitszeit_minuten) || 0) / 60) * (Number(it.menge) || 0);
        stundenJeInvoice.set(it.invoice_id, (stundenJeInvoice.get(it.invoice_id) || 0) + h);
      }
      const map = new Map<string, number>();
      for (const [projektId, b] of beste) {
        const stunden = stundenJeInvoice.get(b.id) || 0;
        if (stunden > 0) map.set(projektId, Math.ceil(stunden / STUNDEN_PRO_MANNTAG));
      }
      if (!abgebrochen) setSollManntage(map);
    })();
    return () => { abgebrochen = true; };
  }, [boardProjects]);

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
      return {
        available: Math.max(0, profiles.length * w.workdays.length - leaveDays),
        leaveDays,
      };
    });
  }, [weeks, profiles, leaveRequests]);

  const todayWeekStart = startOfISOWeek(new Date());
  const isCurrentWeek = (w: WeekInfo) => isSameDay(w.start, todayWeekStart);

  // Zell-Deckkraft: mehr Manntage → intensivere Farbe
  const cellAlpha = (count: number) => Math.min(1, 0.35 + count * 0.06);

  const gridCols = `minmax(160px, 220px) repeat(${weeks.length}, minmax(26px, 1fr))`;

  // ── Handy: kompakte KW-Liste statt 53-Spalten-Raster ──
  // Nur ab der aktuellen KW, sonst scrollt man am Handy durch das
  // halbe abgelaufene Jahr.
  const mobileWeeks = useMemo(() => {
    const idx = weeks.findIndex((w) => isSameDay(w.start, todayWeekStart));
    const from = idx > 0 ? idx : 0;
    return weeks
      .map((w, wi) => ({ w, wi }))
      .slice(from)
      .map(({ w, wi }) => {
        const { available, leaveDays } = availablePerWeek[wi];
        const planned = plannedTotal[wi];
        const pct = available > 0 ? Math.round((planned / available) * 100) : 0;
        const projectsInWeek = boardProjects
          .map((bp) => ({
            name: projectMap.get(bp.project_id)?.name ?? "Unbekannt",
            color: getEinsatzColor(projectMap.get(bp.project_id), bp.board_color, bp.project_id),
            count: plannedByProject.get(bp.project_id)?.[wi] ?? 0,
          }))
          .filter((p) => p.count > 0);
        return { w, wi, available, leaveDays, planned, pct, projectsInWeek };
      });
  }, [weeks, availablePerWeek, plannedTotal, boardProjects, projectMap, plannedByProject, todayWeekStart]);

  return (
    <div className="mt-3 space-y-2">
      {/* Ansicht-Umschalter (nur Desktop — am Handy bleibt die KW-Liste) */}
      <div className="hidden gap-1 md:flex">
        <button
          type="button"
          className={ansicht === "wandkalender" ? "kb-tab-active" : "kb-tab"}
          onClick={() => setAnsicht("wandkalender")}
        >
          Wandkalender
        </button>
        <button
          type="button"
          className={ansicht === "wochen" ? "kb-tab-active" : "kb-tab"}
          onClick={() => setAnsicht("wochen")}
        >
          Wochenraster & Auslastung
        </button>
      </div>

      {/* ── Wandkalender (Kundenvorlage, KingBill-Blau) ── */}
      {ansicht === "wandkalender" && (
        <div className="hidden md:block">
          <JahresWandkalender
            year={year}
            boardProjects={boardProjects}
            projects={projects}
            einsaetze={einsaetze}
            holidays={holidays}
            sollManntage={sollManntage}
            stundenProManntag={STUNDEN_PRO_MANNTAG}
          />
        </div>
      )}

      {/* ── Handy-Ansicht ── */}
      <div className="space-y-2 md:hidden">
        {mobileWeeks.map(({ w, wi, available, leaveDays, planned, pct, projectsInWeek }) => (
          <div key={wi} className="kb-panel overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
              <span className="text-sm font-bold">KW {w.weekNum}</span>
              <span className="text-xs text-muted-foreground">
                ab {format(w.start, "dd.MM.", { locale: de })}
              </span>
              {isCurrentWeek(w) && (
                <span className="rounded-full bg-kb-blue px-2 py-0.5 text-[10px] font-bold text-white">
                  aktuell
                </span>
              )}
              <span
                className={`ml-auto rounded-md px-2 py-1 text-xs font-bold ${
                  available === 0 && planned > 0 ? "bg-red-200 text-red-900" : ampelClasses(pct)
                }`}
              >
                {available === 0 && planned > 0 ? "überbucht" : `${pct} %`}
              </span>
            </div>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {planned} von {available} Manntagen verplant
              {w.holidayCount > 0 && ` · ${w.holidayCount} Feiertag(e)`}
              {leaveDays > 0 && ` · ${leaveDays} Urlaubstag(e)`}
            </div>
            {projectsInWeek.length > 0 && (
              <ul className="divide-y border-t">
                {projectsInWeek.map((p) => (
                  <li key={p.name} className="flex items-center gap-2 px-3 py-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <span className="text-xs font-semibold">{p.count} MT</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {ansicht === "wochen" && (
      <div className="kb-panel hidden overflow-x-auto md:block">
        {/* Monats-Header */}
        <div
          className="grid sticky top-0 z-20 border-b bg-[hsl(210_60%_96%)]"
          style={{
            gridTemplateColumns: `minmax(160px, 220px) ${monthGroups
              .map((g) => `repeat(${g.span}, minmax(26px, 1fr))`)
              .join(" ")}`,
          }}
        >
          <div className="p-1 border-r sticky left-0 z-30 flex items-center bg-[hsl(210_60%_96%)] px-2 text-xs font-bold text-kb-blue-dark">
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
          className="grid sticky top-[26px] z-20 border-b bg-[hsl(210_50%_98%)]"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="p-1 px-2 border-r text-xs text-kb-blue-dark sticky left-0 z-30 bg-[hsl(210_50%_98%)]">
            KW
          </div>
          {weeks.map((w, wi) => (
            <div
              key={wi}
              className={`text-[10px] text-center py-0.5 border-r ${
                isCurrentWeek(w)
                  ? "bg-kb-blue text-white font-semibold rounded-sm"
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
            const { available, leaveDays } = availablePerWeek[wi];
            const planned = plannedTotal[wi];
            const overbookedNoCapacity = available === 0 && planned > 0;
            const pct = available > 0 ? Math.round((planned / available) * 100) : 0;
            const tooltip = `KW ${w.weekNum}: ${planned} von ${available} Manntagen verplant (${profiles.length} Mitarbeiter × ${w.workdays.length} Arbeitstage${w.holidayCount > 0 ? `, ${w.holidayCount} Feiertag(e) abgezogen` : ""}${leaveDays > 0 ? `, ${leaveDays} Urlaubstag(e) abgezogen` : ""})`;
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
              <div className="px-2 py-1.5 border-r text-xs font-medium sticky left-0 bg-white z-10 flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: colorHex }}
                />
                <span className="min-w-0 truncate">{name}</span>
                {(() => {
                  // Solltage aus den kalkulierten Angebotsstunden gegen die
                  // tatsächlich verplanten Manntage (Kundenwunsch).
                  const soll = sollManntage.get(bp.project_id);
                  if (!soll) return null;
                  const verplant = (counts || []).reduce((a, b) => a + b, 0);
                  const fertig = verplant >= soll;
                  return (
                    <span
                      className={`ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] font-bold tabular-nums ${
                        fertig ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                      }`}
                      title={`Laut Angebot kalkuliert: ${soll} Manntage (à ${STUNDEN_PRO_MANNTAG} h) — davon ${verplant} auf der Plantafel verplant`}
                    >
                      {verplant}/{soll} MT
                    </span>
                  );
                })()}
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
      )}

      {/* Legende (Wochenraster) */}
      {ansicht === "wochen" && (
      <div className="kb-panel flex flex-wrap items-center gap-x-4 gap-y-1 p-2 text-xs text-muted-foreground">
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
          <span className="inline-block w-3 h-3 rounded-sm bg-kb-blue" />
          aktuelle KW
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800">3/8 MT</span>
          verplant / laut Angebot kalkuliert (à 10 h)
        </span>
        <span className="ml-auto">
          Zellenwert = verplante Manntage je KW (Mo–Fr, ohne Feiertage)
        </span>
      </div>
      )}
    </div>
  );
}
