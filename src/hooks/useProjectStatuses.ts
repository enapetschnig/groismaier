import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectStatus {
  id: string;
  name: string;
  farbe_bg: string;
  farbe_text: string;
  sort_order: number;
  is_default: boolean;
}

/**
 * Lädt alle konfigurierten Projekt-Status aus der DB (project_statuses-Tabelle).
 * Admin kann diese im Admin-Bereich anpassen (Name, Farbe, Reihenfolge, Default).
 */
export function useProjectStatuses() {
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("project_statuses")
        .select("id, name, farbe_bg, farbe_text, sort_order, is_default")
        .order("sort_order");
      if (!active) return;
      setStatuses((data as ProjectStatus[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const defaultStatus = statuses.find((s) => s.is_default) || statuses[0] || null;

  const findByName = (name: string | null | undefined): ProjectStatus | null => {
    if (!name) return null;
    const lc = name.toLowerCase().trim();
    return statuses.find((s) => s.name.toLowerCase() === lc) || null;
  };

  return { statuses, loading, defaultStatus, findByName };
}
