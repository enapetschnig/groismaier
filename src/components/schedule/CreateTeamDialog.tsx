import { useState, useEffect, useMemo } from "react";
import { Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: { id: string; vorname: string; nachname: string }[];
  existingTeamMemberIds: string[];
  onSave: (name: string, memberIds: string[]) => Promise<void>;
  editTeam?: { id: string; name: string } | null;
  editMemberIds?: string[];
  onDelete?: () => Promise<void>;
}

export function CreateTeamDialog({
  open, onOpenChange, profiles, existingTeamMemberIds, onSave,
  editTeam, editMemberIds, onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // „Team löschen" feuerte früher sofort — jetzt erst nach Rückfrage.
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = !!editTeam;

  useEffect(() => {
    if (open) {
      setName(editTeam?.name || "");
      setSelectedIds(new Set(editMemberIds || []));
      setSearch("");
    }
  }, [open, editTeam, editMemberIds]);

  const existingSet = useMemo(() => new Set(existingTeamMemberIds), [existingTeamMemberIds]);

  const filteredProfiles = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return profiles;
    return profiles.filter(p => p.vorname.toLowerCase().includes(q) || p.nachname.toLowerCase().includes(q));
  }, [profiles, search]);

  function toggleMember(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim(), Array.from(selectedIds));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Team bearbeiten" : "Neues Team"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Bautrupp 1" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Mitarbeiter</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..." className="pl-8 h-8 text-sm" />
            </div>
            <ScrollArea className="h-[220px] border rounded-md">
              <div className="p-1">
                {filteredProfiles.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground">Keine Mitarbeiter gefunden</div>
                )}
                {filteredProfiles.map(p => {
                  const alreadyInOtherTeam = existingSet.has(p.id);
                  const checked = selectedIds.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/40 transition-colors ${alreadyInOtherTeam ? "opacity-50" : ""}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleMember(p.id)} disabled={alreadyInOtherTeam} />
                      <span className="text-sm truncate">{p.vorname} {p.nachname}</span>
                      {alreadyInOtherTeam && <span className="text-[10px] text-muted-foreground ml-auto">(in anderem Team)</span>}
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
            {selectedIds.size > 0 && <p className="text-xs text-muted-foreground">{selectedIds.size} ausgewählt</p>}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {isEdit && onDelete ? (
            <Button
              variant="destructive"
              size="sm"
              className="min-h-[44px]"
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {deleting ? "Löscht..." : "Team löschen"}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button size="sm" className="min-h-[44px]" disabled={!name.trim() || saving} onClick={handleSave}>
              {saving ? "Speichern..." : isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </DialogFooter>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Team „{editTeam?.name}" löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Die Mitarbeiter bleiben erhalten und stehen danach wieder einzeln
                in der Plantafel. Ihre Einsätze werden nicht gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[44px]">Abbrechen</AlertDialogCancel>
              <AlertDialogAction className="min-h-[44px]" onClick={handleDelete}>
                Team löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
