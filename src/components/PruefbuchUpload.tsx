/**
 * Maschinen-Prüfbuch hochladen + KI-Auslese (Kundenwunsch KFZ-Manager):
 * „bei den Maschinen dieselbe Möglichkeit — Prüfbuch als Foto oder PDF
 * hochladen, und die KI zieht Maschinendaten wie die Bezeichnung heraus."
 *
 * Gleicher Ablauf wie beim Zulassungsschein: Original in den Storage
 * (vehicle-documents) → Bilder an parse-pruefbuch → KI liest Bezeichnung,
 * Hersteller, Type, Seriennummer, Baujahr und Prüfdaten → Treffer über die
 * Serien-/Inventarnummer wird sofort übernommen, sonst manuell zuordnen
 * oder mit einem Klick eine neue Maschine anlegen.
 */
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { pdfAllPagesToJpegDataUrls } from "@/lib/pdfToImage";
import { BookOpenCheck, CheckCircle2, CircleAlert, Loader2, Plus } from "lucide-react";

interface MaschineKurz {
  id: string;
  bezeichnung: string;
  kennzeichen: string | null;
  marke_modell?: string | null;
}

interface Ergebnis {
  datei: string;
  path: string;
  erkannt: {
    bezeichnung: string | null;
    hersteller: string | null;
    type: string | null;
    seriennummer: string | null;
    baujahr: string | null;
    letzte_pruefung: string | null;
    naechste_pruefung: string | null;
  } | null;
  status: "laeuft" | "zugeordnet" | "offen" | "fehler";
  meldung?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maschinen: MaschineKurz[];
  onChanged: () => void;
}

async function bildZuJpegDataUrl(file: File, maxBreite = 1600, qualitaet = 0.85): Promise<string> {
  const bmp = await createImageBitmap(file);
  const faktor = Math.min(1, maxBreite / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * faktor);
  canvas.height = Math.round(bmp.height * faktor);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", qualitaet);
}

