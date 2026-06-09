import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_EINHEITEN = ["Stk.", "m²", "lfm", "Std.", "Pauschal", "kg", "Liter", "Tube", "Sack", "Karton", "Palette", "Rolle", "Dose", "Eimer"];

export function useEinheiten() {
  const [einheiten, setEinheiten] = useState<string[]>(DEFAULT_EINHEITEN);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "einheiten")
          .single();
        if (data?.value) {
          setEinheiten(data.value.split(",").map((e: string) => e.trim()).filter(Boolean));
        }
      } catch {
        // Use defaults
      }
    })();
  }, []);

  return einheiten;
}
