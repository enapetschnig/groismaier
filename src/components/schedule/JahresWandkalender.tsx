/**
 * Jahres-Wandkalender — 1:1 nach der Druckvorlage des Kunden („so in etwa,
 * gerne in den KingBill-Blautönen"): 12 Monatsspalten, die Tage untereinander,
 * Wochenenden/Feiertage als dunkle Zeilen, KW-Nummern bei jedem Montag.
 *
 * Die Projekte belegen ihre Kalendertage farbig:
 *   - satt      = echte Einsätze von der Plantafel (je Projektfarbe; mehrere
 *                 Projekte am selben Tag teilen sich die Zelle)
 *   - blass     = Prognose aus den KALKULIERTEN Angebotsstunden: ab dem
 *                 geplanten Projektstart so viele Arbeitstage, wie das Projekt
 *                 laut Kalkulation braucht (Manntage ÷ Partiegröße)
 *
 * Nur Arbeitstage (Mo–Fr ohne Betriebsfeiertage) werden belegt — Wochenenden
 * bleiben wie am Wandkalender dunkel.
 */
import { useMemo } from "react";
import { format, getDaysInMonth, getISOWeek } from "date-fns";
import { de } from "date-fns/locale";
import { getEinsatzColor } from "./scheduleUtils";
import type { BoardProject, CompanyHoliday, Einsatz, Project } from "./scheduleTypes";

interface Props {
  year: number;
  boardProjects: BoardProject[];
  projects: Project[];
  einsaetze: Einsatz[];
  holidays: CompanyHoliday[];
  /** Benötigte Manntage je Projekt aus den kalkulierten Angebotsstunden. */
  sollManntage: Map<string, number>;
  stundenProManntag: number;
}

