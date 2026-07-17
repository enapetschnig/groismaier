import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ReceiptEuro } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FixkostenDialog } from "./FixkostenDialog";
import { Fixkosten, INTERVALL_LABELS, MONATE, eur, monatlicheBelastung } from "./types";

export function FixkostenVerwaltung() {
  const [eintraege, setEintraege] = useState<Fixkosten[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEintrag, setEditEintrag] = useState<Fixkosten | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("fixkosten" as never) as any)
      .select("*")
      .order("name");
    if (error) {
      toast.error("Fehler beim Laden der Fixkosten", { description: error.message });
    } else {
      setEintraege((data ?? []) as Fixkosten[]);
    }
    setLoading(false);
  };

  const monatsSumme = useMemo(
    () => eintraege.filter((e) => e.aktiv).reduce((s, e) => s + monatlicheBelastung(e), 0),
    [eintraege],
  );

  const toggleAktiv = async (eintrag: Fixkosten) => {
    const { error } = await (supabase.from("fixkosten" as never) as any)
      .update({ aktiv: !eintrag.aktiv })
      .eq("id", eintrag.id);
    if (error) {
      toast.error("Fehler", { description: error.message });
    } else {
      loadData();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase.from("fixkosten" as never) as any)
      .delete()
      .eq("id", deleteId);
    if (error) {
      toast.error("Fehler beim Löschen", { description: error.message });
    } else {
      toast.success("Fixkosten gelöscht");
      loadData();
    }
    setDeleteId(null);
  };

  const faelligkeitText = (e: Fixkosten) => {
    const tag = `${e.faellig_tag ?? 1}.`;
    if (e.intervall === "monatlich") return `jeweils am ${tag} des Monats`;
    const monat = MONATE[(e.faellig_monat ?? 1) - 1];
    if (e.intervall === "quartalsweise") return `ab ${monat}, am ${tag} (alle 3 Monate)`;
    return `am ${tag} ${monat}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptEuro className="h-5 w-5" />
              Fixkosten
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Aktive Einträge entsprechen einer durchschnittlichen Belastung von{" "}
              <span className="font-medium text-foreground">{eur(monatsSumme)}</span> pro Monat.
            </p>
          </div>
          <Button onClick={() => { setEditEintrag(null); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Neue Fixkosten</span>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Lade...</p>
          ) : eintraege.length === 0 ? (
            <div className="text-center py-10">
              <ReceiptEuro className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground mb-3">
                Noch keine Fixkosten erfasst (z.B. Miete, Versicherungen, Leasing)
              </p>
              <Button onClick={() => { setEditEintrag(null); setDialogOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" /> Erste Fixkosten anlegen
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Intervall</TableHead>
                    <TableHead className="hidden md:table-cell">Fälligkeit</TableHead>
                    <TableHead>Aktiv</TableHead>
                    <TableHead className="w-[90px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eintraege.map((e) => (
                    <TableRow key={e.id} className={e.aktiv ? "" : "opacity-60"}>
                      <TableCell>
                        <p className="font-medium">{e.name}</p>
                        {e.notiz && (
                          <p className="text-xs text-muted-foreground truncate max-w-[220px]">{e.notiz}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{eur(Number(e.betrag))}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{INTERVALL_LABELS[e.intervall]}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {faelligkeitText(e)}
                      </TableCell>
                      <TableCell>
                        <Switch checked={e.aktiv} onCheckedChange={() => toggleAktiv(e)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => { setEditEintrag(e); setDialogOpen(true); }}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteId(e.id)}
                            title="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <FixkostenDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eintrag={editEintrag}
        onSaved={loadData}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fixkosten löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Eintrag wird dauerhaft entfernt und in der Liquiditätsvorschau nicht mehr berücksichtigt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
