import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Upload, FileText, Trash2, Eye, FolderOpen, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { FileViewer } from "@/components/FileViewer";
import { ProjectPhotoGallery } from "@/components/ProjectPhotoGallery";
import { buildProjectFilePath, listProjectFiles, deleteProjectFile, safeStorageName, type ProjectFile } from "@/lib/projectFiles";

type DocumentType = "plans" | "reports" | "photos" | "chef" | "materials";

const bucketMap: Record<DocumentType, string> = {
  plans: "project-plans",
  reports: "project-reports",
  photos: "project-photos",
  chef: "project-chef",
  materials: "project-materials",
};

const titleMap: Record<DocumentType, string> = {
  plans: "Pläne",
  // project-reports ist der Sammelordner: hochgeladene Dokumente UND die
  // generierten PDFs (Angebote, Rechnungen, Regieberichte) in Unterordnern.
  reports: "Dokumente & Berichte",
  photos: "Fotos",
  chef: "🔒 Chefordner",
  materials: "Materialdokumente",
};

/** Sentinel-Wert im Ordner-Select (Radix Select verbietet leere Values). */
const NEUER_ORDNER = "__neu__";
const HAUPTORDNER = "__root__";

/** Anzeigename für einen Unterordner im Bucket (aus pdfUploader.ts). */
const ORDNER_LABEL: Record<string, string> = {
  angebote: "📄 Angebote",
  rechnungen: "🧾 Rechnungen",
  regieberichte: "📝 Regieberichte",
  berichte: "📋 Berichte",
  protokolle: "🗒️ Protokolle",
};

