/**
 * Zulassungsscheine hochladen + KI-Zuordnung (Kundenwunsch KFZ-Manager):
 * „alle Zulassungsscheine oder nur einen hochladen — dann erkennt er
 * automatisch das Auto mit der KI, und der Schein ist hinterlegt."
 *
 * Ablauf je Datei: Original in den Storage (vehicle-documents) → Bild/PDF-Seiten
 * an die Edge Function parse-zulassungsschein → die KI liest Kennzeichen, Marke,
 * FIN, Erstzulassung → Treffer übers Kennzeichen wird SOFORT übernommen
 * (Schein-Pfad + Leerfelder füllen), ohne Treffer ordnet man per Auswahl zu.
 */
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { pdfAllPagesToJpegDataUrls } from "@/lib/pdfToImage";
import { CheckCircle2, CircleAlert, FileScan, Loader2, Plus } from "lucide-react";

interface FahrzeugKurz {
  id: string;
  bezeichnung: string;
  kennzeichen: string | null;
  marke_modell?: string | null;
  fahrgestellnummer?: string | null;
  erstzulassung?: string | null;
}

interface Ergebnis {
  datei: string;
  path: string;
  erkannt: {
    kennzeichen: string | null;
    marke: string | null;
    handelsbezeichnung: string | null;
    fahrgestellnummer: string | null;
    erstzulassung: string | null;
  } | null;
  fahrzeugId: string | null;
  status: "laeuft" | "zugeordnet" | "offen" | "fehler";
  meldung?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fahrzeuge: FahrzeugKurz[];
  /** Nach Zuordnungen aufrufen, damit die Liste neu lädt. */
  onChanged: () => void;
}

/** Foto verkleinern (max. 1600 px), damit der KI-Scan schnell und klein bleibt. */
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

