import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt einmalig die IDs aller Profile mit hidden=true.
 * Wird an allen Stellen genutzt die Mitarbeiter/User in Listen anzeigen,
 * um diese User ausblenden zu können (z.B. Admin/Inhaber der sich
 * selbst nicht in Mitarbeiter-Dropdowns sehen will).
 *
 * Rückgabe: Set<string> für schnellen O(1)-Lookup.
 */
export function useHiddenUserIds() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from("profiles" as never) as any)
        .select("id")
        .eq("hidden", true);
      if (!cancelled) {
        setHiddenIds(new Set(((data as any[]) || []).map((p: any) => p.id)));
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { hiddenIds, loaded };
}

/**
 * Helper: filtert ein Array von Items (die ein `id`- oder `user_id`-Feld
 * haben) und blendet alle aus, die als hidden markiert sind.
 */
export function filterVisibleUsers<T extends { id?: string | null; user_id?: string | null }>(
  items: T[],
  hiddenIds: Set<string>,
): T[] {
  if (hiddenIds.size === 0) return items;
  return items.filter((item) => {
    const id = item.user_id || item.id;
    return !id || !hiddenIds.has(id);
  });
}
