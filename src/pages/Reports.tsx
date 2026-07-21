import { BarChart3, Download, Check, ChevronsUpDown, FolderOpen, ImagePlus, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QuickUploadDialog } from "@/components/QuickUploadDialog";
import { ProjectFilesManager } from "@/components/ProjectFilesManager";
import { KBToolbar } from "@/components/kingbill";

type Project = {
  id: string;
  name: string;
};

type TimeEntry = {
  id: string;
  datum: string;
  taetigkeit: string;
  stunden: number;
  notizen: string | null;
  user_id: string;
  mitarbeiter: string;
  projektName: string;
};

/** Rohzeile aus time_entries inkl. Left-Join auf projects. */
type RawEntry = {
  id: string;
  datum: string;
  taetigkeit: string;
  stunden: number | string;
  notizen: string | null;
  user_id: string;
  projects: { name: string } | null;
};

type StorageFile = {
  name: string;
  id: string;
  created_at: string;
};

const Reports = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHours, setTotalHours] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [projectPhotos, setProjectPhotos] = useState<StorageFile[]>([]);
  const [showQuickUpload, setShowQuickUpload] = useState(false);
  const [showFilesManager, setShowFilesManager] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchTimeEntries();
    if (selectedProject && selectedProject !== "all") {
      fetchProjectPhotos(selectedProject);
    } else {
      setProjectPhotos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .not('status', 'eq', 'Abgeschlossen')
      .order('name');

    if (error) {
      console.error('Error fetching projects:', error);
      toast.error('Fehler beim Laden der Projekte');
      return;
    }

    setProjects(data || []);
  };

  const fetchTimeEntries = async () => {
    setLoading(true);

    // WICHTIG: projects(name) ist ein LEFT JOIN. Vorher stand hier
    // projects!inner(name) — dadurch verschwanden ALLE Buchungen ohne Projekt
    // (z. B. Werkstatt-/Regiestunden) lautlos aus der Auswertung; die Maske
    // meldete „Keine Zeiteinträge gefunden", obwohl Stunden gebucht waren.
    let query = supabase
      .from('time_entries')
      .select(`
        id,
        datum,
        taetigkeit,
        stunden,
        notizen,
        user_id,
        projects(name)
      `)
      .order('datum', { ascending: false });

    if (selectedProject !== "all") {
      query = query.eq('project_id', selectedProject);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching time entries:', error);
      toast.error('Fehler beim Laden der Zeiteinträge');
      setLoading(false);
      return;
    }

    const rows = (data || []) as unknown as RawEntry[];

    // Namen in EINER Abfrage holen (vorher: eine profiles-Abfrage pro Zeile —
    // bei 500 Buchungen 500 Requests und eine sichtbar hängende Maske).
    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, vorname, nachname')
        .in('id', userIds);
      (profs || []).forEach((p) => {
        nameById.set(p.id, [p.vorname, p.nachname].filter(Boolean).join(" ").trim() || "Unbekannt");
      });
    }

    const entries: TimeEntry[] = rows.map(r => ({
      id: r.id,
      datum: r.datum,
      taetigkeit: r.taetigkeit,
      stunden: Number(r.stunden) || 0,
      notizen: r.notizen,
      user_id: r.user_id,
      mitarbeiter: nameById.get(r.user_id) || "Unbekannt",
      projektName: r.projects?.name || "Ohne Projekt",
    }));

    setTimeEntries(entries);
    setTotalHours(entries.reduce((sum, e) => sum + e.stunden, 0));
    setLoading(false);
  };

  const fetchProjectPhotos = async (projectId: string) => {
    const { data, error } = await supabase.storage
      .from('project-photos')
      .list(projectId, {
        limit: 4,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      console.error('Error fetching photos:', error);
      return;
    }

    setProjectPhotos(data || []);
  };

  const getPhotoUrl = (projectId: string, fileName: string) => {
    const { data } = supabase.storage
      .from('project-photos')
      .getPublicUrl(`${projectId}/${fileName}`);
    return data.publicUrl;
  };

  // Einfacher HTML-Escape — Projekt-/Tätigkeitstexte kommen aus Nutzereingaben
  // und landen im Export-HTML.
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

  const exportToPDF = async () => {
    setExporting(true);

    try {
      const projectName = selectedProject === "all"
        ? "Alle Projekte"
        : projects.find(p => p.id === selectedProject)?.name || "Unbekanntes Projekt";

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Stundenauswertung - ${esc(projectName)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; border-bottom: 2px solid #666; padding-bottom: 10px; }
            .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .summary h2 { margin: 0 0 10px 0; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #333; color: white; padding: 12px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .total { font-weight: bold; font-size: 18px; color: #2563eb; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Stundenauswertung - ${esc(projectName)}</h1>
          <div class="summary">
            <h2>Zusammenfassung</h2>
            <p><strong>Projekt:</strong> ${esc(projectName)}</p>
            <p><strong>Anzahl Einträge:</strong> ${timeEntries.length}</p>
            <p><strong>Gesamtstunden:</strong> <span class="total">${totalHours.toFixed(2)} h</span></p>
            <p><strong>Erstellt am:</strong> ${new Date().toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Mitarbeiter</th>
                <th>Projekt</th>
                <th>Tätigkeit</th>
                <th>Stunden</th>
                <th>Notizen</th>
              </tr>
            </thead>
            <tbody>
              ${timeEntries.map(entry => `
                <tr>
                  <td>${new Date(entry.datum).toLocaleDateString('de-DE')}</td>
                  <td>${esc(entry.mitarbeiter)}</td>
                  <td>${esc(entry.projektName)}</td>
                  <td>${esc(entry.taetigkeit)}</td>
                  <td><strong>${entry.stunden.toFixed(2)} h</strong></td>
                  <td>${esc(entry.notizen || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>Holzbau Groismaier — Stundenauswertung</p>
          </div>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = () => {
          printWindow.print();
        };

        toast.success('PDF-Export vorbereitet');
      } else {
        toast.error('Pop-up blockiert. Bitte erlauben Sie Pop-ups für diese Seite.');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Fehler beim Exportieren');
    } finally {
      setExporting(false);
    }
  };

  const selectedProjectName = selectedProject === "all"
    ? "Alle Projekte"
    : projects.find((project) => project.id === selectedProject)?.name || "Projekt auswählen";

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        title="Projektberichte & Dateien"
        onBack={() => navigate(-1)}
        rightActions={
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Zur Startmaske"
            title="Zur Startmaske"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-kb-blue-dark bg-gradient-to-b from-white to-[hsl(213_30%_88%)] shadow-md transition-transform hover:brightness-105 active:translate-y-px"
          >
            <Home className="h-5 w-5 text-kb-blue-dark" strokeWidth={2.5} />
          </button>
        }
      />

      <main className="container mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Der Seitentitel steht bereits in der blauen Leiste — hier nur noch
            die Erklärung, sonst stand „Projektberichte & Dateien" doppelt. */}
        <p className="mb-4 text-sm text-muted-foreground">
          <BarChart3 className="mr-1.5 inline h-4 w-4 align-text-bottom" />
          Gebuchte Arbeitszeiten und Dateien nach Projekt.{" "}
          <button
            type="button"
            className="font-semibold text-kb-blue-dark underline"
            onClick={() => navigate("/hours-report")}
          >
            Auswertung nach Mitarbeitern
          </button>
        </p>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-sm font-medium">Projekt auswählen</label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="h-11 w-full justify-between bg-white"
                >
                  <span className="truncate">{selectedProjectName}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Projekt suchen..." />
                  <CommandList>
                    <CommandEmpty>Kein Projekt gefunden.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedProject("all");
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedProject === "all" ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Alle Projekte
                      </CommandItem>
                      {projects.map((project) => (
                        <CommandItem
                          key={project.id}
                          value={project.name}
                          onSelect={() => {
                            setSelectedProject(project.id);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedProject === project.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {project.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <button
            type="button"
            onClick={exportToPDF}
            disabled={exporting || timeEntries.length === 0}
            className="kb-btn min-h-[44px] justify-center"
            title={timeEntries.length === 0 ? "Keine Einträge zum Exportieren" : "Liste als PDF drucken"}
          >
            <Download className="h-4 w-4 text-kb-blue-dark" />
            {exporting ? 'Exportiert...' : 'Als PDF exportieren'}
          </button>
        </div>

        <div className="kb-panel mb-4 flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <span className="text-lg font-bold">
            Gesamtstunden: <span className="text-primary">{totalHours.toFixed(2)} h</span>
          </span>
          <span className="text-sm text-muted-foreground">{timeEntries.length} Einträge</span>
        </div>

        {/* Projektdateien Sektion - nur wenn Projekt ausgewählt */}
        {selectedProject && selectedProject !== "all" && (
          <Card className="kb-panel mb-4">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FolderOpen className="h-5 w-5" />
                  Projektdateien
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="kb-btn min-h-[44px]"
                    onClick={() => setShowFilesManager(true)}
                  >
                    Alle Dateien anzeigen
                  </button>
                  <button
                    type="button"
                    className="kb-btn min-h-[44px]"
                    onClick={() => setShowQuickUpload(true)}
                  >
                    <ImagePlus className="h-4 w-4 text-kb-blue-dark" />
                    Foto hochladen
                  </button>
                </div>
              </div>
            </CardHeader>
            {projectPhotos.length > 0 && (
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {projectPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      className="aspect-square overflow-hidden rounded-lg border transition-opacity hover:opacity-80"
                      onClick={() => navigate(`/projects/${selectedProject}/photos`)}
                    >
                      <img
                        src={getPhotoUrl(selectedProject, photo.name)}
                        alt={photo.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {loading ? (
          <p className="py-12 text-center text-muted-foreground">Lädt...</p>
        ) : timeEntries.length === 0 ? (
          <div className="kb-panel py-12 text-center text-muted-foreground">
            Keine Zeiteinträge gefunden
          </div>
        ) : (
          <ul className="space-y-2">
            {timeEntries.map((entry) => (
              <li key={entry.id} className="kb-panel p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-bold">
                    {new Date(entry.datum + "T12:00:00").toLocaleDateString('de-DE', {
                      weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
                    })}
                  </span>
                  <span className="text-lg font-bold text-primary">{entry.stunden.toFixed(2)} h</span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Mitarbeiter: </span>{entry.mitarbeiter}</p>
                  <p><span className="text-muted-foreground">Projekt: </span>{entry.projektName}</p>
                </div>
                {entry.taetigkeit && (
                  <p className="mt-1 break-words text-sm">
                    <span className="text-muted-foreground">Tätigkeit: </span>{entry.taetigkeit}
                  </p>
                )}
                {entry.notizen && (
                  <p className="mt-0.5 break-words text-sm text-muted-foreground">{entry.notizen}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Quick Upload Dialog */}
      {selectedProject && selectedProject !== "all" && (
        <QuickUploadDialog
          projectId={selectedProject}
          documentType="photos"
          open={showQuickUpload}
          onClose={() => setShowQuickUpload(false)}
          onSuccess={() => fetchProjectPhotos(selectedProject)}
        />
      )}

      {/* Project Files Manager Dialog */}
      {selectedProject && selectedProject !== "all" && (
        <Dialog open={showFilesManager} onOpenChange={setShowFilesManager}>
          <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>Projektdateien verwalten</DialogTitle>
              <DialogDescription>
                Alle Dateien für {projects.find(p => p.id === selectedProject)?.name}
              </DialogDescription>
            </DialogHeader>
            <ProjectFilesManager
              projectId={selectedProject}
              defaultTab="photos"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Reports;
