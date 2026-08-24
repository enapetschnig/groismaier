// ============================================================================
// AufgabeDialog — Aufgabe anlegen/bearbeiten (Kundenwunsch 19.08.2026):
// Titel + Beschreibung wie beim Regiebericht, optional Fotos, Zuweisung an
// EINE Person ODER ein Team, Frist (bis wann zu erledigen).
//
// Freigabe-Regel: Legt ein Mitarbeiter (Nicht-Admin) eine Aufgabe an, startet
// sie als "wartet_freigabe" — der Admin gibt sie frei, erst dann sieht sie
// die zugewiesene Person (RLS erzwingt das auch serverseitig).
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AUFGABEN_FOTO_BUCKET, Aufgabe, AufgabeFoto, AufgabePrio, PRIO_META, PRIO_REIHENFOLGE,
  aufgabenFotosTable, aufgabenTable, fotoUrl, prioVon,
} from "./aufgabenShared";

interface Props {
  open: boolean;
  /** null = neue Aufgabe anlegen. */
  aufgabe: Aufgabe | null;
  isAdmin: boolean;
  onClose: (gespeichert: boolean) => void;
}

interface PersonOption { id: string; name: string }
interface TeamOption { id: string; name: string }

export function AufgabeDialog({ open, aufgabe, isAdmin, onClose }: Props) {
  const { toast } = useToast();
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  /** "" = niemand, "u:<id>" = Person, "t:<id>" = Team. */
  const [zuweisung, setZuweisung] = useState("");
  const [faelligAm, setFaelligAm] = useState("");
  const [prio, setPrio] = useState<AufgabePrio>("normal");
  const [personen, setPersonen] = useState<PersonOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [fotos, setFotos] = useState<AufgabeFoto[]>([]);
  // Vorschau-URL wird EINMAL beim Auswaehlen erzeugt (nicht je Render) und
  // beim Entfernen/Schliessen wieder freigegeben — sonst leckt jeder Render
  // ein neues Objekt-URL.
  const [neueFotos, setNeueFotos] = useState<{ file: File; url: string }[]>([]);
  const [speichern, setSpeichern] = useState(false);
  const kameraRef = useRef<HTMLInputElement>(null);
  const dateiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitel(aufgabe?.titel || "");
    setBeschreibung(aufgabe?.beschreibung || "");
    setZuweisung(aufgabe?.zugewiesen_an ? `u:${aufgabe.zugewiesen_an}` : aufgabe?.team_id ? `t:${aufgabe.team_id}` : "");
    setFaelligAm(aufgabe?.faellig_am || "");
    setPrio(aufgabe ? prioVon(aufgabe) : "normal");
    setNeueFotos((alt) => { alt.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
    setFotos([]);
    (async () => {
      const [profRes, teamRes] = await Promise.all([
        supabase.from("profiles").select("id, vorname, nachname").eq("is_active", true).order("vorname"),
        supabase.from("teams").select("id, name").order("name"),
      ]);
      setPersonen((profRes.data || []).map((p) => ({
        id: p.id,
        name: `${p.vorname || ""} ${p.nachname || ""}`.trim() || "Unbenannt",
      })));
      setTeams((teamRes.data || []).map((t) => ({ id: t.id, name: t.name })));
      if (aufgabe) {
        const { data } = await aufgabenFotosTable()
          .select("id, aufgabe_id, file_path, file_name")
          .eq("aufgabe_id", aufgabe.id)
          .order("created_at");
        setFotos((data as AufgabeFoto[]) || []);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aufgabe?.id]);

  const fotoDateienWaehlen = (files: FileList | null) => {
    if (!files) return;
    const neu: File[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        toast({ variant: "destructive", title: "Ungültiger Dateityp", description: `${f.name} ist kein Bild.` });
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Datei zu groß", description: `${f.name} ist größer als 10 MB.` });
        continue;
      }
      neu.push(f);
    }
    if (neu.length) setNeueFotos((p) => [...p, ...neu.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const fotoLoeschen = async (foto: AufgabeFoto) => {
    await supabase.storage.from(AUFGABEN_FOTO_BUCKET).remove([foto.file_path]);
    const { error } = await aufgabenFotosTable().delete().eq("id", foto.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Foto konnte nicht gelöscht werden." });
      return;
    }
    setFotos((p) => p.filter((f) => f.id !== foto.id));
  };

  const speichere = async () => {
    const t = titel.trim();
    if (!t) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte einen Titel eingeben." });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSpeichern(true);
    const zugewiesenAn = zuweisung.startsWith("u:") ? zuweisung.slice(2) : null;
    const teamId = zuweisung.startsWith("t:") ? zuweisung.slice(2) : null;
    const felder = {
      titel: t,
      beschreibung: beschreibung.trim() || null,
      zugewiesen_an: zugewiesenAn,
      team_id: teamId,
      faellig_am: faelligAm || null,
      prioritaet: prio,
    };

    let aufgabeId = aufgabe?.id || null;
    if (aufgabeId) {
      const { error } = await aufgabenTable().update(felder).eq("id", aufgabeId);
      if (error) {
        setSpeichern(false);
        toast({ variant: "destructive", title: "Fehler", description: error.message });
        return;
      }
    } else {
      // Mitarbeiter-Aufgaben starten als "wartet_freigabe" (Admin gibt frei).
      const { data, error } = await aufgabenTable()
        .insert({ ...felder, erstellt_von: user.id, status: isAdmin ? "offen" : "wartet_freigabe" })
        .select("id")
        .single();
      if (error) {
        setSpeichern(false);
        toast({ variant: "destructive", title: "Fehler", description: error.message });
        return;
      }
      aufgabeId = (data as { id: string } | null)?.id || null;
    }

    // Neue Fotos hochladen (nachdem die Aufgabe existiert)
    let fotoFehler = 0;
    for (const { file } of neueFotos) {
      const pfad = `${aufgabeId}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from(AUFGABEN_FOTO_BUCKET).upload(pfad, file);
      if (upErr) { fotoFehler++; continue; }
      const { error: dbErr } = await aufgabenFotosTable().insert({
        aufgabe_id: aufgabeId, user_id: user.id, file_path: pfad, file_name: file.name,
      });
      if (dbErr) {
        await supabase.storage.from(AUFGABEN_FOTO_BUCKET).remove([pfad]);
        fotoFehler++;
      }
    }
    setSpeichern(false);
    if (fotoFehler > 0) {
      toast({ variant: "destructive", title: "Foto-Upload", description: `${fotoFehler} Foto(s) konnten nicht hochgeladen werden.` });
    }
    toast({
      title: aufgabe ? "Aufgabe gespeichert" : isAdmin ? "Aufgabe angelegt" : "Aufgabe eingereicht",
      description: aufgabe
        ? undefined
        : isAdmin
          ? zugewiesenAn || teamId
            ? "Die zugewiesene Person bzw. das Team sieht die Aufgabe ab jetzt am Startbildschirm."
            : undefined
          : "Die Aufgabe wird dem Administrator zur Freigabe vorgelegt — erst danach sieht sie die zugewiesene Person.",
    });
    onClose(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(false); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{aufgabe ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Titel *</Label>
            <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Was ist zu tun?" />
          </div>
          <div className="space-y-1">
            <Label>Beschreibung</Label>
            <Textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Details zur Aufgabe …"
              rows={4}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Zuweisen an</Label>
              {/* Natives Select mit Gruppen: EINE Person ODER ein Team. */}
              <select
                className="kb-input h-11 min-h-0 w-full px-2 py-1 text-sm sm:h-10"
                value={zuweisung}
                onChange={(e) => setZuweisung(e.target.value)}
              >
                <option value="">— niemand —</option>
                {personen.length > 0 && (
                  <optgroup label="Mitarbeiter">
                    {personen.map((p) => <option key={p.id} value={`u:${p.id}`}>{p.name}</option>)}
                  </optgroup>
                )}
                {teams.length > 0 && (
                  <optgroup label="Teams">
                    {teams.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Zu erledigen bis</Label>
              <Input type="date" value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
            </div>
            {/* Priorität (Kundenwunsch 24.08.2026) — farbige Auswahl-Knöpfe */}
            <div className="space-y-1 sm:col-span-2">
              <Label>Priorität</Label>
              <div className="flex gap-1.5">
                {PRIO_REIHENFOLGE.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrio(p)}
                    className={`min-h-[40px] flex-1 rounded-md px-2 text-sm font-semibold ${PRIO_META[p].chip} ${
                      prio === p ? "ring-2 ring-kb-blue-dark ring-offset-1" : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    {PRIO_META[p].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fotos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fotos</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => kameraRef.current?.click()}>
                  <Camera className="mr-1 h-4 w-4" /> Foto
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0" aria-label="Fotos hochladen"
                  onClick={() => dateiRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <input ref={kameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { fotoDateienWaehlen(e.target.files); e.target.value = ""; }} />
            <input ref={dateiRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { fotoDateienWaehlen(e.target.files); e.target.value = ""; }} />
            {(fotos.length > 0 || neueFotos.length > 0) && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {fotos.map((f) => (
                  <div key={f.id} className="relative aspect-square">
                    <img src={fotoUrl(f.file_path)} alt={f.file_name} className="h-full w-full rounded object-cover" />
                    <Button type="button" variant="destructive" size="icon" aria-label="Foto löschen"
                      className="absolute bottom-1 right-1 h-8 w-8 opacity-90"
                      onClick={() => fotoLoeschen(f)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {neueFotos.map((f, i) => (
                  <div key={f.url} className="relative aspect-square">
                    <img src={f.url} alt={f.file.name} className="h-full w-full rounded object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-kb-blue px-1 text-[10px] font-bold text-white">neu</span>
                    <Button type="button" variant="destructive" size="icon" aria-label="Foto entfernen"
                      className="absolute bottom-1 right-1 h-8 w-8 opacity-90"
                      onClick={() => setNeueFotos((p) => {
                        URL.revokeObjectURL(f.url);
                        return p.filter((_, j) => j !== i);
                      })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!aufgabe && !isAdmin && (
            <p className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
              Deine Aufgabe wird zuerst dem Administrator zur Freigabe vorgelegt —
              erst danach sieht sie die zugewiesene Person bzw. das Team.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onClose(false)}>Abbrechen</Button>
          <Button type="button" disabled={speichern} onClick={speichere}>
            {speichern ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
