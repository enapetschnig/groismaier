// ============================================================================
// Fotos zu einem Beleg (Kundenwunsch 11.09.2026)
//
// „Fotos aufnehmen kann von zB verladenen Holzpaketen ect."
//
// Nach dem Muster der Regiebericht-Fotos (DisturbancePhotos), mit zwei
// Unterschieden: Die Ablage „beleg-fotos" ist NICHT öffentlich — Ware,
// Kennzeichen, Personen — also laufen Vorschau und Anzeige über signierte
// URLs. Und die Fotos werden vor dem Hochladen verkleinert (bildFuerUpload):
// Am Hof hängt das Handy am Mobilfunk, 4 MB je Bild sind dort Minuten.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ImagePlus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { bildFuerUpload } from "@/lib/lieferscheinUebergabe";

export const BELEG_FOTOS_ABLAGE = "beleg-fotos";

export interface BelegFoto {
  id: string;
  file_path: string;
  file_name: string;
  beschreibung: string | null;
  created_at: string;
}

const tabelle = () => (supabase.from("beleg_fotos" as never) as any);

interface Props {
  invoiceId: string;
  canEdit: boolean;
  /** Wird nach jeder Änderung mit der neuen Anzahl aufgerufen. */
  onAnzahl?: (n: number) => void;
}

export function BelegFotos({ invoiceId, canEdit, onAnzahl }: Props) {
  const { toast } = useToast();
  const [fotos, setFotos] = useState<BelegFoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [laedt, setLaedt] = useState(true);
  const [laeuftHoch, setLaeuftHoch] = useState(0);
  const kameraRef = useRef<HTMLInputElement>(null);
  const galerieRef = useRef<HTMLInputElement>(null);

  const laden = async () => {
    const { data } = await tabelle()
      .select("id, file_path, file_name, beschreibung, created_at")
      .eq("invoice_id", invoiceId)
      .order("created_at");
    const liste = (data || []) as BelegFoto[];
    setFotos(liste);
    onAnzahl?.(liste.length);
    if (liste.length > 0) {
      // Eine Signierung für alle statt eine je Bild — eine Anfrage, eine Stunde gültig.
      const { data: sig } = await supabase.storage
        .from(BELEG_FOTOS_ABLAGE)
        .createSignedUrls(liste.map((f) => f.file_path), 3600);
      const map: Record<string, string> = {};
      (sig || []).forEach((s) => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
      setUrls(map);
    }
    setLaedt(false);
  };

  useEffect(() => { void laden(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [invoiceId]);

  const hochladen = async (dateien: FileList | null) => {
    if (!dateien || dateien.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLaeuftHoch(dateien.length);
    let ok = 0;
    for (const datei of Array.from(dateien)) {
      if (!datei.type.startsWith("image/")) continue;
      const blob = await bildFuerUpload(datei);
      const name = datei.name.replace(/\.[^.]+$/, "") + ".jpg";
      const pfad = `${invoiceId}/${Date.now()}_${name}`;
      const { error: upErr } = await supabase.storage
        .from(BELEG_FOTOS_ABLAGE)
        .upload(pfad, blob, { contentType: "image/jpeg" });
      if (upErr) { console.error(upErr); continue; }
      const { error: dbErr } = await tabelle().insert({
        invoice_id: invoiceId, user_id: user.id, file_path: pfad, file_name: name,
      });
      if (dbErr) {
        await supabase.storage.from(BELEG_FOTOS_ABLAGE).remove([pfad]);
        continue;
      }
      ok++;
      setLaeuftHoch((n) => Math.max(0, n - 1));
    }
    setLaeuftHoch(0);
    if (ok < dateien.length) {
      toast({ variant: "destructive", title: "Nicht alle Fotos gespeichert", description: `${ok} von ${dateien.length} Fotos hochgeladen.` });
    }
    await laden();
  };

  const loeschen = async (f: BelegFoto) => {
    if (!window.confirm("Foto wirklich löschen?")) return;
    await supabase.storage.from(BELEG_FOTOS_ABLAGE).remove([f.file_path]);
    const { error } = await tabelle().delete().eq("id", f.id);
    if (error) { toast({ variant: "destructive", title: "Nicht gelöscht", description: error.message }); return; }
    await laden();
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {/* Kamera direkt — am Hof will man nicht erst die Galerie sehen. */}
          <input ref={kameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { void hochladen(e.target.files); e.target.value = ""; }} />
          <input ref={galerieRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { void hochladen(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="outline" className="h-12 flex-1 gap-2" onClick={() => kameraRef.current?.click()} disabled={laeuftHoch > 0}>
            {laeuftHoch > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {laeuftHoch > 0 ? `Lädt hoch (${laeuftHoch}) …` : "Foto aufnehmen"}
          </Button>
          <Button type="button" variant="outline" className="h-12 gap-2" onClick={() => galerieRef.current?.click()} disabled={laeuftHoch > 0}>
            <ImagePlus className="h-5 w-5" /> Aus Galerie
          </Button>
        </div>
      )}

      {laedt ? (
        <p className="text-sm text-muted-foreground">Fotos werden geladen …</p>
      ) : fotos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Fotos.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
              {urls[f.file_path] ? (
                <a href={urls[f.file_path]} target="_blank" rel="noreferrer" title={f.file_name}>
                  <img src={urls[f.file_path]} alt={f.file_name} className="h-full w-full object-cover" loading="lazy" />
                </a>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">…</div>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-90 hover:bg-red-600"
                  title="Foto löschen"
                  onClick={() => void loeschen(f)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
