// ============================================================================
// Bildideen — KI-Bildgenerierung (Kundenwunsch 02.09.2026)
//
// „Ein Menüpunkt, wo ich ein oder mehrere Fotos hochlade und er mir
//  generiert, wie dort z. B. ein Carport aussehen würde."
//
// Ablauf: Fotos wählen (optional) → Wunsch tippen oder Vorlage anklicken →
// Bild erzeugen (Edge Function bild-generieren) → Ergebnis ansehen,
// herunterladen, ins Projekt ablegen oder als neues Ausgangsbild weiterdenken.
// Jede Erzeugung landet mit Fotos und Wunsch in der Ablage (Verlauf unten).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { KBToolbar } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import {
  Camera, Download, FolderPlus, ImagePlus, Loader2, RefreshCw, Sparkles, Trash2, Wand2, X,
} from "lucide-react";
import { BILD_GROESSEN, BILD_VORLAGEN, baueBildPrompt, bildDateiname, type BildFormat } from "@/lib/bildideen";
import { buildProjectFilePath } from "@/lib/projectFiles";

interface Bildidee {
  id: string;
  wunsch: string;
  groesse: string;
  quelle_pfade: string[];
  ergebnis_pfad: string;
  project_id: string | null;
  created_at: string;
}

const bildideenTable = () => (supabase.from("bildideen" as never) as any);
const BUCKET = "bildideen";

/** Datei → Base64 (ohne data:-Präfix). */
const alsBase64 = (f: File) =>
  new Promise<string>((auf, ab) => {
    const r = new FileReader();
    r.onload = () => auf(String(r.result).split(",")[1] || "");
    r.onerror = () => ab(new Error("Datei konnte nicht gelesen werden"));
    r.readAsDataURL(f);
  });

