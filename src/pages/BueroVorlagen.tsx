import { FolderOpen, FileText, FileSpreadsheet, Image as ImageIcon, Download, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BUERO_VORLAGEN } from "@/lib/unterlagenData";

/**
 * Büro-Vorlagen — Holzbau Groismaier
 *
 * Vorlagen für den Büroalltag (Deckblätter für Bauvorhaben, Ordnerrücken/
 * Ordnerbeschriftung, Stundendoku, Firmenstempel, Briefpapier) aus dem
 * GROISMAIER-Ordner. PDFs/Bilder ansehen, Word-/Excel-Vorlagen herunterladen
 * und ausfüllen.
 */
function iconFor(ext: string) {
  if (ext === "pdf") return FileText;
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return ImageIcon;
  if (ext === "xls" || ext === "xlsx") return FileSpreadsheet;
  return FileText;
}

export default function BueroVorlagen() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Büro-Vorlagen" />

      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-5xl">
        <p className="text-muted-foreground mb-6 flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary shrink-0" />
          Vorlagen für den Büroalltag — Deckblätter, Ordnerrücken, Stundendoku, Stempel &amp; Briefpapier.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BUERO_VORLAGEN.map((item) => {
            const Icon = iconFor(item.ext);
            return (
              <Card key={item.file} className="flex flex-col hover:shadow-md transition-shadow">
                <CardHeader className="space-y-2 pb-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
                  <CardDescription className="text-xs">{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex gap-2">
                  {item.viewable ? (
                    <>
                      <Button size="sm" className="flex-1" asChild>
                        <a href={item.file} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1.5" /> Ansehen
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={item.file} download>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" className="flex-1" variant="secondary" asChild>
                      <a href={item.file} download>
                        <Download className="h-4 w-4 mr-1.5" /> Download ({item.ext.toUpperCase()})
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
