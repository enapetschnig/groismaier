import { useState, useEffect, useRef } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PhotoLightbox } from "@/components/PhotoLightbox";

interface DisturbancePhoto {
  id: string;
  file_path: string;
  file_name: string;
  created_at: string;
}

interface DisturbancePhotosProps {
  disturbanceId: string;
  canEdit: boolean;
}

export const DisturbancePhotos = ({ disturbanceId, canEdit }: DisturbancePhotosProps) => {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<DisturbancePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPhotos();
  }, [disturbanceId]);

  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from("disturbance_photos")
      .select("*")
      .eq("disturbance_id", disturbanceId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPhotos(data);
    }
    setLoading(false);
  };

  const getPublicUrl = (filePath: string): string => {
    const { data } = supabase.storage
      .from("disturbance-photos")
      .getPublicUrl(filePath);
    return data.publicUrl;
  };

  // Zentrale Upload-Funktion (für Input + Drag&Drop)
  const uploadPhotoFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setUploading(false);
      return;
    }

    let uploadedCount = 0;

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Ungültiger Dateityp",
          description: `${file.name} ist kein Bild`,
        });
        continue;
      }

      // Max 10MB
      if (file.size > 10 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Datei zu groß",
          description: `${file.name} ist größer als 10MB`,
        });
        continue;
      }

      const fileName = `${disturbanceId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("disturbance-photos")
        .upload(fileName, file);

      if (uploadError) {
        toast({
          variant: "destructive",
          title: "Upload fehlgeschlagen",
          description: uploadError.message,
        });
        continue;
      }

      // Create database entry
      const { error: dbError } = await supabase
        .from("disturbance_photos")
        .insert({
          disturbance_id: disturbanceId,
          user_id: user.id,
          file_path: fileName,
          file_name: file.name,
        });

      if (dbError) {
        // Clean up storage if db insert failed
        await supabase.storage.from("disturbance-photos").remove([fileName]);
        toast({
          variant: "destructive",
          title: "Fehler",
          description: "Foto konnte nicht gespeichert werden",
        });
        continue;
      }

      uploadedCount++;
    }

    if (uploadedCount > 0) {
      toast({ title: "Erfolg", description: `${uploadedCount} Foto${uploadedCount > 1 ? "s" : ""} hochgeladen` });
      fetchPhotos();
    }
    setUploading(false);
  };

  // Input-Change-Handler
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = input.files ? Array.from(input.files) : [];
    await uploadPhotoFiles(files);
    input.value = "";
  };

  const handleDelete = async (photo: DisturbancePhoto) => {
    // Delete from storage
    await supabase.storage.from("disturbance-photos").remove([photo.file_path]);

    // Delete from database
    const { error } = await supabase
      .from("disturbance_photos")
      .delete()
      .eq("id", photo.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Foto konnte nicht gelöscht werden",
      });
    } else {
      toast({
        title: "Erfolg",
        description: "Foto gelöscht",
      });
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    }
  };

  return (
    <>
      <Card
        onDragOver={canEdit ? (e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary"); } : undefined}
        onDragLeave={canEdit ? (e) => { e.currentTarget.classList.remove("ring-2", "ring-primary"); } : undefined}
        onDrop={canEdit ? async (e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-2", "ring-primary");
          await uploadPhotoFiles(Array.from(e.dataTransfer.files));
        } : undefined}
        className="kb-panel transition-all"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-5 w-5" />
              Fotos
              {photos.length > 0 && <span className="text-sm font-normal text-muted-foreground">({photos.length})</span>}
            </CardTitle>
            {canEdit && (
              <div className="flex shrink-0 gap-2">
                {/* Am Handy der wichtigste Weg: direkt fotografieren */}
                <Button
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2 h-11"
                >
                  <Camera className="h-4 w-4" />
                  {uploading ? "Lädt…" : "Foto"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Fotos aus Galerie hochladen"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="h-11 w-11 p-0"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleUpload}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Lädt Fotos...
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground space-y-3">
              <p>Keine Fotos vorhanden</p>
              {canEdit && (
                <Button
                  variant="outline"
                  className="h-12 text-base"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Foto aufnehmen
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="relative group aspect-square">
                  <img
                    src={getPublicUrl(photo.file_path)}
                    alt={photo.file_name}
                    className="w-full h-full object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setLightboxIndex(idx)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg pointer-events-none" />
                  {canEdit && (
                    /* Am Handy gibt es kein Hover — Löschen muss sichtbar sein */
                    <Button
                      variant="destructive"
                      size="icon"
                      aria-label="Foto löschen"
                      className="absolute bottom-1 right-1 h-10 w-10 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(photo)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PhotoLightbox
        photos={photos.map((p) => ({ url: getPublicUrl(p.file_path), alt: p.file_name }))}
        initialIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
};