const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WOCHENTAG_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Hex → rgba (Deckkraft für satt/blass). */
function rgba(hex: string, alpha: number): string {
  let raw = (hex || "").replace("#", "");
  if (raw.length === 3) raw = raw.split("").map((c) => c + c).join("");
  const n = parseInt(raw, 16);
  if (Number.isNaN(n) || raw.length !== 6) return `rgba(148,163,184,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function JahresWandkalender({
  year, boardProjects, projects, einsaetze, holidays, sollManntage, stundenProManntag,
}: Props) {
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.datum)), [holidays]);
  const heute = format(new Date(), "yyyy-MM-dd");

  const farbe = (bp: BoardProject) =>
    getEinsatzColor(projectMap.get(bp.project_id), bp.board_color, bp.project_id);

  /** Alle Arbeitstage des Jahres (Mo–Fr, ohne Betriebsfeiertage), sortiert. */
  const arbeitstage = useMemo(() => {
    const tage: string[] = [];
    for (let m = 0; m < 12; m++) {
      const anz = getDaysInMonth(new Date(year, m, 1));
      for (let t = 1; t <= anz; t++) {
        const d = new Date(year, m, t);
        const iso = format(d, "yyyy-MM-dd");
        const wt = d.getDay();
        if (wt !== 0 && wt !== 6 && !holidaySet.has(iso)) tage.push(iso);
      }
    }
    return tage;
  }, [year, holidaySet]);

  // ── Echte Belegung: Datum → projectId → Mitarbeiterzahl ──
  const belegung = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    const arbeitstagSet = new Set(arbeitstage);
    for (const e of einsaetze) {
      for (const iso of arbeitstage) {
        if (iso >= e.start_date && iso <= e.end_date && arbeitstagSet.has(iso)) {
          const tag = map.get(iso) || new Map<string, number>();
          tag.set(e.project_id, (tag.get(e.project_id) || 0) + 1);
          map.set(iso, tag);
        }
      }
    }
    return map;
  }, [einsaetze, arbeitstage]);

  // ── Prognose aus den kalkulierten Stunden: ab Projektstart so viele
  //    Arbeitstage blass füllen, wie das Projekt laut Angebot braucht.
  //    Partiegröße = Ø Mitarbeiter der vorhandenen Einsätze, sonst 2. ──
  const prognose = useMemo(() => {
    const map = new Map<string, Map<string, true>>();
    for (const bp of boardProjects) {
      const soll = sollManntage.get(bp.project_id);
      if (!soll) continue;

      // Bereits fest verplante Manntage abziehen.
      let verplant = 0;
      let belegteTage = 0;
      for (const [, tag] of belegung) {
        const n = tag.get(bp.project_id) || 0;
        if (n > 0) { verplant += n; belegteTage++; }
      }
      const partie = belegteTage > 0 ? Math.max(1, Math.round(verplant / belegteTage)) : 2;
      const restManntage = Math.max(0, soll - verplant);
      if (restManntage === 0) continue;
      const restArbeitstage = Math.ceil(restManntage / partie);

      // Start: geplanter Projektstart; sonst der Tag nach dem letzten Einsatz.
      let start = bp.start_date || null;
      if (!start) {
        const letzter = einsaetze
          .filter((e) => e.project_id === bp.project_id)
          .reduce<string | null>((max, e) => (!max || e.end_date > max ? e.end_date : max), null);
        start = letzter;
      }
      if (!start) continue;

      let gefuellt = 0;
      for (const iso of arbeitstage) {
        if (gefuellt >= restArbeitstage) break;
        if (iso < start) continue;
        // Tage mit echtem Einsatz DIESES Projekts nicht doppelt zählen.
        if (belegung.get(iso)?.get(bp.project_id)) continue;
        const tag = map.get(iso) || new Map<string, true>();
        tag.set(bp.project_id, true);
        map.set(iso, tag);
        gefuellt++;
      }
    }
    return map;
  }, [boardProjects, sollManntage, belegung, einsaetze, arbeitstage]);

  const maxTage = 31;

  return (
    <div className="space-y-2">
      <div className="kb-panel overflow-x-auto">
        <div className="min-w-[1080px] p-2">
          {/* Jahreszahl wie am Wandkalender */}
          <div className="mb-1 px-1 text-2xl font-black tracking-tight text-kb-blue-dark">{year}</div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(12, minmax(88px, 1fr))", gap: "3px" }}>
            {MONATE.map((monat, m) => {
              const tageImMonat = getDaysInMonth(new Date(year, m, 1));
              return (
                <div key={monat} className="min-w-0">
                  {/* Monatskopf — KingBill-Titelblau */}
                  <div className="mb-[3px] rounded-sm bg-kb-blue px-1.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                    {monat}
                  </div>
                  <div className="flex flex-col gap-px">
                    {Array.from({ length: maxTage }, (_, i) => i + 1).map((t) => {
                      if (t > tageImMonat) {
                        return <div key={t} className="h-[19px]" />;
                      }
                      const d = new Date(year, m, t);
                      const iso = format(d, "yyyy-MM-dd");
                      const wt = d.getDay();
                      const istWochenende = wt === 0 || wt === 6;
                      const istFeiertag = holidaySet.has(iso);
                      const istHeute = iso === heute;
                      const kw = wt === 1 ? getISOWeek(d) : null;

                      const tagBelegung = belegung.get(iso);
                      const tagPrognose = prognose.get(iso);
                      const segmente: { farbe: string; blass: boolean; titel: string }[] = [];
                      if (tagBelegung) {
                        for (const [pid, n] of tagBelegung) {
                          const bp = boardProjects.find((x) => x.project_id === pid);
                          if (!bp) continue;
                          segmente.push({
                            farbe: farbe(bp),
                            blass: false,
                            titel: `${projectMap.get(pid)?.name || "Projekt"}: ${n} Mitarbeiter eingeteilt`,
                          });
                        }
                      }
                      if (tagPrognose) {
                        for (const [pid] of tagPrognose) {
                          const bp = boardProjects.find((x) => x.project_id === pid);
                          if (!bp) continue;
                          segmente.push({
                            farbe: farbe(bp),
                            blass: true,
                            titel: `${projectMap.get(pid)?.name || "Projekt"}: laut kalkulierten Stunden benötigt (noch nicht eingeteilt)`,
                          });
                        }
                      }

                      return (
                        <div
                          key={t}
                          className={`relative flex h-[19px] items-center overflow-hidden rounded-[2px] px-1 text-[10px] leading-none ${
                            istWochenende || istFeiertag
                              ? "bg-kb-blue-dark/85 text-white/90"
                              : "bg-[hsl(210_45%_95%)] text-foreground"
                          } ${istHeute ? "ring-2 ring-inset ring-kb-yellow" : ""}`}
                          title={`${format(d, "EEEE, d. MMMM yyyy", { locale: de })}${istFeiertag ? " · Betriebsfeiertag" : ""}${segmente.length ? "\n" + segmente.map((s) => s.titel).join("\n") : ""}`}
                        >
                          {/* Projektfarben als Füllung hinter Tageszahl */}
                          {segmente.length > 0 && (
                            <div className="absolute inset-0 flex">
                              {segmente.map((seg, i) => (
                                <div key={i} className="h-full flex-1" style={{ backgroundColor: rgba(seg.farbe, seg.blass ? 0.3 : 0.75) }} />
                              ))}
                            </div>
                          )}
                          <span className="relative z-10 w-4 shrink-0 font-bold tabular-nums">{t}</span>
                          <span className={`relative z-10 text-[8px] ${istWochenende || istFeiertag ? "text-white/70" : "text-muted-foreground"}`}>
                            {WOCHENTAG_KURZ[wt]}
                          </span>
                          {kw !== null && (
                            <span className="relative z-10 ml-auto text-[8px] font-semibold text-kb-blue-dark/70">
                              {istWochenende || istFeiertag ? "" : kw}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legende: Projekte + Bedeutung der Füllungen */}
      <div className="kb-panel flex flex-wrap items-center gap-x-4 gap-y-1.5 p-2 text-xs">
        {boardProjects.map((bp) => {
          const name = projectMap.get(bp.project_id)?.name || "Projekt";
          const soll = sollManntage.get(bp.project_id);
          let verplant = 0;
          for (const [, tag] of belegung) verplant += tag.get(bp.project_id) || 0;
          return (
            <span key={bp.id} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: farbe(bp) }} />
              <span className="max-w-[180px] truncate">{name}</span>
              {soll ? (
                <span
                  className={`rounded px-1 py-0.5 text-[9px] font-bold tabular-nums ${verplant >= soll ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                  title={`${verplant} von ${soll} kalkulierten Manntagen (à ${stundenProManntag} h) eingeteilt`}
                >
                  {verplant}/{soll} MT
                </span>
              ) : null}
            </span>
          );
        })}
        <span className="ml-auto flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-kb-blue-dark/85" /> Wochenende/Feiertag</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm ring-2 ring-inset ring-kb-yellow" /> heute</span>
          <span>satt = eingeteilt · blass = laut Kalkulation nötig</span>
        </span>
      </div>
    </div>
  );
}
