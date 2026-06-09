import { useState, useRef, useEffect } from "react";
import { Camera, Trash2, ZoomIn, Upload, ImagePlus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/**
 * Gemeinsame Foto-Komponente für Projekte, Ersttermine und weitere
 * Entitäten mit Foto-Dokumentation. Bietet:
 *   - responsives Grid (2 / 3 / 4 Spalten)
 *   - PhotoLightbox mit Prev/Next + Caption
 *   - Kommentar-Input direkt unter jedem Thumbnail (auto-save onBlur)
 *   - Upload via File-Picker (Multi-Select), Kamera-Capture auf Mobile
 *   - Optionaler Kommentar-Dialog direkt nach Upload
 *
 * Die Komponente ist rein präsentational — Datenpersistenz läuft über
 * die übergebenen Callbacks. Dadurch kann sie sowohl die generische
 * `documents`-Tabelle (Projekt-Fotos) als auch dedizierte Foto-Tabellen
 * (Ersttermin, Bautagesbericht usw.) bedienen, ohne dass die Komponente
 * die jeweilige Persistenz kennen muss.
 */

export interface PhotoItem {
  id: string;
  url: string;
  fileName?: string;
  beschreibung?: string | null;
  createdAt?: string;
}

export interface PhotoGalleryProps {
  photos: PhotoItem[];
  loading?: boolean;
  /** Upload eines Einzel-Files. Kommentar optional (aus Dialog). */
  onUpload: (file: File, comment: string | null) => Promise<void>;
  onUpdateComment: (photoId: string, comment: string) => Promise<void>;
  onDelete: (photo: PhotoItem) => Promise<void>;
  /** Kein Upload / Edit / Delete — nur Ansicht. */
  readOnly?: boolean;
  /** Beschriftung der Card, default "Fotos". */
  title?: string;
  /** Kommentar-Dialog nach Upload anzeigen? Default true. */
  askCommentOnUpload?: boolean;
  /** Zusätzlicher Button rechts in der Card-Header (z.B. für Copy-Actions). */
  headerExtra?: React.ReactNode;
}

export function PhotoGallery({
  photos,
  loading = false,
  onUpload,
  onUpdateComment,
  onDelete,
  readOnly = false,
  title = "Fotos",
  askCommentOnUpload = true,
  headerExtra,
}: PhotoGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Lokaler Kommentar-State pro Foto. Wird onBlur persistiert, damit
  // der Input beim Tippen nicht bei jedem Tastendruck schreibt.
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});
  // Pending-File für den Kommentar-Dialog direkt nach Select
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingComment, setPendingComment] = useState("");

  // Sync draft-Comments, wenn photos-Array sich ändert
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of photos) {
      next[p.id] = p.beschreibung || "";
    }
    setDraftComments(next);
  }, [photos]);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    e.currentTarget.value = "";

    if (askCommentOnUpload && arr.length === 1) {
      // Einzelfile: Kommentar-Dialog öffnen vor Upload
      const file = arr[0];
      setPendingFile(file);
      setPendingPreview(URL.createObjectURL(file));
      setPendingComment("");
      return;
    }

    // Mehrere Dateien ODER askCommentOnUpload=false: direkt hochladen
    setUploading(true);
    for (const file of arr) {
      try { await onUpload(file, null); } catch {}
    }
    setUploading(false);
  };

  const handleConfirmPending = async (save: boolean) => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      await onUpload(pendingFile, save ? (pendingComment.trim() || null) : null);
    } finally {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingFile(null);
      setPendingPreview(null);
      setPendingComment("");
      setUploading(false);
    }
  };

  const handleCommentBlur = async (photoId: string) => {
    const original = photos.find(p => p.id === photoId)?.beschreibung || "";
    const draft = draftComments[photoId] || "";
    if (draft === original) return;
    try { await onUpdateComment(photoId, draft); } catch {}
  };

  // Drag&Drop: eine Datei auf die Card ziehen startet den gleichen
  // Flow wie der Upload-Button (inkl. Kommentar-Dialog bei Einzelfile).
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = () => setDragActive(false);
  const handleDrop = async (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    if (askCommentOnUpload && files.length === 1) {
      const file = files[0];
      setPendingFile(file);
      setPendingPreview(URL.createObjectURL(file));
      setPendingComment("");
      return;
    }
    setUploading(true);
    for (const file of files) {
      try { await onUpload(file, null); } catch {}
    }
    setUploading(false);
  };

  return (
    <>
      <Card
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`transition-all ${dragActive ? "ring-2 ring-primary" : ""}`}
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" /> {title}
              {photos.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">({photos.length})</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {headerExtra}
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? "Lädt..." : "Foto hinzufügen"}
                </Button>
              )}
            </div>
          </div>
          {!readOnly && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Lädt Fotos…</div>
          ) : photos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ImagePlus className="h-10 w-10 mx-auto opacity-40 mb-2" />
              <p className="text-sm">Noch keine Fotos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="space-y-1">
                  <div className="relative group aspect-square">
                    <img
                      src={photo.url}
                      alt={photo.fileName || ""}
                      className="w-full h-full object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxIndex(idx)}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg pointer-events-none" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-7 w-7 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                      onClick={() => setLightboxIndex(idx)}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    {!readOnly && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute bottom-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDelete(photo)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="Kommentar…"
                    value={draftComments[photo.id] ?? ""}
                    onChange={(e) => setDraftComments(prev => ({ ...prev, [photo.id]: e.target.value }))}
                    onBlur={() => handleCommentBlur(photo.id)}
                    disabled={readOnly}
                    className="text-xs h-7"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PhotoLightbox
        photos={photos.map(p => ({
          url: p.url,
          alt: p.fileName || "",
          caption: p.beschreibung || undefined,
        }))}
        initialIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />

      {/* Kommentar-Dialog direkt nach Upload */}
      <Dialog open={pendingFile !== null} onOpenChange={(open) => { if (!open) handleConfirmPending(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Kommentar hinzufügen?
            </DialogTitle>
          </DialogHeader>
          {pendingPreview && (
            <img
              src={pendingPreview}
              alt="Vorschau"
              className="w-full max-h-64 object-contain rounded border bg-muted"
            />
          )}
          <Textarea
            value={pendingComment}
            onChange={(e) => setPendingComment(e.target.value)}
            placeholder="Beschreibung zum Foto (optional, kann später nachgetragen werden)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => handleConfirmPending(false)} disabled={uploading}>
              Ohne Kommentar speichern
            </Button>
            <Button onClick={() => handleConfirmPending(true)} disabled={uploading}>
              {uploading ? "Lädt…" : "Mit Kommentar speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
