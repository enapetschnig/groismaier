import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MapPin, Calendar, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfISOWeek, addDays, isWithinInterval, parseISO, isSameDay } from "date-fns";
import { de } from "date-fns/locale";

type EinsatzInfo = {
  id: string;
  project_name: string;
  start_date: string;
  end_date: string;
  ganztaegig: boolean;
  start_time: string | null;
  end_time: string | null;
  adresse: string | null;
  name: string | null;
};

type TeamInfo = {
  team_name: string;
};

export function MeineEinteilung({ userId }: { userId: string }) {
  const [einsaetze, setEinsaetze] = useState<EinsatzInfo[]>([]);
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    const weekStart = startOfISOWeek(new Date());
    const weekEnd = addDays(weekStart, 6);
    const fromDate = format(weekStart, "yyyy-MM-dd");
    const toDate = format(weekEnd, "yyyy-MM-dd");

    // Fetch einsaetze for this week
    const { data: einsData } = await supabase
      .from("einsaetze")
      .select("id, project_id, start_date, end_date, ganztaegig, start_time, end_time, adresse, name")
      .eq("user_id", userId)
      .lte("start_date", toDate)
      .gte("end_date", fromDate)
      .order("start_date");

    if (einsData && einsData.length > 0) {
      // Fetch project names
      const projectIds = [...new Set(einsData.map(e => e.project_id))];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);

      const projectMap = new Map((projects || []).map(p => [p.id, p.name]));
      setEinsaetze(einsData.map(e => ({
        ...e,
        project_name: projectMap.get(e.project_id) || "Projekt",
      })));
    } else {
      setEinsaetze([]);
    }

    // Check if user is in a team
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (membership) {
      const { data: teamData } = await supabase
        .from("teams")
        .select("name")
        .eq("id", membership.team_id)
        .maybeSingle();
      setTeam(teamData ? { team_name: teamData.name } : null);
    } else {
      setTeam(null);
    }

    setLoading(false);
  };

  if (loading) return null;
  if (einsaetze.length === 0 && !team) return null;

  const today = new Date();
  const weekStart = startOfISOWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <Card className="mb-4 border-orange-200 bg-orange-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-5 w-5 text-orange-600" />
          Meine Einteilung diese Woche
          {team && (
            <Badge variant="outline" className="ml-2 text-xs">
              <Users className="h-3 w-3 mr-1" />
              {team.team_name}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {einsaetze.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Einsätze diese Woche</p>
        ) : (
          <div className="space-y-2">
            {einsaetze.map(e => {
              const eStart = parseISO(e.start_date);
              const eEnd = parseISO(e.end_date);
              const isToday = isSameDay(eStart, today) || isWithinInterval(today, { start: eStart, end: eEnd });

              return (
                <div
                  key={e.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                    isToday ? "bg-orange-100 border-orange-300" : "bg-white"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{e.project_name}</div>
                    {e.name && <div className="text-xs text-muted-foreground">{e.name}</div>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(eStart, "dd.MM.", { locale: de })}
                        {e.start_date !== e.end_date && ` – ${format(eEnd, "dd.MM.", { locale: de })}`}
                      </span>
                      {!e.ganztaegig && e.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {e.start_time} – {e.end_time}
                        </span>
                      )}
                      {e.adresse && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {e.adresse}
                        </span>
                      )}
                    </div>
                  </div>
                  {isToday && (
                    <Badge className="bg-orange-600 text-white shrink-0">Heute</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Wochenübersicht als Mini-Gantt */}
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {weekDays.map(day => {
            const dayStr = format(day, "yyyy-MM-dd");
            const hasEinsatz = einsaetze.some(e =>
              isWithinInterval(day, { start: parseISO(e.start_date), end: parseISO(e.end_date) })
            );
            const isToday2 = isSameDay(day, today);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div key={dayStr} className="flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground">
                  {format(day, "EE", { locale: de })}
                </span>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                    isToday2
                      ? "bg-orange-600 text-white"
                      : hasEinsatz
                      ? "bg-orange-200 text-orange-800"
                      : isWeekend
                      ? "text-gray-300"
                      : "text-gray-500"
                  }`}
                >
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
