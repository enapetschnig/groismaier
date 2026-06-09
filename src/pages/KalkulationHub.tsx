import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Calculator, Plus, FileText, Trash2, User, Clock } from "lucide-react";
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
import { CustomerSelect } from "@/components/CustomerSelect";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface KalkRow {
  id: string;
  name: string;
  summe: number | null;
  updated_at: string;
  customer_id: string | null;
  customers?: { name: string } | null;
}

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from("kalkulationen" as never) as any)
      .select("id, name, summe, updated_at, customer_id, customers(name)")
      .order("updated_at", { ascending: false });
    setRows((data as KalkRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Kalkulation angeben." });
      return;
    }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase.from("kalkulationen" as never) as any)
      .insert({ name: name.trim(), customer_id: customerId, user_id: user?.id, data: null, summe: 0 })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: error?.message || "Kalkulation konnte nicht angelegt werden." });
      return;
    }
    setDialogOpen(false);
    setName(""); setCustomerId(null);
    navigate(`/auftragskalkulation/${(data as any).id}`);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await (supabase.from("kalkulationen" as never) as any).delete().eq("id", deleteId);
    setDeleteId(null);
    toast({ title: "Gelöscht", description: "Kalkulation wurde gelöscht." });
    load();
  };

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

        {loading ? (
          <p className="text-muted-foreground py-12 text-center">Lädt …</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Calculator className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-1">Noch keine Kalkulation</h2>
            <p className="text-muted-foreground mb-5">Lege deine erste Auftragskalkulation an.</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Neue Kalkulation</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => (
              <Card key={r.id} className="flex flex-col hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/auftragskalkulation/${r.id}`)}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
            ))}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Wird angelegt …" : "Anlegen & kalkulieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kalkulation löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Kalkulation wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.</AlertDialogDescription>
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
