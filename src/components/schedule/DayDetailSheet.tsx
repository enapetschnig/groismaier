import { useRef } from "react";
import { format, parseISO, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ResourceAdder } from "./ResourceAdder";
import type {
  Project,
  Assignment,
  Profile,
  Resource,
  DailyTarget,
} from "./scheduleTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  datum: string | null;
  profiles: Profile[];
  assignments: Assignment[];
  resources: Resource[];
  dailyTarget: DailyTarget | null;
  onUpdateTarget: (
    projectId: string,
    datum: string,
    field: keyof DailyTarget,
    value: string | number | null
  ) => void;
  onAddResource: (projectId: string, datum: string, name: string) => void;
  onUpdateResource: (
    id: string,
    field: "menge" | "einheit",
    value: number | string | null
  ) => void;
  onDeleteResource: (id: string) => void;
}

export function DayDetailSheet({
  open,
  onOpenChange,
  project,
  datum,
  profiles,
  assignments,
  resources,
  dailyTarget,
  onUpdateTarget,
  onAddResource,
  onUpdateResource,
  onDeleteResource,
}: Props) {
  if (!project || !datum) return null;

  const dateParsed = parseISO(datum);
  const dayAssignments = assignments.filter(
    (a) =>
      a.project_id === project.id && isSameDay(parseISO(a.datum), dateParsed)
  );
  const dayResources = resources.filter(
    (r) => r.project_id === project.id && r.datum === datum
  );

  const assignedProfiles = profiles.filter((p) =>
    dayAssignments.some((a) => a.user_id === p.id)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">{project.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {format(dateParsed, "EEEE, dd. MMMM yyyy", { locale: de })}
          </p>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Assigned workers */}
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Eingeteilte Mitarbeiter ({assignedProfiles.length})
            </h3>
            {assignedProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Mitarbeiter eingeteilt
              </p>
            ) : (
              <div className="space-y-1">
                {assignedProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="text-sm px-2 py-1.5 bg-muted/30 rounded"
                  >
                    {p.vorname} {p.nachname}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tagesziel */}
          <div>
            <label className="text-sm font-semibold mb-1 block">
              Tagesziel
            </label>
            <Textarea
              placeholder="Was soll heute erreicht werden?"
              rows={2}
              value={dailyTarget?.tagesziel || ""}
              onChange={(e) =>
                onUpdateTarget(
                  project.id,
                  datum,
                  "tagesziel",
                  e.target.value || null
                )
              }
            />
          </div>

          {/* Nachkalkulation */}
          <div>
            <label className="text-sm font-semibold mb-1 block">
              Nachkalkulation (Stunden)
            </label>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="0"
              value={dailyTarget?.nachkalkulation_stunden ?? ""}
              onChange={(e) =>
                onUpdateTarget(
                  project.id,
                  datum,
                  "nachkalkulation_stunden",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
            />
          </div>

          {/* Notizen */}
          <div>
            <label className="text-sm font-semibold mb-1 block">Notizen</label>
            <Textarea
              placeholder="Anmerkungen zum Tag..."
              rows={2}
              value={dailyTarget?.notizen || ""}
              onChange={(e) =>
                onUpdateTarget(
                  project.id,
                  datum,
                  "notizen",
                  e.target.value || null
                )
              }
            />
          </div>

          {/* Resources */}
          <div>
            <label className="text-sm font-semibold mb-2 block">
              Ressourcen / Geräte
            </label>
            {dayResources.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {dayResources.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 bg-muted/30 rounded px-2 py-1.5"
                  >
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                      {r.resource_name}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className="w-16 h-8 text-sm"
                      value={r.menge ?? ""}
                      onChange={(e) =>
                        onUpdateResource(
                          r.id,
                          "menge",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                    <Input
                      className="w-20 h-8 text-sm"
                      value={r.einheit || ""}
                      placeholder="Einheit"
                      onChange={(e) =>
                        onUpdateResource(r.id, "einheit", e.target.value)
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => onDeleteResource(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <ResourceAdder
              existingNames={dayResources.map((r) => r.resource_name)}
              onAdd={(name) => onAddResource(project.id, datum, name)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
