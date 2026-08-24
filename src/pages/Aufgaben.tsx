// ============================================================================
// Aufgaben / ToDo-Liste (Kundenwunsch 19.08.2026) — Liste aller Aufgaben mit
// farblichem Status-System, Filter, Foto-Anzeige und den Aktionen:
//   Admin:        Freigeben (wartet_freigabe -> offen), Wieder öffnen,
//                 Bearbeiten/Löschen immer
//   Zugewiesene:  In Arbeit nehmen, Erledigt melden
//   Ersteller:    Bearbeiten/Löschen, solange die Aufgabe auf Freigabe wartet
//
// Sichtbarkeit macht die RLS (Migration 20260819100000): Mitarbeiter sehen
// eigene + ihnen (bzw. ihrem Team) zugewiesene FREIGEGEBENE Aufgaben; der
// Admin sieht alles.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { Camera, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { usePermissions } from "@/hooks/usePermissions";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { AufgabeDialog } from "@/components/aufgaben/AufgabeDialog";
import {
  AUFGABEN_FOTO_BUCKET, Aufgabe, AufgabeFoto, AufgabeStatus, PRIO_META, STATUS_META, STATUS_REIHENFOLGE, prioRang, prioVon,
  aufgabenFotosTable, aufgabenTable, fotoUrl, fristInfo, istMirZugewiesen, ladeMeineTeamIds,
} from "@/components/aufgaben/aufgabenShared";

type Filter = "alle" | "meine" | AufgabeStatus;