const ProjectDetail = () => {
  const { projectId, type } = useParams<{ projectId: string; type: DocumentType }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  // Zielordner beim Hochladen ("" = Hauptordner). Vorher landete JEDE manuell
  // hochgeladene Datei zwingend im Hauptordner — Ablegen in einem Unterordner
  // war gar nicht möglich.
  const [uploadOrdner, setUploadOrdner] = useState<string>(HAUPTORDNER);
  const [neuerOrdner, setNeuerOrdner] = useState("");
  const [renameTarget, setRenameTarget] = useState<ProjectFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewerState, setViewerState] = useState<{
    open: boolean;
    fileName: string;
    filePath: string;
  }>({ open: false, fileName: "", filePath: "" });

  useEffect(() => {
    if (projectId && type) {
      checkAdminStatus();
      fetchProjectName();
      fetchFiles();
    }
  }, [projectId, type]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    setIsAdmin(data?.role === "administrator");
  };

  const fetchProjectName = async () => {
    if (!projectId) return;
    
    const { data } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();

    if (data) {
      setProjectName(data.name);
    }
  };

  const fetchFiles = async () => {
    if (!projectId || !type) return;
    setLoading(true);
    // listProjectFiles liest den Storage inkl. EINER Ebene Unterordner.
    // Wichtig: die generierten Angebots-/Rechnungs-/Regiebericht-PDFs liegen in
    // project-reports/<projectId>/angebote|rechnungen|regieberichte/ — mit dem
    // früheren flachen list() waren sie hier unsichtbar (und die Unterordner
    // selbst tauchten als "Datei" mit kaputtem Ansehen-Button auf).
    const list = await listProjectFiles(projectId, bucketMap[type]);
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    setFiles(list);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !projectId || !type) return;

    setUploading(true);
    const bucket = bucketMap[type];
    const { data: { user } } = await supabase.auth.getUser();
    const selected = Array.from(e.target.files);
    let ok = 0;
    let lastError = "";

    // Zielordner: leer = Hauptordner. Der Unterordner-Name wird storage-sicher
    // gemacht (Umlaute lehnt Supabase im Key ab).
    const ordner =
      uploadOrdner === HAUPTORDNER ? ""
      : uploadOrdner === NEUER_ORDNER ? safeStorageName(neuerOrdner.trim())
      : uploadOrdner;

    for (const file of selected) {
      // Storage-sicherer Pfad (Umlaute/Sonderzeichen) — Originalname in documents.name
      const basis = buildProjectFilePath(projectId, file.name);
      const filePath = ordner ? `${projectId}/${ordner}/${basis.slice(projectId.length + 1)}` : basis;
      const { error } = await supabase.storage.from(bucket).upload(filePath, file);
      if (error) { lastError = error.message; continue; }
      ok++;
      // documents-Index für die exakte Namensanzeige in den anderen Ordnern
      if (user) {
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        await supabase.from("documents").insert({
          project_id: projectId,
          user_id: user.id,
          typ: type,
          name: file.name,
          file_url: urlData.publicUrl,
        } as any);
      }
    }

    if (ok > 0) {
      toast({
        title: "Erfolg",
        description: `${ok} Datei(en) hochgeladen${ordner ? ` → Ordner „${ordner}"` : ""}`,
      });
      if (uploadOrdner === NEUER_ORDNER && ordner) { setUploadOrdner(ordner); setNeuerOrdner(""); }
      fetchFiles();
    } else {
      toast({ variant: "destructive", title: "Fehler", description: lastError || "Datei konnte nicht hochgeladen werden" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async () => {
    if (!projectId || !type || !deleteTarget) return;
    setDeleting(true);
    // deleteProjectFile räumt Storage UND die documents-Zeile auf — sonst blieb
    // ein Karteileichen-Eintrag zurück, der den Anzeigenamen weiter lieferte.
    const { error } = await deleteProjectFile(bucketMap[type], deleteTarget);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error });
    } else {
      toast({ title: "Gelöscht", description: `"${deleteTarget.name}" wurde entfernt` });
      fetchFiles();
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  /**
   * Umbenennen = Anzeigename in `documents` setzen. Der Storage-Schlüssel bleibt
   * unverändert (er ist storage-sicher und wird von signierten URLs referenziert),
   * gezeigt wird überall der Name aus documents (siehe listProjectFiles).
   *
   * ACHTUNG RLS: public.documents hat SELECT/INSERT/DELETE-Policies, aber KEINE
   * UPDATE-Policy. Ein UPDATE läuft deshalb ohne Fehlermeldung ins Leere
   * (0 Zeilen betroffen). Darum wird die Zeile ersetzt: alte löschen, neue
   * anlegen — beides ist per Policy erlaubt.
   */
  const handleRename = async () => {
    if (!projectId || !type || !renameTarget) return;
    const neu = renameValue.trim();
    if (!neu) {
      toast({ variant: "destructive", title: "Name fehlt" });
      return;
    }
    setRenaming(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      if (renameTarget.docId) {
        // .select() liefert die tatsächlich gelöschten Zeilen — so fällt auf,
        // wenn RLS den Zugriff verweigert (statt still nichts zu tun).
        const { data: geloescht, error: delErr } = await supabase
          .from("documents").delete().eq("id", renameTarget.docId).select("id");
        if (delErr) throw delErr;
        if (!geloescht || geloescht.length === 0) {
          throw new Error("Keine Berechtigung, diesen Eintrag zu ändern.");
        }
      }

      const { data: urlData } = supabase.storage.from(bucketMap[type]).getPublicUrl(renameTarget.path);
      const { error: insErr } = await supabase.from("documents").insert({
        project_id: projectId,
        user_id: user.id,
        typ: type,
        name: neu,
        file_url: urlData.publicUrl,
        beschreibung: renameTarget.beschreibung,
      } as any);
      if (insErr) throw insErr;

      toast({ title: "Umbenannt", description: `Heißt jetzt "${neu}"` });
      setRenameTarget(null);
      fetchFiles();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Umbenennen fehlgeschlagen", description: err.message });
    } finally {
      setRenaming(false);
    }
  };

  const handleFileOpen = (file: ProjectFile) => {
    setViewerState({ open: true, fileName: file.name, filePath: file.path });
  };

  /** Unterordner-Anteil des Storage-Pfads ("angebote/…" → "angebote"). */
  const ordnerVon = (file: ProjectFile): string | null => {
    const rest = file.path.startsWith(`${projectId}/`) ? file.path.slice(projectId!.length + 1) : file.path;
    const i = rest.indexOf("/");
    return i > 0 ? rest.slice(0, i) : null;
  };

  const istBild = (name: string) => /\.(jpe?g|png|gif|webp|avif)$/i.test(name);

  /** Unterordner, die es im Bucket schon gibt — als Ablageziel anbieten. */
  const vorhandeneOrdner = useMemo(
    () => [...new Set(files.map(ordnerVon).filter((o): o is string => !!o))].sort(),
    [files],
  );

  const sichtbar = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q) || (ordnerVon(f) || "").toLowerCase().includes(q));
  }, [files, query]);

  if (!type || !bucketMap[type]) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Unbekannter Ordner" backPath={`/projects/${projectId}`} />
        <main className="container mx-auto px-4 py-10 text-center">
          <p className="text-muted-foreground">Diesen Projektordner gibt es nicht.</p>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lädt...</p>
      </div>
    );
  }

  // Für Fotos die gleiche Gallery wie bei Erstterminen verwenden —
  // Grid, Drag&Drop, Lightbox, Kommentar pro Foto.
  if (type === "photos") {
    return (
      <div className="min-h-screen bg-background">
        {/* Zurück führt ins PROJEKT, nicht in die Projektliste — sonst verliert
            man nach jedem Ordner-Besuch den Projektkontext. */}
        <PageHeader title={`${projectName} - Fotos`} backPath={`/projects/${projectId}`} />
        <main className="container mx-auto px-4 py-6 max-w-5xl">
          {projectId && <ProjectPhotoGallery projectId={projectId} />}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={`${projectName} - ${titleMap[type]}`} backPath={`/projects/${projectId}`} />

      <main className="container mx-auto px-3 sm:px-4 py-6 max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle>{titleMap[type]}</CardTitle>
            <CardDescription>
              {files.length} {files.length === 1 ? "Datei" : "Dateien"}
              {type === "reports" && " — inkl. der automatisch abgelegten Angebots- und Rechnungs-PDFs"}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {/* Upload section - Admin only */}
            {isAdmin && (
              <div className="mb-6 space-y-2">
                {/* Ablageort wählen: Hauptordner, vorhandener Unterordner oder
                    ein neuer. Ohne das landete jede Datei zwangsweise flach im
                    Hauptordner. */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Ablegen in</Label>
                    <Select value={uploadOrdner} onValueChange={setUploadOrdner}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={HAUPTORDNER}>📁 Hauptordner</SelectItem>
                        {vorhandeneOrdner.map((o) => (
                          <SelectItem key={o} value={o}>{ORDNER_LABEL[o] || `📁 ${o}`}</SelectItem>
                        ))}
                        <SelectItem value={NEUER_ORDNER}>➕ Neuer Unterordner …</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {uploadOrdner === NEUER_ORDNER && (
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Name des neuen Ordners</Label>
                      <Input
                        className="h-11"
                        value={neuerOrdner}
                        onChange={(e) => setNeuerOrdner(e.target.value)}
                        placeholder="z.B. Statik"
                      />
                    </div>
                  )}
                </div>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-base font-medium mb-1">
                      {uploading ? "Lädt hoch..." : "Datei auswählen"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Klicken zum Auswählen · mehrere möglich
                    </p>
                  </div>
                </label>
                <Input
                  id="file-upload"
                  type="file"
                  onChange={handleUpload}
                  disabled={uploading}
                  multiple
                  className="hidden"
                />
              </div>
            )}

            {files.length > 3 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 pl-10"
                  placeholder="Datei suchen..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}

            {files.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">Keine Dateien</p>
                <p className="text-sm text-muted-foreground">
                  {isAdmin ? "Lade die erste Datei hoch" : "Hier wurde noch nichts abgelegt"}
                </p>
              </div>
            ) : sichtbar.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Kein Treffer für „{query}"</p>
            ) : (
              <div className="space-y-2">
                {sichtbar.map((file) => {
                  const ordner = ordnerVon(file);
                  return (
                    <div
                      key={file.path}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {istBild(file.name) && file.url ? (
                          <img
                            src={file.url}
                            alt=""
                            className="w-12 h-12 object-cover rounded shrink-0 border"
                            onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                          />
                        ) : (
                          <FileText className="w-10 h-10 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium break-words">{file.name}</p>
                          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                            <span>{new Date(file.createdAt).toLocaleDateString("de-AT")}</span>
                            {file.size > 0 && (
                              <span>· {file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(file.size < 1024 * 100 ? 1 : 0)} KB`}</span>
                            )}
                            {ordner && (
                              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                                <FolderOpen className="h-3 w-3" />
                                {ORDNER_LABEL[ordner] || ordner}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                        <Button variant="outline" className="h-11" onClick={() => handleFileOpen(file)}>
                          <Eye className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Ansehen</span>
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            className="h-11 w-11 p-0"
                            aria-label={`${file.name} umbenennen`}
                            onClick={() => { setRenameTarget(file); setRenameValue(file.name); }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="destructive"
                            className="h-11 w-11 p-0"
                            aria-label={`${file.name} löschen`}
                            onClick={() => setDeleteTarget(file)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Umbenennen */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Datei umbenennen</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Anzeigename</Label>
            <Input
              className="h-11"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              autoFocus
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Der Anzeigename ändert sich überall in der App. Die Datei selbst bleibt am
              gleichen Speicherort — bestehende Links funktionieren weiter.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setRenameTarget(null)}>Abbrechen</Button>
            <Button className="h-11" onClick={handleRename} disabled={renaming || !renameValue.trim()}>
              {renaming ? "Speichert..." : "Umbenennen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Löschen mit Rückfrage */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Datei endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> wird unwiderruflich aus dem Projektordner
              entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Wird gelöscht..." : "Ja, löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FileViewer
        open={viewerState.open}
        onClose={() => setViewerState({ open: false, fileName: "", filePath: "" })}
        fileName={viewerState.fileName}
        filePath={viewerState.filePath}
        bucketName={bucketMap[type]}
      />
    </div>
  );
};

export default ProjectDetail;