export function ZulassungsscheinUpload({ open, onOpenChange, fahrzeuge, onChanged }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [laeuft, setLaeuft] = useState(false);

  const nurFahrzeuge = fahrzeuge.filter((f) => f.kennzeichen !== undefined);

  /** Schein-Pfad setzen und nur LEERE Felder aus der KI-Erkennung füllen. */
  const uebernehmen = async (fahrzeugId: string, e: Ergebnis): Promise<boolean> => {
    const fz = fahrzeuge.find((f) => f.id === fahrzeugId);
    const marke = [e.erkannt?.marke, e.erkannt?.handelsbezeichnung].filter(Boolean).join(" ");
    const patch: Record<string, unknown> = { zulassungsschein_path: e.path };
    // Fehlt dem Fahrzeug das Kennzeichen (häufig bei manueller Zuordnung),
    // wird es vom Schein übernommen — ab dann greift die Automatik von selbst.
    if (!fz?.kennzeichen && e.erkannt?.kennzeichen) patch.kennzeichen = e.erkannt.kennzeichen;
    if (!fz?.marke_modell && marke) patch.marke_modell = marke;
    if (!fz?.fahrgestellnummer && e.erkannt?.fahrgestellnummer) patch.fahrgestellnummer = e.erkannt.fahrgestellnummer;
    if (!fz?.erstzulassung && e.erkannt?.erstzulassung) patch.erstzulassung = e.erkannt.erstzulassung;
    const { error } = await (supabase.from("vehicles" as never) as any).update(patch).eq("id", fahrzeugId);
    if (error) {
      toast({ title: "Übernehmen fehlgeschlagen", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const verarbeite = async (files: FileList) => {
    setLaeuft(true);
    const neu: Ergebnis[] = Array.from(files).map((f) => ({
      datei: f.name, path: "", erkannt: null, fahrzeugId: null, status: "laeuft",
    }));
    setErgebnisse((alt) => [...alt, ...neu]);
    const basisIndex = ergebnisse.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const setzte = (patch: Partial<Ergebnis>) =>
        setErgebnisse((alt) => alt.map((r, j) => (j === basisIndex + i ? { ...r, ...patch } : r)));
      try {
        // 1. Original ablegen — der Schein soll unabhängig vom Scan hinterlegt sein.
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `zulassungsscheine/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("vehicle-documents").upload(path, file);
        if (upErr) throw new Error(`Upload: ${upErr.message}`);

        // 2. Für die KI in Bilder wandeln (PDF: erste 2 Seiten reichen beim Schein).
        const imagesBase64 = file.type === "application/pdf" || ext === "pdf"
          ? await pdfAllPagesToJpegDataUrls(file, 1440, 0.85, 2)
          : [await bildZuJpegDataUrl(file)];

        // 3. KI liest den Schein und sucht das Fahrzeug übers Kennzeichen.
        const { data, error } = await supabase.functions.invoke("parse-zulassungsschein", {
          body: { imagesBase64 },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        const erkannt = data?.erkannt || null;
        const treffer = data?.fahrzeug || null;
        if (treffer) {
          const ok = await uebernehmen(treffer.id, { ...neu[i], path, erkannt } as Ergebnis);
          setzte({ path, erkannt, fahrzeugId: treffer.id, status: ok ? "zugeordnet" : "offen", meldung: treffer.bezeichnung });
        } else {
          setzte({
            path, erkannt, status: "offen",
            meldung: erkannt?.kennzeichen
              ? `Kein Fahrzeug mit Kennzeichen ${erkannt.kennzeichen} angelegt`
              : "Kennzeichen nicht lesbar — bitte manuell zuordnen",
          });
        }
      } catch (err) {
        setzte({ status: "fehler", meldung: (err as Error).message });
      }
    }
    setLaeuft(false);
    onChanged();
  };

  /** Kundenwunsch: aus dem Schein direkt ein neues Fahrzeug machen —
   *  alle erkannten Daten + der Schein selbst sind sofort gespeichert. */
  const alsNeuesFahrzeug = async (index: number) => {
    const e = ergebnisse[index];
    if (!e || !e.path) return;
    const marke = [e.erkannt?.marke, e.erkannt?.handelsbezeichnung].filter(Boolean).join(" ");
    const bezeichnung = marke || (e.erkannt?.kennzeichen ? `Fahrzeug ${e.erkannt.kennzeichen}` : "Neues Fahrzeug");
    const { data, error } = await (supabase.from("vehicles" as never) as any)
      .insert({
        art: "fahrzeug",
        bezeichnung,
        kennzeichen: e.erkannt?.kennzeichen || null,
        typ: "pkw",
        aktiv: true,
        marke_modell: marke || null,
        fahrgestellnummer: e.erkannt?.fahrgestellnummer || null,
        erstzulassung: e.erkannt?.erstzulassung || null,
        zulassungsschein_path: e.path,
      })
      .select("id, bezeichnung")
      .single();
    if (error) {
      toast({ title: "Anlegen fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    setErgebnisse((alt2) => alt2.map((r, j) => (j === index
      ? { ...r, fahrzeugId: data.id, status: "zugeordnet", meldung: `${data.bezeichnung} (neu angelegt)` }
      : r)));
    toast({ title: "Fahrzeug angelegt", description: `${bezeichnung} — Kennzeichen, FIN und Erstzulassung sind übernommen, der Schein ist hinterlegt.` });
    onChanged();
  };

  const manuellZuordnen = async (index: number, fahrzeugId: string) => {
    const e = ergebnisse[index];
    if (!e || !e.path) return;
    const ok = await uebernehmen(fahrzeugId, e);
    if (ok) {
      const fz = fahrzeuge.find((f) => f.id === fahrzeugId);
      setErgebnisse((alt) => alt.map((r, j) => (j === index ? { ...r, fahrzeugId, status: "zugeordnet", meldung: fz?.bezeichnung } : r)));
      onChanged();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setErgebnisse([]); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileScan className="h-5 w-5 text-kb-blue" /> Zulassungsscheine hochladen
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Einen oder mehrere Scheine fotografieren/scannen und hochladen — die KI liest
          Kennzeichen, Marke, Fahrgestellnummer und Erstzulassung und hängt den Schein
          automatisch ans richtige Fahrzeug (Abgleich übers Kennzeichen).
        </p>

        <input
          ref={inputRef} type="file" multiple accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) verarbeite(e.target.files); e.target.value = ""; }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={laeuft}>
          {laeuft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileScan className="mr-2 h-4 w-4" />}
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
                  {e.erkannt?.kennzeichen && <span className="shrink-0 font-mono text-xs">{e.erkannt.kennzeichen}</span>}
                </div>
                {e.erkannt && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[e.erkannt.marke, e.erkannt.handelsbezeichnung].filter(Boolean).join(" ")}
                    {e.erkannt.erstzulassung ? ` · EZ ${e.erkannt.erstzulassung.split("-").reverse().join(".")}` : ""}
                    {e.erkannt.fahrgestellnummer ? ` · FIN ${e.erkannt.fahrgestellnummer}` : ""}
                  </div>
                )}
                {e.status === "zugeordnet" && (
                  <div className="mt-0.5 text-xs font-medium text-green-700">✓ Zugeordnet: {e.meldung}</div>
                )}
                {e.status === "fehler" && (
                  <div className="mt-0.5 text-xs text-destructive">{e.meldung}</div>
                )}
                {e.status === "offen" && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-700">{e.meldung}</span>
                    <Button size="sm" className="h-8" onClick={() => alsNeuesFahrzeug(i)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Als neues Fahrzeug anlegen
                    </Button>
                    <span className="text-xs text-muted-foreground">oder</span>
                    <Select onValueChange={(v) => manuellZuordnen(i, v)}>
                      <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Fahrzeug wählen…" /></SelectTrigger>
                      <SelectContent>
                        {nurFahrzeuge.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.bezeichnung}{f.kennzeichen ? ` (${f.kennzeichen})` : ""}
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
