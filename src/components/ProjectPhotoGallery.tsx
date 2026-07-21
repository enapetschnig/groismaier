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

  /**
   * Kommentar zu einem Foto speichern.
   *
   * ACHTUNG RLS: public.documents hat SELECT/INSERT/DELETE-Policies, aber KEINE
   * UPDATE-Policy. Das frühere `update({ beschreibung })` lief deshalb ohne
   * Fehler ins Leere — der Kommentar war nach dem Neuladen wieder weg, sobald
   * das Foto schon eine documents-Zeile hatte (also bei praktisch jedem Foto).
   * Deshalb: Zeile ersetzen (löschen + neu anlegen), beides ist erlaubt.
   */
  const handleUpdateComment = async (photoId: string, comment: string) => {
    const file = files.find(f => f.path === photoId);
    if (!file) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Kommentar nicht gespeichert", description: "Nicht angemeldet." });
      return;
    }

    if (file.docId) {
      // .select() zeigt, ob wirklich gelöscht wurde — sonst würde ein zweiter,
      // widersprüchlicher Eintrag für dasselbe Foto entstehen.
      const { data: geloescht, error: delErr } = await supabase
        .from("documents").delete().eq("id", file.docId).select("id");
      if (delErr || !geloescht || geloescht.length === 0) {
        toast({
          variant: "destructive",
          title: "Kommentar nicht gespeichert",
          description: delErr?.message || "Keine Berechtigung, diesen Eintrag zu ändern.",
        });
        return;
      }
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
