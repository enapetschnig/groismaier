import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PhotoGallery, type PhotoItem } from "@/components/PhotoGallery";
import { listProjectFiles, deleteProjectFile, type ProjectFile } from "@/lib/projectFiles";

/**
 * Projekt-Foto-Galerie. Quelle der Wahrheit ist der Storage-Bucket
 * project-photos — JEDES hochgeladene Foto wird angezeigt, egal über welchen
 * Weg es kam (QuickUpload "Dateien hochladen", Kamera, Projekt-Anlage,
 * Projekt-Detail …). Die 'documents'-Tabelle dient nur noch als Kommentar-
 * Index (beschreibung pro Foto).
 */
export function ProjectPhotoGallery({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async () => {
    setLoading(true);
    setFiles(await listProjectFiles(projectId, "project-photos"));
    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, [projectId]);

  const handleUpload = async (file: File, comment: string | null) => {
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Ungültiger Dateityp", description: "Nur Bilder erlaubt." });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Datei zu groß", description: "Max. 20 MB pro Foto." });
      return;
    }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const filePath = `${projectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("project-photos")
      .upload(filePath, file, { contentType: file.type });
    if (upErr) {
      toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: upErr.message });
      return;
    }
    // documents-Zeile als Kommentar-Index — best effort, blockiert die Anzeige
    // NICHT mehr (das Foto erscheint ohnehin, weil die Galerie aus dem Storage liest).
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(filePath);
      await supabase.from("documents").insert({
        project_id: projectId,
        user_id: user.id,
        typ: "photos",
        name: file.name,
        file_url: urlData.publicUrl,
        beschreibung: comment || null,
      } as any);
    }
    await fetchFiles();
  };

  const handleUpdateComment = async (photoId: string, comment: string) => {
    const file = files.find(f => f.path === photoId);
    if (!file) return;
    if (file.docId) {
      const { error } = await supabase.from("documents").update({ beschreibung: comment } as any).eq("id", file.docId);
      if (error) {
        toast({ variant: "destructive", title: "Kommentar nicht gespeichert", description: error.message });
        return;
      }
      setFiles(prev => prev.map(f => f.path === photoId ? { ...f, beschreibung: comment } : f));
      return;
    }
    // Noch keine documents-Zeile (Foto über anderen Weg hochgeladen) → anlegen.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Kommentar nicht gespeichert", description: "Nicht angemeldet." });
      return;
    }
    const { data: inserted, error } = await supabase.from("documents").insert({
      project_id: projectId,
      user_id: user.id,
      typ: "photos",
      name: file.name,
      file_url: file.url,
      beschreibung: comment,
    } as any).select("id").single();
    if (error) {
      toast({ variant: "destructive", title: "Kommentar nicht gespeichert", description: error.message });
      return;
    }
    const newId = (inserted as any)?.id ?? null;
    setFiles(prev => prev.map(f => f.path === photoId ? { ...f, beschreibung: comment, docId: newId } : f));
  };

  const handleDelete = async (photo: PhotoItem) => {
    const file = files.find(f => f.path === photo.id);
    if (!file) return;
    const { error } = await deleteProjectFile("project-photos", file);
    if (error) {
      toast({ variant: "destructive", title: "Foto konnte nicht gelöscht werden", description: error });
      return;
    }
    setFiles(prev => prev.filter(f => f.path !== photo.id));
  };

  const items: PhotoItem[] = files.map(f => ({
    id: f.path,
    url: f.url,
    fileName: f.name,
    beschreibung: f.beschreibung,
    createdAt: f.createdAt,
  }));

  return (
    <PhotoGallery
      photos={items}
      loading={loading}
      onUpload={handleUpload}
      onUpdateComment={handleUpdateComment}
      onDelete={handleDelete}
    />
  );
}
