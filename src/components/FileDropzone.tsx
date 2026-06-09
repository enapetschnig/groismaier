import { useState, useRef, ReactNode } from "react";
import { Upload } from "lucide-react";

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string;              // z.B. "image/*,application/pdf"
  multiple?: boolean;
  className?: string;
  children?: ReactNode;         // Alternatives Content — wenn gesetzt wird children gerendert statt default
  /** Max pro Datei in MB (default: 10) */
  maxSizeMB?: number;
}

export function FileDropzone({
  onFiles,
  accept = "image/*",
  multiple = true,
  className = "",
  children,
  maxSizeMB = 10,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const maxBytes = maxSizeMB * 1024 * 1024;
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > maxBytes) {
        console.warn(`Datei zu groß: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length) onFiles(accepted);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer transition-colors ${
        dragging ? "ring-2 ring-primary ring-offset-2 bg-primary/5" : ""
      } ${className}`}
    >
      {children ?? (
        <div className={`border-2 border-dashed rounded-lg p-6 text-center ${
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        }`}>
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Dateien hier ablegen oder klicken</p>
          <p className="text-xs text-muted-foreground mt-1">
            {accept === "image/*" ? "Fotos (JPG, PNG)" : "Dateien"}
            {multiple ? " · Mehrere auswählbar" : ""}
            {` · max ${maxSizeMB} MB`}
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
