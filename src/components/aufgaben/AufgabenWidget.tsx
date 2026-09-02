// ============================================================================
// AufgabenWidget — Aufgaben auf dem Startbildschirm (Kundenwunsch 19.08.2026):
//
//   Admin:       farbliche Status-Übersicht ("Den Status darüber sehe ich als
//                Admin am Homebildschirm") + Hinweis auf wartende Freigaben.
//   Mitarbeiter: "Meine Aufgaben" — die Nachricht an die zugewiesene Person:
//                sobald eine (freigegebene) Aufgabe ihr oder ihrem Team
//                zugewiesen ist, steht sie hier beim Öffnen der App.
//
// Ohne relevante Aufgaben rendert das Widget nichts — die Startmaske bleibt
// aufgeräumt.
// ============================================================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Aufgabe, AufgabeStatus, STATUS_META, STATUS_REIHENFOLGE,
  aufgabenTable, fristInfo, istMirZugewiesen, ladeMeineTeamIds, PRIO_META, prioRang, prioVon,
} from "./aufgabenShared";

export function AufgabenWidget({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const navigate = useNavigate();
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [meineTeamIds, setMeineTeamIds] = useState<string[]>([]);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const [teamIds, res] = await Promise.all([
          ladeMeineTeamIds(userId),
          aufgabenTable().select("*").order("created_at", { ascending: false }),
        ]);
        if (!aktiv) return;
        setMeineTeamIds(teamIds);
        setAufgaben(((res.data as Aufgabe[]) || []));
      } catch { /* Startseite darf am Aufgaben-Modul nicht scheitern */ }
      if (aktiv) setGeladen(true);
    })();
    return () => { aktiv = false; };
  }, [userId]);

  if (!geladen) return null;

  const meine = aufgaben.filter(
    (a) => istMirZugewiesen(a, userId, meineTeamIds) && (a.status === "offen" || a.status === "in_arbeit"),
  );

  const zeile = (a: Aufgabe) => {
    const frist = fristInfo(a.faellig_am);
    const hoch = prioVon(a) === "hoch";
    const meta = STATUS_META[a.status];
    return (
      <div key={a.id} className="flex items-center gap-2 rounded border bg-white px-2.5 py-2 text-sm">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.punkt}`} title={meta.label} />
        <span className="min-w-0 flex-1 truncate font-medium">{a.titel}</span>
        {hoch && (
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIO_META.hoch.chip}`}>Hoch</span>
        )}
        {frist && (
          <span className={`shrink-0 text-xs ${frist.ueberfaellig ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
            {frist.text}
          </span>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------- Admin
  if (isAdmin) {
    if (aufgaben.length === 0) return null;
    const anzahl = (s: AufgabeStatus) => aufgaben.filter((a) => a.status === s).length;
    const freigaben = anzahl("wartet_freigabe");
    const naechste = aufgaben
      .filter((a) => a.status === "offen" || a.status === "in_arbeit")
      // Hohe Priorität zuerst (Kundenwunsch 24.08.2026), dann nach Frist.
      .sort((a, b) => (prioRang(a) - prioRang(b))
        || (!a.faellig_am ? 1 : !b.faellig_am ? -1 : a.faellig_am < b.faellig_am ? -1 : 1))
      .slice(0, 3);
    return (
      <Card className="cursor-pointer border-blue-200 bg-blue-50/30 transition-colors hover:bg-blue-50/60"
        onClick={() => navigate("/aufgaben")}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo className="h-5 w-5 text-kb-blue-dark" />
            Aufgaben
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_REIHENFOLGE.map((s) => (
              <span key={s} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_META[s].chip}`}>
                {anzahl(s)} {STATUS_META[s].label}
              </span>
            ))}
          </div>
          {freigaben > 0 && (
            <p className="rounded border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-800">
              {freigaben === 1
                ? "1 Aufgabe wartet auf deine Freigabe."
                : `${freigaben} Aufgaben warten auf deine Freigabe.`}
            </p>
          )}
          {/* Auch der Chef hat eigene Aufgaben (z. B. Nachfrage-Termine nach
              dem Angebotsversand) — sie stehen hier unter „Meine Aufgaben",
              genau wie die Antworten in der App es versprechen. */}
          {meine.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-kb-blue-dark">
                Meine Aufgaben
                <span className="rounded-full bg-kb-blue px-1.5 py-0.5 text-[10px] font-bold text-white">{meine.length}</span>
              </p>
              {meine.slice(0, 3).map(zeile)}
            </div>
          )}
          {naechste.length > 0 && (
            <div className="space-y-1.5">
              {meine.length > 0 && <p className="text-xs font-semibold text-muted-foreground">Nächste Aufgaben im Betrieb</p>}
              {naechste.map(zeile)}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------- Mitarbeiter
  if (meine.length === 0) return null;
  return (
    <Card className="cursor-pointer border-blue-200 bg-blue-50/30 transition-colors hover:bg-blue-50/60"
      onClick={() => navigate("/aufgaben")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="h-5 w-5 text-kb-blue-dark" />
          Meine Aufgaben
          <span className="rounded-full bg-kb-blue px-2 py-0.5 text-xs font-bold text-white">{meine.length}</span>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {meine.slice(0, 4).map(zeile)}
        {meine.length > 4 && (
          <p className="text-xs text-muted-foreground">… und {meine.length - 4} weitere</p>
        )}
      </CardContent>
    </Card>
  );
}