export default function Aufgaben() {
  const zurueck = useZurueck("/");
  const { isAdmin } = usePermissions();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [meineTeamIds, setMeineTeamIds] = useState<string[]>([]);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [teamNamen, setTeamNamen] = useState<Record<string, string>>({});
  const [fotosJeAufgabe, setFotosJeAufgabe] = useState<Record<string, AufgabeFoto[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("alle");
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Aufgabe | null>(null);
  // Deep-Link von der Hauptmaske: /aufgaben?neu=1 öffnet den Anlege-Dialog.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("neu") === "1") { setBearbeite(null); setDialogOffen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lightbox, setLightbox] = useState<{ fotos: AufgabeFoto[]; index: number } | null>(null);

  const laden = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const [teamIds, aufgRes] = await Promise.all([
      ladeMeineTeamIds(user.id),
      aufgabenTable().select("*").order("created_at", { ascending: false }),
    ]);
    setMeineTeamIds(teamIds);
    const rows = ((aufgRes.data as Aufgabe[]) || []);
    setAufgaben(rows);

    // Namen der Ersteller/Zugewiesenen + Teamnamen + Fotos nachladen
    const userIds = [...new Set(rows.flatMap((a) => [a.erstellt_von, a.zugewiesen_an]).filter(Boolean))] as string[];
    const teamIdsGenutzt = [...new Set(rows.map((a) => a.team_id).filter(Boolean))] as string[];
    const aufgabenIds = rows.map((a) => a.id);
    const [profRes, teamRes, fotoRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, vorname, nachname").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; vorname: string | null; nachname: string | null }[] }),
      teamIdsGenutzt.length
        ? supabase.from("teams").select("id, name").in("id", teamIdsGenutzt)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      aufgabenIds.length
        ? aufgabenFotosTable().select("id, aufgabe_id, file_path, file_name").in("aufgabe_id", aufgabenIds).order("created_at")
        : Promise.resolve({ data: [] as AufgabeFoto[] }),
    ]);
    const n: Record<string, string> = {};
    for (const p of (profRes.data || [])) n[p.id] = `${p.vorname || ""} ${p.nachname || ""}`.trim() || "Unbenannt";
    setNamen(n);
    const tn: Record<string, string> = {};
    for (const t of (teamRes.data || [])) tn[t.id] = t.name;
    setTeamNamen(tn);
    const fj: Record<string, AufgabeFoto[]> = {};
    for (const f of ((fotoRes.data as AufgabeFoto[]) || [])) (fj[f.aufgabe_id] ||= []).push(f);
    setFotosJeAufgabe(fj);
    setLoading(false);
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const fehler = (message: string) =>
    toast({ variant: "destructive", title: "Fehler", description: message });

  const statusSetzen = async (a: Aufgabe, status: AufgabeStatus) => {
    const { error } = await aufgabenTable()
      .update({ status, erledigt_am: status === "erledigt" ? new Date().toISOString() : null })
      .eq("id", a.id);
    if (error) { fehler(error.message); return; }
    if (status === "offen" && a.status === "wartet_freigabe") {
      toast({
        title: "Aufgabe freigegeben",
        description: "Die zugewiesene Person bzw. das Team sieht die Aufgabe ab jetzt am Startbildschirm.",
      });
    }
    laden();
  };

  const loeschen = async (a: Aufgabe) => {
    if (!window.confirm(`Aufgabe „${a.titel}“ löschen?`)) return;
    // Storage-Dateien zuerst — die DB-Zeilen räumt der ON DELETE CASCADE ab.
    const pfade = (fotosJeAufgabe[a.id] || []).map((f) => f.file_path);
    if (pfade.length) await supabase.storage.from(AUFGABEN_FOTO_BUCKET).remove(pfade);
    const { error } = await aufgabenTable().delete().eq("id", a.id);
    if (error) { fehler(error.message); return; }
    laden();
  };

  const zuweisungsText = (a: Aufgabe): string =>
    a.zugewiesen_an ? (namen[a.zugewiesen_an] || "Mitarbeiter")
      : a.team_id ? `Team ${teamNamen[a.team_id] || ""}`.trim()
        : "niemandem zugewiesen";

  // Sortierung: Freigaben zuerst, Erledigtes zuletzt; innerhalb nach
  // Priorität (hoch zuerst, Kundenwunsch 24.08.2026), dann Frist
  // (ohne Frist ans Ende), dann neueste zuerst.
  const sortiert = [...aufgaben].sort((a, b) => {
    const s = STATUS_REIHENFOLGE.indexOf(a.status) - STATUS_REIHENFOLGE.indexOf(b.status);
    if (s !== 0) return s;
    const p = prioRang(a) - prioRang(b);
    if (p !== 0) return p;
    if (a.faellig_am !== b.faellig_am) {
      if (!a.faellig_am) return 1;
      if (!b.faellig_am) return -1;
      return a.faellig_am < b.faellig_am ? -1 : 1;
    }
    return a.created_at < b.created_at ? 1 : -1;
  });

  const gefiltert = sortiert.filter((a) => {
    if (filter === "alle") return true;
    if (filter === "meine") return !!userId && istMirZugewiesen(a, userId, meineTeamIds);
    return a.status === filter;
  });

  const anzahl = (f: Filter): number =>
    f === "alle" ? aufgaben.length
      : f === "meine" ? aufgaben.filter((a) => !!userId && istMirZugewiesen(a, userId, meineTeamIds)).length
        : aufgaben.filter((a) => a.status === f).length;

  const filterChips: { key: Filter; label: string }[] = [
    { key: "alle", label: "Alle" },
    { key: "meine", label: "Meine" },
    ...STATUS_REIHENFOLGE.map((s) => ({ key: s as Filter, label: STATUS_META[s].label })),
  ];

  const neueAufgabe = () => { setBearbeite(null); setDialogOffen(true); };

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title="Aufgaben">
        <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Neu" onClick={neueAufgabe} />
      </KBToolbar>

      <main className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Am Handy die wichtigste Aktion groß */}
        <Button className="mb-3 h-12 w-full text-base sm:hidden" onClick={neueAufgabe}>
          <Plus className="mr-2 h-5 w-5" /> Neue Aufgabe
        </Button>

        {/* Filter */}
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {filterChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors ${
                filter === c.key ? "border-kb-blue bg-kb-blue/15 text-kb-blue-dark" : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              {c.label} ({anzahl(c.key)})
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-10 text-center text-muted-foreground">Lädt …</p>
        ) : gefiltert.length === 0 ? (
          <div className="kb-panel space-y-3 p-8 text-center text-muted-foreground">
            <ListTodo className="mx-auto h-10 w-10 opacity-40" />
            <p>{aufgaben.length === 0 ? "Noch keine Aufgaben." : "Keine Aufgaben in diesem Filter."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {gefiltert.map((a) => {
              const meta = STATUS_META[a.status];
              const frist = fristInfo(a.faellig_am);
              const fotos = fotosJeAufgabe[a.id] || [];
              const mir = !!userId && istMirZugewiesen(a, userId, meineTeamIds);
              const darfStatus = isAdmin || mir;
              const darfBearbeiten = isAdmin || (a.erstellt_von === userId && a.status === "wartet_freigabe");
              const darfLoeschen = darfBearbeiten;
              return (
                <div key={a.id} className={`kb-panel border-l-4 p-3 ${meta.rand}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{a.titel}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>{meta.label}</span>
                        {prioVon(a) !== "normal" && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIO_META[prioVon(a)].chip}`}>
                            {PRIO_META[prioVon(a)].label}
                          </span>
                        )}
                        {mir && a.status !== "erledigt" && (
                          <span className="rounded-full border border-kb-blue/40 bg-kb-blue/10 px-2 py-0.5 text-[11px] font-semibold text-kb-blue-dark">für mich</span>
                        )}
                      </div>
                      {a.beschreibung && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{a.beschreibung}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Zugewiesen: <b>{zuweisungsText(a)}</b>
                        {frist && (
                          <> · Frist: <b className={frist.ueberfaellig && a.status !== "erledigt" ? "text-red-600" : ""}>{frist.text}</b></>
                        )}
                        {" · "}erstellt von {namen[a.erstellt_von] || "Mitarbeiter"} am {new Date(a.created_at).toLocaleDateString("de-AT")}
                        {a.status === "erledigt" && a.erledigt_am && (
                          <> · erledigt am {new Date(a.erledigt_am).toLocaleDateString("de-AT")}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {fotos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {fotos.map((f, i) => (
                        <button key={f.id} type="button" onClick={() => setLightbox({ fotos, index: i })}
                          className="h-16 w-16 overflow-hidden rounded border" title={f.file_name}>
                          <img src={fotoUrl(f.file_path)} alt={f.file_name} className="h-full w-full object-cover" />
                        </button>
                      ))}
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Camera className="h-3.5 w-3.5" /> {fotos.length}
                      </span>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {isAdmin && a.status === "wartet_freigabe" && (
                      <Button size="sm" className="h-9 bg-kb-green text-white hover:bg-kb-green/90"
                        onClick={() => statusSetzen(a, "offen")}>
                        Freigeben
                      </Button>
                    )}
                    {darfStatus && a.status === "offen" && (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => statusSetzen(a, "in_arbeit")}>
                        In Arbeit nehmen
                      </Button>
                    )}
                    {darfStatus && a.status === "in_arbeit" && (
                      <Button size="sm" className="h-9 bg-kb-green text-white hover:bg-kb-green/90"
                        onClick={() => statusSetzen(a, "erledigt")}>
                        Erledigt
                      </Button>
                    )}
                    {isAdmin && a.status === "erledigt" && (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => statusSetzen(a, "offen")}>
                        Wieder öffnen
                      </Button>
                    )}
                    <span className="flex-1" />
                    {darfBearbeiten && (
                      <Button size="sm" variant="ghost" className="h-9"
                        onClick={() => { setBearbeite(a); setDialogOffen(true); }}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Bearbeiten
                      </Button>
                    )}
                    {darfLoeschen && (
                      <Button size="sm" variant="ghost" className="h-9 text-destructive hover:text-destructive"
                        onClick={() => loeschen(a)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Löschen
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <AufgabeDialog
        open={dialogOffen}
        aufgabe={bearbeite}
        isAdmin={isAdmin}
        onClose={(gespeichert) => {
          setDialogOffen(false);
          setBearbeite(null);
          if (gespeichert) laden();
        }}
      />

      <PhotoLightbox
        photos={(lightbox?.fotos || []).map((f) => ({ url: fotoUrl(f.file_path), alt: f.file_name }))}
        initialIndex={lightbox?.index ?? 0}
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
