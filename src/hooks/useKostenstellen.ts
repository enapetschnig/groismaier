/**
 * Lädt die Kostenstellen-Auswahlliste (admin_config_options, kategorie=
 * 'kostenstelle') einmal je Bildschirm und liefert fertige Beschriftungen.
 *
 * Ohne die geladene Liste zeigten die Stundenlisten für alles außer
 * „Baustelle" nur „🏢 Firma" — neue Kostenstellen wie Fuhrpark und Maschinen
 * wären dort nicht auseinanderzuhalten gewesen.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  kostenstelleAnzeige,
  kostenstelleLabel,
  type KostenstelleOption,
} from "@/lib/kostenstellen";

export function useKostenstellen() {
  const [optionen, setOptionen] = useState<KostenstelleOption[]>([]);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const { data } = await supabase
        .from("admin_config_options")
        .select("wert, label")
        .eq("kategorie", "kostenstelle")
        .eq("is_active", true)
        .order("sort_order");
      if (!abgebrochen && data) setOptionen(data as KostenstelleOption[]);
    })();
    return () => { abgebrochen = true; };
  }, []);

  const anzeige = useCallback(
    (kostenstelle: string | null | undefined, locationType?: string | null) =>
      kostenstelleAnzeige(kostenstelle, locationType, optionen),
    [optionen]
  );

  const label = useCallback(
    (kostenstelle: string | null | undefined, locationType?: string | null) =>
      kostenstelleLabel(kostenstelle, locationType, optionen),
    [optionen]
  );

  return { kostenstellen: optionen, anzeige, label };
}
