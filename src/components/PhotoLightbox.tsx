import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface LightboxPhoto {
  url: string;
  alt?: string;
  caption?: string;
}

interface Props {
  photos: LightboxPhoto[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function PhotoLightbox({ photos, initialIndex, open, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length, onClose]);

  if (!photos.length) return null;
  const current = photos[index] || photos[0];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden sm:rounded-lg bg-black">
        <DialogClose className="absolute right-4 top-4 z-10 rounded-sm bg-black/50 p-2 opacity-80 hover:opacity-100">
          <X className="h-5 w-5 text-white" />
        </DialogClose>

        {photos.length > 1 && (
          <div className="absolute top-4 left-4 z-10 rounded-md bg-black/50 px-2.5 py-1 text-xs text-white">
            {index + 1} / {photos.length}
          </div>
        )}

        {photos.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
              onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
              aria-label="Vorheriges Foto"
            >
              <ChevronLeft className="h-7 w-7" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
              onClick={() => setIndex((i) => (i + 1) % photos.length)}
              aria-label="Nächstes Foto"
            >
              <ChevronRight className="h-7 w-7" />
            </Button>
          </>
        )}

        <img
          src={current.url}
          alt={current.alt || ""}
          className="w-full h-full object-contain max-h-[92vh] bg-black"
        />

        {current.caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white text-sm">
            {current.caption}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
