// ============================================================================
// Nicht verrechnete Lieferscheine — der Block bei den Offenen Posten
// (Kundenwunsch 11.09.2026: „eine Erinnerung wenn welche offen stehen
//  bleiben … das sie dann zur Abrechnung kommen")
//
// Auf der Offene-Posten-Seite schaut der Chef nach, was zur Abrechnung
// ansteht. Ein übergebener, noch nicht verrechneter Lieferschein gehört
// genau dorthin — auch wenn er (noch) keinen Euro-Betrag hat.
// ============================================================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seitWann, tageSeit, LIEFERSCHEIN_MAHNGRENZE_TAGE } from "@/lib/lieferscheinUebergabe";

interface Zeile {
  id: string;
  nummer: string | null;
  kunde_name: string;
  datum: string;
  unterschrift_am: string | null;
}

export function OffeneLieferscheineKarte() {
  const navigate = useNavigate();
  const [zeilen, setZeilen] = useState<Zeile[]>([]);

  useEffect(() => {
    let weg = false;
    (supabase.from("invoices") as any)
      .select("id, nummer, kunde_name, datum, unterschrift_am")
      .eq("typ", "lieferschein")
      .eq("status", "offen")
      .order("datum", { ascending: true })
      .then(({ data }: { data: Zeile[] | null }) => { if (!weg) setZeilen(data || []); });
    return () => { weg = true; };
  }, []);

  if (zeilen.length === 0) return null;

  return (
    <div className="space-y-1.5 border-t border-border pt-2 text-sm">
      <div className="flex items-center gap-1.5 font-semibold">
        <Truck className="h-4 w-4" />
        Nicht verrechnete Lieferscheine
        <span className="ml-auto rounded-full bg-orange-100 px-2 text-xs font-bold text-orange-800">{zeilen.length}</span>
      </div>
      <ul className="space-y-1">
        {zeilen.map((z) => {
          const alt = tageSeit(z.unterschrift_am || z.datum) >= LIEFERSCHEIN_MAHNGRENZE_TAGE;
          return (
            <li key={z.id}>
              <button
                type="button"
                className="w-full rounded px-1.5 py-1 text-left hover:bg-muted/60"
                onClick={() => navigate(`/invoices/${z.id}`)}
                title="Lieferschein öffnen"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{z.kunde_name || "—"}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{z.nummer || ""}</span>
                </div>
                <div className={`text-xs ${alt ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                  übergeben {seitWann(z.unterschrift_am || z.datum)}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
