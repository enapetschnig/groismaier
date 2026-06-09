import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Trash2, Save, Package, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OfferPackage {
  id: string;
  name: string;
  beschreibung: string | null;
  items: PackageItem[];
}

interface PackageItem {
  id?: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  default_menge: number;
  sort_order: number;
  template_id: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  kategorie: string;
}

export default function OfferPackages() {
  const [packages, setPackages] = useState<OfferPackage[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", beschreibung: "" });
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [{ data: pkgs }, { data: tmpls }] = await Promise.all([
      supabase.from("offer_packages").select("*").order("name"),
      supabase.from("invoice_templates").select("*").order("kategorie, name").limit(5000),
    ]);

    if (tmpls) setTemplates(tmpls.map((t: any) => ({ ...t, einzelpreis: Number(t.einzelpreis) })));

    if (pkgs) {
      // Load items for each package
      const packageIds = pkgs.map((p: any) => p.id);
      // Bei leerer Paketliste KEINE Abfrage — "__none__" wäre keine gültige
      // UUID und würde einen 400er auslösen.
      let allItems: any[] = [];
      if (packageIds.length > 0) {
        const { data } = await supabase
          .from("offer_package_items")
          .select("*")
          .in("package_id", packageIds)
          .order("sort_order");
        allItems = data || [];
      }

      const packagesWithItems = pkgs.map((p: any) => ({
        ...p,
        items: (allItems || [])
          .filter((i: any) => i.package_id === p.id)
          .map((i: any) => ({
            id: i.id,
            beschreibung: i.beschreibung,
            einheit: i.einheit || "Stk.",
            einzelpreis: Number(i.einzelpreis) || 0,
            default_menge: Number(i.default_menge) || 1,
            sort_order: i.sort_order || 0,
            template_id: i.template_id,
          })),
      }));
      setPackages(packagesWithItems);
    }
    setLoading(false);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", beschreibung: "" });
    setPackageItems([]);
    setDialogOpen(true);
  };

  const openEdit = (pkg: OfferPackage) => {
    setEditId(pkg.id);
    setForm({ name: pkg.name, beschreibung: pkg.beschreibung || "" });
    setPackageItems([...pkg.items]);
    setDialogOpen(true);
  };

  const addTemplateItem = (t: TemplateOption) => {
    setPackageItems(prev => [...prev, {
      beschreibung: t.beschreibung,
      einheit: t.einheit,
      einzelpreis: t.einzelpreis,
      default_menge: 1,
      sort_order: prev.length,
      template_id: t.id,
    }]);
  };

  const addCustomItem = () => {
    setPackageItems(prev => [...prev, {
      beschreibung: "",
      einheit: "m²",
      einzelpreis: 0,
      default_menge: 1,
      sort_order: prev.length,
      template_id: null,
    }]);
  };

  const updatePackageItem = (index: number, field: keyof PackageItem, value: any) => {
    setPackageItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removePackageItem = (index: number) => {
    setPackageItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Name ist erforderlich" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      let packageId = editId;

      if (editId) {
        const { error } = await supabase.from("offer_packages").update({
          name: form.name,
          beschreibung: form.beschreibung || null,
        }).eq("id", editId);
        if (error) throw error;

        // Delete old items and re-insert
        await supabase.from("offer_package_items").delete().eq("package_id", editId);
      } else {
        const { data, error } = await supabase.from("offer_packages").insert({
          user_id: user.id,
          name: form.name,
          beschreibung: form.beschreibung || null,
        }).select("id").single();
        if (error) throw error;
        packageId = data.id;
      }

      // Insert items
      if (packageItems.length > 0) {
        const itemsToInsert = packageItems.map((item, idx) => ({
          package_id: packageId!,
          template_id: item.template_id || null,
          beschreibung: item.beschreibung,
          einheit: item.einheit,
          einzelpreis: item.einzelpreis,
          default_menge: item.default_menge,
          sort_order: idx,
        }));
        const { error } = await supabase.from("offer_package_items").insert(itemsToInsert);
        if (error) throw error;
      }

      toast({ title: editId ? "Gespeichert" : "Erstellt" });
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("offer_package_items").delete().eq("package_id", id);
    const { error } = await supabase.from("offer_packages").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gelöscht" });
      fetchAll();
    }
  };

  const templatesByKategorie = templates.reduce<Record<string, TemplateOption[]>>((acc, t) => {
    (acc[t.kategorie] = acc[t.kategorie] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <PageHeader title="Angebotspakete" backPath="/invoices" />

        <div className="flex justify-end mb-4">
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Neues Paket
          </Button>
        </div>

        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt...</p>
        ) : packages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">Noch keine Angebotspakete erstellt</p>
              <p className="text-sm mb-4">Erstelle Pakete wie "Bad komplett" oder "Küche" mit vordefinierten Positionen und Standardmengen.</p>
              <Button onClick={openNew}>Erstes Paket erstellen</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {packages.map(pkg => (
              <Card key={pkg.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openEdit(pkg)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{pkg.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{pkg.items.length} Positionen</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => { e.stopPropagation(); handleDelete(pkg.id); }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {pkg.beschreibung && (
                    <p className="text-sm text-muted-foreground">{pkg.beschreibung}</p>
                  )}
                </CardHeader>
                {pkg.items.length > 0 && (
                  <CardContent>
                    <div className="space-y-1">
                      {pkg.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{item.beschreibung}</span>
                          <span>{item.default_menge} {item.einheit} × € {item.einzelpreis.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Paket bearbeiten" : "Neues Angebotspaket"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="z.B. Bad komplett"
                  />
                </div>
                <div>
                  <Label>Beschreibung</Label>
                  <Input
                    value={form.beschreibung}
                    onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                    placeholder="z.B. Komplettpaket Badezimmer"
                  />
                </div>
              </div>

              {/* Add from templates */}
              <div>
                <Label className="mb-2 block">Positionen aus Vorlagen hinzufügen</Label>
                <Select onValueChange={val => {
                  const t = templates.find(t => t.id === val);
                  if (t) addTemplateItem(t);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vorlage auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(templatesByKategorie).map(([kat, items]) => (
                      items.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          [{kat}] {t.name} – € {t.einzelpreis.toFixed(2)}/{t.einheit}
                        </SelectItem>
                      ))
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={addCustomItem}>
                  <Plus className="w-3 h-3" /> Freie Position
                </Button>
              </div>

              {/* Package items list */}
              {packageItems.length > 0 && (
                <div className="space-y-2">
                  <Label>Positionen im Paket</Label>
                  {packageItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border">
                      <div className="flex-1 space-y-1">
                        <Input
                          value={item.beschreibung}
                          onChange={e => updatePackageItem(idx, "beschreibung", e.target.value)}
                          placeholder="Beschreibung"
                          className="h-8"
                        />
                        <div className="flex gap-2">
                          <Input
                            value={item.einheit}
                            onChange={e => updatePackageItem(idx, "einheit", e.target.value)}
                            className="w-20 h-7 text-xs"
                            placeholder="Einheit"
                          />
                          <Input
                            type="number"
                            value={item.einzelpreis}
                            onChange={e => updatePackageItem(idx, "einzelpreis", Number(e.target.value))}
                            className="w-28 h-7 text-xs"
                            placeholder="Preis"
                            min={0}
                            step={0.01}
                          />
                          <Input
                            type="number"
                            value={item.default_menge}
                            onChange={e => updatePackageItem(idx, "default_menge", Number(e.target.value))}
                            className="w-24 h-7 text-xs"
                            placeholder="Std.Menge"
                            min={0}
                            step={0.5}
                          />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removePackageItem(idx)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="w-4 h-4" />
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
