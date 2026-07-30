/**
 * Foto-Schnellzugriff von der Startmaske (Handy): Projekt wählen, Fotos
 * aufnehmen oder aus der Galerie hochladen — sie landen direkt im
 * Foto-Ordner des gewählten Projekts (Bucket project-photos + documents-
 * Index, derselbe Weg wie der Upload in ProjectDetail).
 *
 * Ersetzt den früheren „Beleg-Foto"-Knopf (Kundenwunsch: „Beleg-Foto kann
 * weg und nur Foto — und die werden dann direkt im Projekt gespeichert,
 * das ausgewählt wird").
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { buildProjectFilePath } from "@/lib/projectFiles";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickFotoDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const dateiInput = useRef<HTMLInputElement>(null);
  const [projekte, setProjekte] = useState<{ id: string; name: string }[]>([]);
  const [projektId, setProjektId] = useState<string>("");
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      // RLS begrenzt Mitarbeiter automatisch auf ihre zugewiesenen Projekte.
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .not("status", "eq", "Abgeschlossen")
        .order("name");
      const liste = ((data as { id: string; name: string }[]) || []);
      setProjekte(liste);
      // Genau ein Projekt → gleich vorwählen, ein Tipper weniger am Bau.
      if (liste.length === 1) setProjektId(liste[0].id);
    })();
  }, [open]);

  const fotosGewaehlt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateien = Array.from(e.target.files || []);
    e.target.value = "";
    if (dateien.length === 0 || !projektId) return;
    setLaedt(true);
    const { data: { user } } = await supabase.auth.getUser();
    let ok = 0;
    let letzterFehler = "";
    for (const datei of dateien) {
      const pfad = buildProjectFilePath(projektId, datei.name);
      const { error } = await supabase.storage.from("project-photos").upload(pfad, datei);
      if (error) { letzterFehler = error.message; continue; }
      ok++;
      if (user) {
        const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(pfad);
        await supabase.from("documents").insert({
          project_id: projektId,
          user_id: user.id,
          typ: "photos",
          name: datei.name,
          file_url: urlData.publicUrl,
        } as never);
      }
    }
    setLaedt(false);
    if (ok > 0) {
      toast({
        title: `${ok} Foto${ok === 1 ? "" : "s"} gespeichert`,
        description: `Abgelegt im Projekt „${projekte.find((p) => p.id === projektId)?.name || ""}“.`,
      });
      onOpenChange(false);
      navigate(`/projects/${projektId}/photos`);
    } else {
      toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: letzterFehler || "Bitte erneut versuchen." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Foto ins Projekt
          </DialogTitle>
          <DialogDescription>
            Projekt wählen, dann fotografieren oder aus der Galerie hochladen —
            die Fotos landen direkt im Foto-Ordner des Projekts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Projekt *</Label>
            <Select value={projektId} onValueChange={setProjektId}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Projekt wählen…" /></SelectTrigger>
              <SelectContent>
                {projekte.length === 0 && (
                  <SelectItem value="__keine__" disabled>Keine aktiven Projekte</SelectItem>
                )}
                {projekte.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* capture öffnet am Handy direkt die Kamera; ohne capture kommt am
              Desktop/aus der Galerie die Dateiauswahl. */}
          <input
            ref={dateiInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={fotosGewaehlt}
          />
          <Button
            className="h-14 w-full text-base"
            disabled={!projektId || laedt}
            onClick={() => dateiInput.current?.click()}
          >
            {laedt
              ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Lädt hoch…</>)
              : (<><Camera className="mr-2 h-5 w-5" /> Fotos aufnehmen / auswählen</>)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