export default function Bildideen() {
  const zurueck = useZurueck("/");
  const { toast } = useToast();
  const dateiRef = useRef<HTMLInputElement>(null);
  const kameraRef = useRef<HTMLInputElement>(null);

  const [fotos, setFotos] = useState<{ file: File; url: string }[]>([]);
  const [wunsch, setWunsch] = useState("");
  const [format, setFormat] = useState<BildFormat>("quer");
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ url: string; blob: Blob; id: string | null } | null>(null);
  const [verlauf, setVerlauf] = useState<Bildidee[]>([]);
  const [verlaufUrls, setVerlaufUrls] = useState<Record<string, string>>({});
  const [projekte, setProjekte] = useState<{ id: string; name: string }[]>([]);
  const [projektDialog, setProjektDialog] = useState(false);
  const [projektSuche, setProjektSuche] = useState("");
  const [ablegen, setAblegen] = useState(false);

  // ── Verlauf laden (eigene Bildideen, neueste zuerst) ────────────────────
  const ladeVerlauf = useCallback(async () => {
    const { data } = await bildideenTable()
      .select("id, wunsch, groesse, quelle_pfade, ergebnis_pfad, project_id, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    const liste = (data as Bildidee[]) || [];
    setVerlauf(liste);
    // Signierte URLs für die Vorschau (privater Bucket).
    const urls: Record<string, string> = {};
    await Promise.all(liste.map(async (b) => {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(b.ergebnis_pfad, 3600);
      if (s?.signedUrl) urls[b.id] = s.signedUrl;
    }));
    setVerlaufUrls(urls);
  }, []);

  useEffect(() => { void ladeVerlauf(); }, [ladeVerlauf]);

  // ── Fotos wählen ────────────────────────────────────────────────────────
  const fotosWaehlen = (files: FileList | null) => {
    if (!files) return;
    const neu: { file: File; url: string }[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        toast({ variant: "destructive", title: "Kein Bild", description: `${f.name} ist keine Bilddatei.` });
        continue;
      }
      if (f.size > 20 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Zu groß", description: `${f.name} ist größer als 20 MB.` });
        continue;
      }
      neu.push({ file: f, url: URL.createObjectURL(f) });
    }
    setFotos((alt) => [...alt, ...neu].slice(0, 4));
  };
  const fotoEntfernen = (idx: number) =>
    setFotos((alt) => {
      URL.revokeObjectURL(alt[idx].url);
      return alt.filter((_, i) => i !== idx);
    });

  // ── Erzeugen ────────────────────────────────────────────────────────────
  const erzeugen = async () => {
    if (wunsch.trim().length < 3) {
      toast({ variant: "destructive", title: "Was soll ins Bild?", description: "Bitte kurz beschreiben oder eine Vorlage wählen." });
      return;
    }
    setLaeuft(true);
    setErgebnis(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet.");
      const prompt = baueBildPrompt(wunsch, fotos.length);
      const bilder = await Promise.all(fotos.map(async (f) => ({
        name: f.file.name, mime: f.file.type, base64: await alsBase64(f.file),
      })));
      const { data, error } = await supabase.functions.invoke("bild-generieren", {
        body: { prompt, groesse: BILD_GROESSEN[format], bilder },
      });
      if (error) throw new Error(error.message || "Bildmodell nicht erreichbar");
      if (data?.error) throw new Error(String(data.error));
      if (!data?.base64) throw new Error("Kein Bild erhalten.");

      // Ergebnis + Ausgangsfotos ablegen — jede Idee bleibt wiederfindbar.
      const bin = atob(data.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "image/png" });
      const ordner = `${user.id}/${Date.now()}`;
      const quellPfade: string[] = [];
      for (const [i, f] of fotos.entries()) {
        const ext = (f.file.name.split(".").pop() || "jpg").toLowerCase();
        const pfad = `${ordner}/quelle-${i + 1}.${ext}`;
        const { error: e } = await supabase.storage.from(BUCKET).upload(pfad, f.file, { contentType: f.file.type });
        if (!e) quellPfade.push(pfad);
      }
      const ergebnisPfad = `${ordner}/ergebnis.png`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(ergebnisPfad, blob, { contentType: "image/png" });
      if (upErr) throw new Error(`Ablage fehlgeschlagen: ${upErr.message}`);
      const { data: row } = await bildideenTable().insert({
        user_id: user.id, wunsch: wunsch.trim(), prompt, groesse: BILD_GROESSEN[format],
        quelle_pfade: quellPfade, ergebnis_pfad: ergebnisPfad,
      }).select("id").single();

      setErgebnis({ url: URL.createObjectURL(blob), blob, id: (row as any)?.id || null });
      void ladeVerlauf();
      toast({ title: "Bild erzeugt", description: "Herunterladen, ins Projekt ablegen oder als Ausgangsbild weiterdenken." });
    } catch (e) {
      toast({ variant: "destructive", title: "Bild konnte nicht erzeugt werden", description: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  };

  // ── Ergebnis weiterverwenden ────────────────────────────────────────────
  const herunterladen = () => {
    if (!ergebnis) return;
    const a = document.createElement("a");
    a.href = ergebnis.url;
    a.download = bildDateiname(wunsch);
    a.click();
  };

  const alsAusgangsbild = () => {
    if (!ergebnis) return;
    const file = new File([ergebnis.blob], bildDateiname(wunsch), { type: "image/png" });
    fotos.forEach((f) => URL.revokeObjectURL(f.url));
    setFotos([{ file, url: URL.createObjectURL(file) }]);
    setErgebnis(null);
    toast({ title: "Als Ausgangsbild übernommen", description: "Jetzt den nächsten Wunsch beschreiben." });
  };

  const projektDialogOeffnen = async () => {
    const { data } = await supabase.from("projects").select("id, name")
      .not("status", "eq", "Abgeschlossen").order("name").limit(300);
    setProjekte(((data as any[]) || []).map((p) => ({ id: p.id, name: p.name })));
    setProjektSuche("");
    setProjektDialog(true);
  };

  /** Ergebnis in die Projekt-Fotos kopieren (gleiches Muster wie die Galerie). */
  const insProjekt = async (projectId: string) => {
    if (!ergebnis) return;
    setAblegen(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const name = bildDateiname(wunsch);
      const pfad = buildProjectFilePath(projectId, name);
      const { error } = await supabase.storage.from("project-photos").upload(pfad, ergebnis.blob, { contentType: "image/png" });
      if (error) throw new Error(error.message);
      if (user) {
        const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(pfad);
        await supabase.from("documents").insert({
          project_id: projectId, user_id: user.id, typ: "photos", name,
          file_url: urlData.publicUrl, beschreibung: `Bildidee: ${wunsch.trim()}`,
        } as any);
      }
      if (ergebnis.id) await bildideenTable().update({ project_id: projectId }).eq("id", ergebnis.id);
      const projektName = projekte.find((p) => p.id === projectId)?.name || "Projekt";
      toast({ title: "Im Projekt abgelegt", description: `Unter „${projektName}" → Fotos.` });
      setProjektDialog(false);
      void ladeVerlauf();
    } catch (e) {
      toast({ variant: "destructive", title: "Ablegen fehlgeschlagen", description: (e as Error).message });
    } finally {
      setAblegen(false);
    }
  };

  const verlaufLoeschen = async (b: Bildidee) => {
    if (!window.confirm("Diese Bildidee löschen?")) return;
    await supabase.storage.from(BUCKET).remove([b.ergebnis_pfad, ...b.quelle_pfade]);
    await bildideenTable().delete().eq("id", b.id);
    void ladeVerlauf();
  };

  const verlaufOeffnen = async (b: Bildidee) => {
    const { data } = await supabase.storage.from(BUCKET).download(b.ergebnis_pfad);
    if (!data) return;
    setWunsch(b.wunsch);
    setErgebnis({ url: URL.createObjectURL(data), blob: data, id: b.id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title="Bildideen" />

      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* ── Eingabe ──────────────────────────────────────────────── */}
          <Card className="kb-panel">
            <CardContent className="space-y-4 pt-4">
              <div>
                <Label className="mb-1.5 block">1. Foto der Situation (optional, bis zu 4)</Label>
                <div className="flex flex-wrap gap-2">
                  {fotos.map((f, i) => (
                    <div key={f.url} className="relative h-24 w-24 overflow-hidden rounded-md border">
                      <img src={f.url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => fotoEntfernen(i)}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                        aria-label="Foto entfernen"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {fotos.length < 4 && (
                    <>
                      <button type="button" onClick={() => kameraRef.current?.click()}
                        className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted/40">
                        <Camera className="h-5 w-5" /> Kamera
                      </button>
                      <button type="button" onClick={() => dateiRef.current?.click()}
                        className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted/40">
                        <ImagePlus className="h-5 w-5" /> Datei
                      </button>
                    </>
                  )}
                </div>
                <input ref={kameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { fotosWaehlen(e.target.files); e.target.value = ""; }} />
                <input ref={dateiRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { fotosWaehlen(e.target.files); e.target.value = ""; }} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Mit Foto: Die KI baut den Wunsch in genau diese Situation ein. Ohne Foto: reine Ideenskizze.
                </p>
              </div>

              <div>
                <Label className="mb-1.5 block">2. Was soll dort hin? — einfach in eigenen Worten</Label>
                <Textarea
                  rows={4}
                  value={wunsch}
                  onChange={(e) => setWunsch(e.target.value)}
                  placeholder={"Beschreib es so, wie du es einem Kollegen sagen würdest, z. B.:\n»eine zarte Holzkonstruktion im Farbton der Fassade, mit Glasdach, über dem Vorplatz«\nJe konkreter (Material, Farbe, Ort im Bild, Größe), desto besser das Ergebnis."}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Vorlagen als Starthilfe — sie setzen einen Text ein, den du danach frei änderst:
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {BILD_VORLAGEN.map((v) => (
                    <button key={v.key} type="button" onClick={() => setWunsch(v.text)}
                      className="min-h-[30px] rounded-full border bg-background px-2.5 text-xs hover:bg-muted/40">
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block">3. Format</Label>
                <div className="flex gap-1.5">
                  {([["quer", "Querformat"], ["quadrat", "Quadrat"], ["hoch", "Hochformat"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setFormat(k)}
                      className={`min-h-[36px] rounded-md border px-3 text-sm ${format === k ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-background"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <Button className="w-full gap-2" size="lg" onClick={() => void erzeugen()} disabled={laeuft}>
                {laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
                {laeuft ? "Die KI zeichnet … (etwa eine Minute)" : "Bild erzeugen"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Jedes Bild kostet ein paar Cent. Das Ergebnis ist eine Idee, keine Planung — Maße und Statik prüft weiterhin der Fachmann.
              </p>
            </CardContent>
          </Card>

          {/* ── Ergebnis ─────────────────────────────────────────────── */}
          <Card className="kb-panel">
            <CardContent className="pt-4">
              {ergebnis ? (
                <div className="space-y-3">
                  <img src={ergebnis.url} alt="Erzeugtes Bild" className="w-full rounded-md border" />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="gap-1.5" onClick={herunterladen}>
                      <Download className="h-4 w-4" /> Herunterladen
                    </Button>
                    <Button variant="outline" className="gap-1.5" onClick={() => void projektDialogOeffnen()}>
                      <FolderPlus className="h-4 w-4" /> Ins Projekt ablegen
                    </Button>
                    <Button variant="outline" className="gap-1.5" onClick={alsAusgangsbild}
                      title="Dieses Ergebnis als Foto nehmen und den nächsten Wunsch darauf aufbauen">
                      <RefreshCw className="h-4 w-4" /> Weiterdenken
                    </Button>
                  </div>
                </div>
              ) : laeuft ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Die KI zeichnet — das dauert etwa eine Minute.</p>
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <Sparkles className="h-8 w-8" />
                  <p className="text-sm">Hier erscheint das erzeugte Bild.</p>
                  <p className="text-xs">Foto hochladen, Wunsch beschreiben, „Bild erzeugen".</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Verlauf ────────────────────────────────────────────────── */}
        {verlauf.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Bisherige Bildideen</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {verlauf.map((b) => (
                <div key={b.id} className="group relative overflow-hidden rounded-md border bg-card">
                  <button type="button" className="block w-full" onClick={() => void verlaufOeffnen(b)}>
                    {verlaufUrls[b.id]
                      ? <img src={verlaufUrls[b.id]} alt="" className="aspect-[3/2] w-full object-cover" loading="lazy" />
                      : <div className="aspect-[3/2] w-full bg-muted" />}
                    <div className="p-1.5 text-left">
                      <p className="truncate text-xs font-medium" title={b.wunsch}>{b.wunsch}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(b.created_at).toLocaleDateString("de-AT")}{b.project_id ? " · im Projekt" : ""}
                      </p>
                    </div>
                  </button>
                  <button type="button" onClick={() => void verlaufLoeschen(b)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"
                    aria-label="Löschen">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Projekt wählen */}
      {projektDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setProjektDialog(false)}>
          <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold">Ins Projekt ablegen</h3>
            <input
              autoFocus
              className="kb-input mb-2 w-full"
              placeholder="Projekt suchen …"
              value={projektSuche}
              onChange={(e) => setProjektSuche(e.target.value)}
            />
            <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {projekte.filter((p) => !projektSuche.trim() || p.name.toLowerCase().includes(projektSuche.trim().toLowerCase())).slice(0, 50).map((p) => (
                <button key={p.id} type="button" disabled={ablegen} onClick={() => void insProjekt(p.id)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50">
                  {p.name}
                </button>
              ))}
              {projekte.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">Keine Projekte.</p>}
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="outline" onClick={() => setProjektDialog(false)}>Abbrechen</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
