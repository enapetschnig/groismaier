import { useState, useEffect } from "react";
import { Package, Plus, Edit, Trash2, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";

type Material = {
  id: string;
  material: string;
  menge: string | null;
  einheit: string | null;
  notizen: string | null;
  created_at: string;
};

type DisturbanceMaterialsProps = {
  disturbanceId: string;
  canEdit: boolean;
};

export const DisturbanceMaterials = ({ disturbanceId, canEdit }: DisturbanceMaterialsProps) => {
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    material: "",
    menge: "",
    einheit: "Stk.",
    notizen: "",
  });

  useEffect(() => {
    fetchMaterials();
  }, [disturbanceId]);

  const fetchMaterials = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("disturbance_materials")
      .select("*")
      .eq("disturbance_id", disturbanceId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Materialien konnten nicht geladen werden",
      });
    } else {
      setMaterials(data || []);
    }
    setLoading(false);
  };

  const openAddForm = () => {
    setEditingMaterial(null);
    setFormData({ material: "", menge: "", einheit: "Stk.", notizen: "" });
    setShowForm(true);
  };

  const openEditForm = (material: Material) => {
    setEditingMaterial(material);
    setFormData({
      material: material.material,
      menge: material.menge || "",
      einheit: material.einheit || "Stk.",
      notizen: material.notizen || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.material.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Material ist erforderlich" });
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSaving(false);
      return;
    }

    const materialData = {
      disturbance_id: disturbanceId,
      user_id: user.id,
      material: formData.material.trim(),
      menge: formData.menge.trim() || null,
      einheit: formData.einheit || "Stk.",
      notizen: formData.notizen.trim() || null,
    };

    if (editingMaterial) {
      const { error } = await supabase
        .from("disturbance_materials")
        .update({
          material: materialData.material,
          menge: materialData.menge,
          einheit: materialData.einheit,
          notizen: materialData.notizen,
        })
        .eq("id", editingMaterial.id);

      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Material konnte nicht aktualisiert werden" });
      } else {
        toast({ title: "Erfolg", description: "Material wurde aktualisiert" });
        setShowForm(false);
        fetchMaterials();
      }
    } else {
      const { error } = await supabase
        .from("disturbance_materials")
        .insert(materialData);

      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Material konnte nicht hinzugefügt werden" });
      } else {
        toast({ title: "Erfolg", description: "Material wurde hinzugefügt" });
        setShowForm(false);
        fetchMaterials();
      }
    }

    setSaving(false);
  };

  const handleDelete = async (materialId: string) => {
    setDeleting(materialId);

    const { error } = await supabase
      .from("disturbance_materials")
      .delete()
      .eq("id", materialId);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Material konnte nicht gelöscht werden" });
    } else {
      toast({ title: "Erfolg", description: "Material wurde gelöscht" });
      fetchMaterials();
    }

    setDeleting(null);
  };

  return (
    <>
      <Card className="kb-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5" />
            Material
          </CardTitle>
          {canEdit && (
            <Button size="sm" className="h-11 shrink-0" onClick={openAddForm}>
              <Plus className="h-4 w-4 mr-1" />
              Material
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Keine Materialien erfasst</p>
              {canEdit && (
                <Button variant="outline" size="sm" className="mt-2" onClick={openAddForm}>
                  <Plus className="h-4 w-4 mr-1" />
                  Erstes Material hinzufügen
                </Button>
              )}
            </div>
          ) : (
            /* Karten — am Handy lesbar, keine Mini-Tabelle */
            <div className="space-y-2">
              {materials.map((material) => (
                <div
                  key={material.id}
                  className="flex items-start gap-3 rounded-lg border p-3 bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{material.material}</p>
                    <p className="text-sm text-muted-foreground">
                      {material.menge ? `${material.menge} ${material.einheit || ""}`.trim() : "Menge nicht erfasst"}
                    </p>
                    {material.notizen && (
                      <p className="text-sm text-muted-foreground break-words mt-1">{material.notizen}</p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Material bearbeiten"
                        className="h-11 w-11"
                        onClick={() => openEditForm(material)}
                      >
                        <Edit className="h-5 w-5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Material löschen"
                            className="h-11 w-11"
                            disabled={deleting === material.id}
                          >
                            <Trash2 className="h-5 w-5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Material löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Möchten Sie "{material.material}" wirklich löschen?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(material.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Material Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? "Material bearbeiten" : "Material hinzufügen"}
            </DialogTitle>
            <DialogDescription>
              Erfassen Sie das verwendete Material für diesen Einsatz.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="material">Material *</Label>
              <Input
                id="material"
                value={formData.material}
                onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                placeholder="z.B. Sicherungsautomat 16A"
                required
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <Label htmlFor="menge">Menge</Label>
                <Input
                  id="menge"
                  className="h-11"
                  inputMode="decimal"
                  value={formData.menge}
                  onChange={(e) => setFormData({ ...formData, menge: e.target.value })}
                  placeholder="z.B. 2"
                />
              </div>
              <div className="w-28 shrink-0">
                <Label htmlFor="einheit">Einheit</Label>
                <Select value={formData.einheit} onValueChange={(v) => setFormData({ ...formData, einheit: v })}>
                  <SelectTrigger id="einheit" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {einheiten.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="notizen">Notizen</Label>
              <Textarea
                id="notizen"
                value={formData.notizen}
                onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                placeholder="Zusätzliche Bemerkungen..."
                rows={2}
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end pt-2">
              <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => setShowForm(false)}>
                Abbrechen
              </Button>
              <Button type="submit" className="h-12 sm:h-10 text-base sm:text-sm" disabled={saving}>
                {saving ? "Speichern…" : editingMaterial ? "Aktualisieren" : "Hinzufügen"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
