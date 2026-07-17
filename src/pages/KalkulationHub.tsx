import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calculator, Plus, FileText, Trash2, User, Clock, MoreVertical,
  Copy, LayoutTemplate, Pencil, FilePlus2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerSelect } from "@/components/CustomerSelect";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Hinweis: Die Tabelle `kalkulationen` (inkl. Spalte `ist_vorlage`, siehe
// Migration 20260716090200_kalkulation_vorlagen.sql) fehlt in den generierten
// Supabase-Typen (src/integrations/supabase/types.ts). Deshalb wird hier wie
// bisher mit `from("kalkulationen" as never) as any` gecastet und lokal getippt.
interface KalkRow {
  id: string;
  name: string;
  summe: number | null;
  updated_at: string;
  customer_id: string | null;
  ist_vorlage: boolean;
  customers?: { name: string } | null;
}

const NO_TEMPLATE = "__none__";

const kalkTable = () => (supabase.from("kalkulationen" as never) as any);

const fmtEuro = (n: number) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(n || 0);

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return ""; }
};

export default function KalkulationHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<KalkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"kalkulationen" | "vorlagen">("kalkulationen");

  // Neu-anlegen-Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [creating, setCreating] = useState(false);

  // Löschen
  const [deleteRow, setDeleteRow] = useState<KalkRow | null>(null);

  // Als Vorlage speichern
  const [vorlageSource, setVorlageSource] = useState<KalkRow | null>(null);
  const [vorlageName, setVorlageName] = useState("");
  const [savingVorlage, setSavingVorlage] = useState(false);

  // Neue Kalkulation aus Vorlage
  const [fromVorlage, setFromVorlage] = useState<KalkRow | null>(null);
  const [fromVorlageName, setFromVorlageName] = useState("");
  const [fromVorlageCustomerId, setFromVorlageCustomerId] = useState<string | null>(null);
  const [creatingFromVorlage, setCreatingFromVorlage] = useState(false);

  // Umbenennen (Vorlage)
  const [renameRow, setRenameRow] = useState<KalkRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await kalkTable()
      .select("id, name, summe, updated_at, customer_id, ist_vorlage, customers(name)")
      .order("updated_at", { ascending: false });
    if (error) {
      // Fallback, solange die Migration (ist_vorlage) noch nicht eingespielt ist.
      const { data: fallback } = await kalkTable()
        .select("id, name, summe, updated_at, customer_id, customers(name)")
        .order("updated_at", { ascending: false });
      setRows(((fallback as KalkRow[]) || []).map((r) => ({ ...r, ist_vorlage: false })));
    } else {
      setRows((data as KalkRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const kalkulationen = useMemo(() => rows.filter((r) => !r.ist_vorlage), [rows]);
  const vorlagen = useMemo(() => rows.filter((r) => r.ist_vorlage), [rows]);

  /** Vollständige Zeile (inkl. data-Blob) für Kopier-Aktionen laden. */
  const fetchFull = async (id: string): Promise<any | null> => {
    const { data, error } = await kalkTable()
      .select("id, name, customer_id, project_id, data, summe")
      .eq("id", id)
      .single();
    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: error?.message || "Kalkulation konnte nicht geladen werden." });
      return null;
    }
    return data;
  };

  const insertCopy = async (values: Record<string, unknown>): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await kalkTable()
      .insert({ user_id: user?.id, ...values })
      .select("id")
      .single();
    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: error?.message || "Speichern fehlgeschlagen." });
      return null;
    }
    return (data as any).id as string;
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Kalkulation angeben." });
      return;
    }
    setCreating(true);
    let data: unknown = null;
    let summe = 0;
    if (templateId !== NO_TEMPLATE) {
      const tpl = await fetchFull(templateId);
      if (!tpl) { setCreating(false); return; }
      data = tpl.data;
      summe = Number(tpl.summe) || 0;
    }
    // ist_vorlage wird nicht mitgeschickt: DB-Default false (funktioniert so
    // auch, bevor die Migration 20260716090200 eingespielt ist).
    const id = await insertCopy({
      name: name.trim(), customer_id: customerId, data, summe,
    });
    setCreating(false);
    if (!id) return;
    setDialogOpen(false);
    setName(""); setCustomerId(null); setTemplateId(NO_TEMPLATE);
    navigate(`/auftragskalkulation/${id}`);
  };

  const handleDuplicate = async (row: KalkRow) => {
    const src = await fetchFull(row.id);
    if (!src) return;
    const id = await insertCopy({
      name: `${src.name} (Kopie)`,
      customer_id: src.customer_id,
      project_id: src.project_id,
      data: src.data,
      summe: src.summe,
    });
    if (!id) return;
    toast({ title: "Dupliziert", description: `„${src.name} (Kopie)“ wurde angelegt.` });
    load();
  };

  const handleSaveAsVorlage = async () => {
    if (!vorlageSource) return;
    if (!vorlageName.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Vorlage angeben." });
      return;
    }
    setSavingVorlage(true);
    const src = await fetchFull(vorlageSource.id);
    if (!src) { setSavingVorlage(false); return; }
    const id = await insertCopy({
      name: vorlageName.trim(),
      customer_id: null,
      project_id: null,
      data: src.data,
      summe: src.summe,
      ist_vorlage: true,
    });
    setSavingVorlage(false);
    if (!id) return;
    setVorlageSource(null);
    toast({ title: "Vorlage gespeichert", description: `Vorlage „${vorlageName.trim()}“ wurde angelegt.` });
    setTab("vorlagen");
    load();
  };

  const handleCreateFromVorlage = async () => {
    if (!fromVorlage) return;
    if (!fromVorlageName.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Kalkulation angeben." });
      return;
    }
    setCreatingFromVorlage(true);
    const src = await fetchFull(fromVorlage.id);
    if (!src) { setCreatingFromVorlage(false); return; }
    const id = await insertCopy({
      name: fromVorlageName.trim(),
      customer_id: fromVorlageCustomerId,
      data: src.data,
      summe: src.summe,
      ist_vorlage: false,
    }); // explizit false, da die Quelle eine Vorlage ist
    setCreatingFromVorlage(false);
    if (!id) return;
    setFromVorlage(null);
    navigate(`/auftragskalkulation/${id}`);
  };

  const handleRename = async () => {
    if (!renameRow) return;
    if (!renameName.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen angeben." });
      return;
    }
    setRenaming(true);
    const { error } = await kalkTable().update({ name: renameName.trim() }).eq("id", renameRow.id);
    setRenaming(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    setRenameRow(null);
    toast({ title: "Umbenannt", description: "Der Name wurde aktualisiert." });
    load();
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    await kalkTable().delete().eq("id", deleteRow.id);
    const wasVorlage = deleteRow.ist_vorlage;
    setDeleteRow(null);
    toast({ title: "Gelöscht", description: wasVorlage ? "Vorlage wurde gelöscht." : "Kalkulation wurde gelöscht." });
    load();
  };

  const renderCard = (r: KalkRow) => (
    <Card
      key={r.id}
      className="flex flex-col hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => navigate(`/auftragskalkulation/${r.id}`)}
    >
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {r.ist_vorlage
              ? <LayoutTemplate className="h-5 w-5 text-primary" />
              : <FileText className="h-5 w-5 text-primary" />}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
                title="Aktionen"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {r.ist_vorlage ? (
                <>
                  <DropdownMenuItem onClick={() => {
                    setFromVorlage(r);
                    setFromVorlageName(r.name);
                    setFromVorlageCustomerId(null);
                  }}>
                    <FilePlus2 className="h-4 w-4 mr-2" /> Neue Kalkulation aus Vorlage
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setRenameRow(r); setRenameName(r.name); }}>
                    <Pencil className="h-4 w-4 mr-2" /> Umbenennen
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => handleDuplicate(r)}>
                    <Copy className="h-4 w-4 mr-2" /> Duplizieren
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setVorlageSource(r); setVorlageName(r.name); }}>
                    <LayoutTemplate className="h-4 w-4 mr-2" /> Als Vorlage speichern
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteRow(r)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardTitle className="text-base leading-snug">{r.name}</CardTitle>
        <CardDescription className="text-xs space-y-1">
          {r.customers?.name && (
            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {r.customers.name}</span>
          )}
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDate(r.updated_at)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <div className="text-lg font-bold text-primary">{fmtEuro(Number(r.summe) || 0)}</div>
      </CardContent>
    </Card>
  );

  const list = tab === "vorlagen" ? vorlagen : kalkulationen;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Auftragskalkulation" />

      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-5xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <p className="text-muted-foreground flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary shrink-0" />
            Kalkulationen anlegen, berechnen und als Angebot übernehmen.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Neue Kalkulation</span>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "kalkulationen" | "vorlagen")} className="mb-6">
          <TabsList>
            <TabsTrigger value="kalkulationen">
              Kalkulationen {kalkulationen.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({kalkulationen.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="vorlagen">
              Vorlagen {vorlagen.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({vorlagen.length})</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="text-muted-foreground py-12 text-center">Lädt …</p>
        ) : list.length === 0 ? (
          tab === "vorlagen" ? (
            <div className="text-center py-16">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <LayoutTemplate className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-1">Noch keine Vorlage</h2>
              <p className="text-muted-foreground">
                Speichere eine bestehende Kalkulation über „Als Vorlage speichern“ als Vorlage.
              </p>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Calculator className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-1">Noch keine Kalkulation</h2>
              <p className="text-muted-foreground mb-5">Lege deine erste Auftragskalkulation an.</p>
              <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Neue Kalkulation</Button>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map(renderCard)}
          </div>
        )}
      </div>

      {/* Neue Kalkulation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Kalkulation</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="kalk-name">Bezeichnung *</Label>
              <Input
                id="kalk-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                placeholder="z.B. BV Mustermann – Einfamilienhaus"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kunde (optional)</Label>
              <CustomerSelect value={customerId} onChange={(id) => setCustomerId(id)} />
            </div>
            {vorlagen.length > 0 && (
              <div className="space-y-1.5">
                <Label>Aus Vorlage (optional)</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Leere Kalkulation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>Leere Kalkulation</SelectItem>
                    {vorlagen.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Wird angelegt …" : "Anlegen & kalkulieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Als Vorlage speichern Dialog */}
      <Dialog open={!!vorlageSource} onOpenChange={(o) => !o && setVorlageSource(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Als Vorlage speichern</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Es wird eine Kopie von „{vorlageSource?.name}“ als Vorlage gespeichert. Kunde und Projekt werden dabei nicht übernommen.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="vorlage-name">Vorlagenname *</Label>
              <Input
                id="vorlage-name" autoFocus value={vorlageName} onChange={(e) => setVorlageName(e.target.value)}
                placeholder="z.B. Vorlage Carport"
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveAsVorlage(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVorlageSource(null)}>Abbrechen</Button>
            <Button onClick={handleSaveAsVorlage} disabled={savingVorlage}>
              {savingVorlage ? "Wird gespeichert …" : "Vorlage speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Neue Kalkulation aus Vorlage Dialog */}
      <Dialog open={!!fromVorlage} onOpenChange={(o) => !o && setFromVorlage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Kalkulation aus Vorlage</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Vorlage: „{fromVorlage?.name}“
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="from-vorlage-name">Bezeichnung *</Label>
              <Input
                id="from-vorlage-name" autoFocus value={fromVorlageName}
                onChange={(e) => setFromVorlageName(e.target.value)}
                placeholder="z.B. BV Mustermann – Einfamilienhaus"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFromVorlage(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kunde (optional)</Label>
              <CustomerSelect value={fromVorlageCustomerId} onChange={(id) => setFromVorlageCustomerId(id)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFromVorlage(null)}>Abbrechen</Button>
            <Button onClick={handleCreateFromVorlage} disabled={creatingFromVorlage}>
              {creatingFromVorlage ? "Wird angelegt …" : "Anlegen & kalkulieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Umbenennen Dialog */}
      <Dialog open={!!renameRow} onOpenChange={(o) => !o && setRenameRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vorlage umbenennen</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="rename-name">Name *</Label>
            <Input
              id="rename-name" autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameRow(null)}>Abbrechen</Button>
            <Button onClick={handleRename} disabled={renaming}>
              {renaming ? "Wird gespeichert …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Löschen Bestätigung */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteRow?.ist_vorlage ? "Vorlage löschen?" : "Kalkulation löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow?.ist_vorlage
                ? "Diese Vorlage wird dauerhaft gelöscht. Bereits daraus erstellte Kalkulationen bleiben erhalten."
                : "Diese Kalkulation wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
