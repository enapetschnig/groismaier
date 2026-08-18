/**
 * Read-only-Anzeige der im Regiebericht gebuchten Maschinen/Geräte.
 *
 * Kundenwunsch 08/2026: Die Maschinen waren bisher NUR im erzeugten PDF
 * sichtbar — auf der Detailseite fehlten sie komplett. Bearbeitet werden sie
 * weiterhin im Bearbeiten-Dialog (DisturbanceForm); ohne Einträge bleibt die
 * Karte unsichtbar.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Maschine {
  id: string;
  maschine: string | null;
  menge: string | null;
  einheit: string | null;
  einzelpreis: number | null;
}

const eur = (n: number) => `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DisturbanceMaschinen({ disturbanceId }: { disturbanceId: string }) {
  const [maschinen, setMaschinen] = useState<Maschine[]>([]);

  useEffect(() => {
    let cancelled = false;
    (supabase.from("disturbance_maschinen" as never) as any)
      .select("id, maschine, menge, einheit, einzelpreis")
      .eq("disturbance_id", disturbanceId)
      .order("created_at", { ascending: true })
      .then(({ data }: any) => {
        if (!cancelled) setMaschinen((data as Maschine[]) || []);
      });
    return () => { cancelled = true; };
  }, [disturbanceId]);

  if (maschinen.length === 0) return null;

  const betrag = (m: Maschine): number | null => {
    const menge = Number(String(m.menge ?? "").replace(",", ".")) || 0;
    return m.einzelpreis != null && menge > 0 ? menge * Number(m.einzelpreis) : null;
  };
  const summe = maschinen.reduce((s, m) => s + (betrag(m) || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" />
          Maschinen / Werkzeug
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {maschinen.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <span className="flex-1 min-w-[8rem] font-medium">{m.maschine || "Maschine"}</span>
            <span className="text-muted-foreground whitespace-nowrap">
              {m.menge || "—"} {m.einheit || ""}
            </span>
            {m.einzelpreis != null && (
              <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                à {eur(Number(m.einzelpreis))}
              </span>
            )}
            <span className="ml-auto font-medium tabular-nums whitespace-nowrap">
              {betrag(m) != null ? eur(betrag(m)!) : ""}
            </span>
          </div>
        ))}
        {summe > 0 && (
          <div className="flex justify-end pt-1 text-sm font-semibold tabular-nums">
            Summe: {eur(summe)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