export function PruefbuchUpload({ open, onOpenChange, maschinen, onChanged }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [laeuft, setLaeuft] = useState(false);

  const herstellerType = (e: Ergebnis) =>
    [e.erkannt?.hersteller, e.erkannt?.type].filter(Boolean).join(" ");

  /** Prüfbuch-Pfad setzen und nur LEERE Felder aus der Erkennung füllen. */
  const uebernehmen = async (maschineId: string, e: Ergebnis): Promise<boolean> => {
    const m = maschinen.find((x) => x.id === maschineId);
    const patch: Record<string, unknown> = { pruefbuch_path: e.path };
    if (!m?.kennzeichen && e.erkannt?.seriennummer) patch.kennzeichen = e.erkannt.seriennummer;
    if (!m?.marke_modell && herstellerType(e)) patch.marke_modell = herstellerType(e);
    const { error } = await (supabase.from("vehicles" as never) as any).update(patch).eq("id", maschineId);
    if (error) {
      toast({ title: "Übernehmen fehlgeschlagen", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const verarbeite = async (files: FileList) => {
    setLaeuft(true);
    const neu: Ergebnis[] = Array.from(files).map((f) => ({
      datei: f.name, path: "", erkannt: null, status: "laeuft",
    }));
    setErgebnisse((alt) => [...alt, ...neu]);
    const basisIndex = ergebnisse.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const setzte = (patch: Partial<Ergebnis>) =>
        setErgebnisse((alt) => alt.map((r, j) => (j === basisIndex + i ? { ...r, ...patch } : r)));
      try {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `pruefbuecher/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("vehicle-documents").upload(path, file);
        if (upErr) throw new Error(`Upload: ${upErr.message}`);

        const imagesBase64 = file.type === "application/pdf" || ext === "pdf"
          ? await pdfAllPagesToJpegDataUrls(file, 1440, 0.85, 3)
          : [await bildZuJpegDataUrl(file)];

        const { data, error } = await supabase.functions.invoke("parse-pruefbuch", {
          body: { imagesBase64 },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        const erkannt = data?.erkannt || null;
        const treffer = data?.maschine || null;
        if (treffer) {
          const ok = await uebernehmen(treffer.id, { ...neu[i], path, erkannt } as Ergebnis);
          setzte({ path, erkannt, status: ok ? "zugeordnet" : "offen", meldung: treffer.bezeichnung });
        } else {
          setzte({
            path, erkannt, status: "offen",
            meldung: erkannt?.seriennummer
              ? `Keine Maschine mit Seriennummer ${erkannt.seriennummer} angelegt`
              : "Seriennummer nicht lesbar — bitte zuordnen oder neu anlegen",
          });
        }
      } catch (err) {
        setzte({ status: "fehler", meldung: (err as Error).message });
      }
    }
    setLaeuft(false);
    onChanged();
  };

  const manuellZuordnen = async (index: number, maschineId: string) => {
    const e = ergebnisse[index];
    if (!e || !e.path) return;
    const ok = await uebernehmen(maschineId, e);
    if (ok) {
      const m = maschinen.find((x) => x.id === maschineId);
      setErgebnisse((alt) => alt.map((r, j) => (j === index ? { ...r, status: "zugeordnet", meldung: m?.bezeichnung } : r)));
      onChanged();
    }
  };

  /** Aus dem Prüfbuch direkt eine neue Maschine anlegen. */
  const alsNeueMaschine = async (index: number) => {
    const e = ergebnisse[index];
    if (!e || !e.path) return;
    const bezeichnung = e.erkannt?.bezeichnung
      || herstellerType(e)
      || (e.erkannt?.seriennummer ? `Maschine ${e.erkannt.seriennummer}` : "Neue Maschine");
    const { data, error } = await (supabase.from("vehicles" as never) as any)
      .insert({
        art: "maschine",
        bezeichnung,
        kennzeichen: e.erkannt?.seriennummer || null,
        typ: "maschine",
        aktiv: true,
        marke_modell: herstellerType(e) || null,
        pruefbuch_path: e.path,
        notizen: [
          e.erkannt?.baujahr ? `Baujahr: ${e.erkannt.baujahr}` : "",
          e.erkannt?.letzte_pruefung ? `Letzte Überprüfung: ${e.erkannt.letzte_pruefung.split("-").reverse().join(".")}` : "",
          e.erkannt?.naechste_pruefung ? `Nächste Überprüfung: ${e.erkannt.naechste_pruefung.split("-").reverse().join(".")}` : "",
        ].filter(Boolean).join("\n") || null,
      })
      .select("id, bezeichnung")
      .single();
    if (error) {
      toast({ title: "Anlegen fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    setErgebnisse((alt) => alt.map((r, j) => (j === index
      ? { ...r, status: "zugeordnet", meldung: `${data.bezeichnung} (neu angelegt)` }
      : r)));
    toast({ title: "Maschine angelegt", description: `${bezeichnung} — Prüfbuch ist hinterlegt.` });
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setErgebnisse([]); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-kb-blue" /> Maschinen-Prüfbuch hochladen
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Prüfbuch oder Typenschild fotografieren (auch PDF möglich) und hochladen — die KI
          liest Bezeichnung, Hersteller, Type, Seriennummer, Baujahr und die eingetragenen
          Überprüfungen und hängt das Prüfbuch an die richtige Maschine (Abgleich über die
          Serien-/Inventarnummer).
        </p>

        <input
          ref={inputRef} type="file" multiple accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) verarbeite(e.target.files); e.target.value = ""; }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={laeuft}>
          {laeuft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpenCheck className="mr-2 h-4 w-4" />}
          {laeuft ? "KI liest…" : "Dateien auswählen"}
        </Button>

        {ergebnisse.length > 0 && (
          <div className="mt-2 max-h-[50vh] space-y-2 overflow-y-auto">
            {ergebnisse.map((e, i) => (
              <div key={i} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {e.status === "laeuft" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                  {e.status === "zugeordnet" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                  {(e.status === "offen" || e.status === "fehler") && <CircleAlert className="h-4 w-4 shrink-0 text-amber-500" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{e.datei}</span>
                  {e.erkannt?.seriennummer && <span className="shrink-0 font-mono text-xs">{e.erkannt.seriennummer}</span>}
                </div>
                {e.erkannt && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[e.erkannt.bezeichnung, herstellerType(e)].filter(Boolean).join(" · ")}
                    {e.erkannt.baujahr ? ` · Bj. ${e.erkannt.baujahr}` : ""}
                    {e.erkannt.letzte_pruefung ? ` · geprüft ${e.erkannt.letzte_pruefung.split("-").reverse().join(".")}` : ""}
                  </div>
                )}
                {e.status === "zugeordnet" && (
                  <div className="mt-0.5 text-xs font-medium text-green-700">✓ Zugeordnet: {e.meldung}</div>
                )}
                {e.status === "fehler" && <div className="mt-0.5 text-xs text-destructive">{e.meldung}</div>}
                {e.status === "offen" && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-700">{e.meldung}</span>
                    <Button size="sm" className="h-8" onClick={() => alsNeueMaschine(i)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Als neue Maschine anlegen
                    </Button>
                    <span className="text-xs text-muted-foreground">oder</span>
                    <Select onValueChange={(v) => manuellZuordnen(i, v)}>
                      <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Maschine wählen…" /></SelectTrigger>
                      <SelectContent>
                        {maschinen.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.bezeichnung}{m.kennzeichen ? ` (${m.kennzeichen})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
