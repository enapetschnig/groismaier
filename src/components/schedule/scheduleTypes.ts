export type Profile = { id: string; vorname: string; nachname: string };
export type Project = {
  id: string;
  name: string;
  status?: string;
  geplanter_start?: string | null;
  geplantes_ende?: string | null;
  /** Geschäftsbereich (montipro/bks/…/chef) — bestimmt Bar-Farbe und
   *  Google-Kalender. Siehe src/lib/calendarCategories.ts. */
  kategorie?: string | null;
};

// Legacy — kept for migration period
export type Assignment = {
  id: string;
  user_id: string;
  project_id: string;
  datum: string;
  notizen: string | null;
  start_time: string | null;
  end_time: string | null;
  google_event_id: string | null;
};

// NEW: Einsatz (date-range deployment, replaces Assignment)
export type Einsatz = {
  id: string;
  user_id: string;
  project_id: string;
  name: string | null;
  adresse: string | null;
  beschreibung: string | null;
  start_date: string;
  end_date: string;
  ganztaegig: boolean;
  start_time: string | null;
  end_time: string | null;
  google_event_id: string | null;
};

// NEW: Team
export type Team = {
  id: string;
  name: string;
  sort_order: number;
};

// NEW: Team Member
export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  sort_order: number;
};

// NEW: Board Project (project pinned to the Plantafel)
export type BoardProject = {
  id: string;
  project_id: string;
  board_color: string | null;
  color_mode: "status" | "custom";
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
  beschreibung: string | null;
};

export type Resource = {
  id: string;
  project_id: string;
  datum: string;
  resource_name: string;
  menge: number | null;
  einheit: string | null;
};

export type DailyTarget = {
  id: string;
  project_id: string;
  datum: string;
  tagesziel: string | null;
  nachkalkulation_stunden: number | null;
  notizen: string | null;
};

export type LeaveRequest = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  days: number;
};

export type CompanyHoliday = {
  id: string;
  datum: string;
  bezeichnung: string | null;
};

export type EmployeeColor = {
  employee_id: string;
  bg_color: string;
  text_color: string;
};

export type ScheduleMode = "week" | "month" | "year";

// Color palette for board projects (~20 pastel colors)
export const BOARD_COLORS = [
  "#F9E4B7", "#E8F0A4", "#C5E8B0", "#A7E8D0", "#A7D8E8",
  "#A7C7E7", "#B4B0E8", "#D4B0E8", "#E8B0D4", "#E8B0B0",
  "#F5C6A0", "#F5E0A0", "#D4E8A0", "#A0E8C5", "#A0D4E8",
  "#C0C0E8", "#E0C0E8", "#E8C0D0", "#E8D0C0", "#D0D0D0",
];
