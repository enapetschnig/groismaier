import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ConfigOption {
  id: string;
  wert: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  farbe: string | null;
}

export function useConfigOptions(kategorie: string) {
  const [options, setOptions] = useState<ConfigOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from("admin_config_options" as never) as any)
      .select("*")
      .eq("kategorie", kategorie)
      .eq("is_active", true)
      .order("sort_order");
    setOptions((data || []) as ConfigOption[]);
    setLoading(false);
  }, [kategorie]);

  useEffect(() => { load(); }, [load]);

  return { options, loading, refetch: load };
}
