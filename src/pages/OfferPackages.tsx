import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { QuickOfferDialog } from "@/components/QuickOfferDialog";
import { parseDecimal, formatForInput } from "@/lib/num";
import { Plus, Trash2, Check, Package, Home, Pencil, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/** Gespeicherte Position (Zahlen) — für die Anzeige der Paketliste. */
interface PackageItem {
  id?: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  default_menge: number;
  sort_order: number;
  template_id: string | null;
}

/**
 * Position im Bearbeiten-Dialog. Preis/Menge werden als ROHTEXT gehalten, damit
 * „12,50" beim Tippen erhalten bleibt und erst beim Speichern über parseDecimal
 * in eine Zahl wandert. Mit <Input type="number"> + Number() wurde aus 12,50
 * lautlos 1250 (Faktor 100!).
 */
interface ItemDraft {
  beschreibung: string;
  einheit: string;
  einzelpreis: string;
  default_menge: string;
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

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OfferPackages() {
  const [packages, setPackages] = useState<OfferPackage[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", beschreibung: "" });
  const [packageItems, setPackageItems] = useState<ItemDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OfferPackage | null>(null);
  const [quickOfferOpen, setQuickOfferOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const zurueck = useZurueck("/invoices");

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
    setPackageItems(
      pkg.items.map(i => ({
        beschreibung: i.beschreibung,
        einheit: i.einheit,
        einzelpreis: formatForInput(i.einzelpreis, 2),
        default_menge: formatForInput(i.default_menge),
        template_id: i.template_id,
      }))
    );
    setDialogOpen(true);
  };

  const addTemplateItem = (t: TemplateOption) => {
    setPackageItems(prev => [...prev, {
      beschreibung: t.beschreibung || t.name,
      einheit: t.einheit,
      einzelpreis: formatForInput(t.einzelpreis, 2),
      default_menge: "1",
      template_id: t.id,
    }]);
  };

  const addCustomItem = () => {
    setPackageItems(prev => [...prev, {
      beschreibung: "",
      einheit: "m²",
      einzelpreis: "0,00",
      default_menge: "1",
      template_id: null,
    }]);
  };

  const updatePackageItem = (index: number, field: keyof ItemDraft, value: string) => {
    setPackageItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removePackageItem = (index: number) => {
    setPackageItems(prev => prev.filter((_, i) => i !== index));
  };

  // Live-Summe im Dialog: was kostet das Paket in Standardmenge?
  const draftSumme = packageItems.reduce(
    (s, i) => s + (parseDecimal(i.einzelpreis) ?? 0) * (parseDecimal(i.default_menge) ?? 0),
    0
  );

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Name ist erforderlich" });
      return;
    }
    if (packageItems.some(i => !i.beschreibung.trim())) {
      toast({ variant: "destructive", title: "Fehler", description: "Jede Position braucht eine Beschreibung" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
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
          einheit: item.einheit || "Stk.",
          einzelpreis: parseDecimal(item.einzelpreis) ?? 0,
          default_menge: parseDecimal(item.default_menge) ?? 0,
          sort_order: idx,
        }));
        const { error } = await supabase.from("offer_package_items").insert(itemsToInsert);
        if (error) throw error;
      }

      toast({ title: editId ? "Gespeichert" : "Erstellt", description: form.name });
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (pkg: OfferPackage) => {
    await supabase.from("offer_package_items").delete().eq("package_id", pkg.id);
    const { error } = await supabase.from("offer_packages").delete().eq("id", pkg.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gelöscht", description: pkg.name });
      fetchAll();
    }
  };

  const templatesByKategorie = templates.reduce<Record<string, TemplateOption[]>>((acc, t) => {
    (acc[t.kategorie || "Sonstige"] = acc[t.kategorie || "Sonstige"] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="kb-page min-h-screen">
      {/*
        Die Toolbar gehört GANZ nach oben und über die volle Breite. Vorher lag
        sie im zentrierten max-w-4xl-Container und schwebte als blauer Kasten
        mitten auf der Seite, der „Neues Paket"-Button hing darunter heraus.
      */}
      <KBToolbar
        title="Angebotspakete"
        onBack={zurueck}
        backLabel="Zurück zu Dokumenten"
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
      >
        <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Neues Paket" onClick={openNew} />
        {/*
          Zweiter Toolbar-Button erst ab md: am Handy bleibt neben Titel und
          „Neues Paket" kein Platz — der Button ragte sonst 41px über den
          Bildschirmrand hinaus. Darunter steht dafür die volle Handy-Variante.
        */}
        <KBToolbarButton
          className="hidden md:inline-flex"
          icon={Zap}
          label="Angebot aus Paket"
          variant="blue"
          onClick={() => setQuickOfferOpen(true)}
          disabled={packages.length === 0}
          title={packages.length === 0 ? "Zuerst ein Paket anlegen" : "Schnellangebot aus einem Paket erstellen"}
        />
      </KBToolbar>

      <div className="container mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        {packages.length > 0 && (
          <button
            type="button"
            className="kb-btn mb-3 min-h-[44px] w-full justify-center md:hidden"
            onClick={() => setQuickOfferOpen(true)}
          >
            <Zap className="h-4 w-4 text-kb-blue-dark" /> Angebot aus Paket erstellen
          </button>
        )}
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Lädt...</p>
        ) : packages.length === 0 ? (
          <div className="kb-panel px-4 py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="mb-2">Noch keine Angebotspakete erstellt</p>
            <p className="mb-4 text-sm">
              Pakete wie „Dachstuhl komplett" oder „Carport" bündeln Positionen mit Standardmengen —
              daraus wird per Klick ein Angebot.
            </p>
            <button type="button" className="kb-btn mx-auto min-h-[44px]" onClick={openNew}>
              <Plus className="h-4 w-4 text-kb-green" /> Erstes Paket erstellen
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {packages.map(pkg => {
              const summe = pkg.items.reduce((s, i) => s + i.einzelpreis * i.default_menge, 0);
              return (
                <li key={pkg.id} className="kb-panel p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-h-[44px] min-w-0 flex-1 text-left"
                      onClick={() => openEdit(pkg)}
                    >
                      <p className="break-words font-bold">{pkg.name}</p>
                      {pkg.beschreibung && (
                        <p className="break-words text-sm text-muted-foreground">{pkg.beschreibung}</p>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{pkg.items.length} Positionen</Badge>
                      <button
                        type="button"
                        className="kb-btn h-11 w-11 justify-center"
                        aria-label={`${pkg.name} bearbeiten`}
                        title={`${pkg.name} bearbeiten`}
                        onClick={() => openEdit(pkg)}
                      >
                        <Pencil className="h-4 w-4 text-kb-blue-dark" />
                      </button>
                      <button
                        type="button"
                        className="kb-btn h-11 w-11 justify-center"
                        aria-label={`${pkg.name} löschen`}
                        title={`${pkg.name} löschen`}
                        onClick={() => setDeleteTarget(pkg)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>

                  {pkg.items.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border pt-2">
                      {pkg.items.map((item, idx) => (
                        <div key={idx} className="flex flex-wrap justify-between gap-x-3 text-sm">
                          <span className="min-w-0 break-words text-muted-foreground">{item.beschreibung}</span>
                          <span className="whitespace-nowrap">
                            {formatForInput(item.default_menge)} {item.einheit} × € {eur(item.einzelpreis)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-border pt-1 text-sm font-bold">
                        <span>Paketsumme (netto)</span>
                        <span>€ {eur(summe)}</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Anlegen/Bearbeiten im KingBill-Editor-Look ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{editId ? "Paket bearbeiten" : "Neues Angebotspaket"}</DialogTitle>
          </DialogHeader>
          <KBToolbar
            sticky={false}
            className="rounded-t-md pr-12"
            onBack={() => setDialogOpen(false)}
            backLabel="Schließen ohne Speichern"
            title={editId ? "Paket bearbeiten" : "Neues Angebotspaket"}
            rightActions={
              <KBToolbarButton
                icon={Check}
                label={saving ? "Speichert…" : "Speichern & Schließen"}
                variant="green"
                onClick={handleSave}
                disabled={saving}
              />
            }
          />

          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pkg-name">Name *</Label>
                <Input
                  id="pkg-name"
                  className="h-11"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. Dachstuhl komplett"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pkg-desc">Beschreibung</Label>
                <Input
                  id="pkg-desc"
                  className="h-11"
                  value={form.beschreibung}
                  onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                  placeholder="z.B. Satteldach bis 120 m²"
                />
              </div>
            </div>

            {/* Add from templates */}
            <div className="space-y-2">
              <Label>Positionen aus der Artikelliste hinzufügen</Label>
              <Select
                value=""
                onValueChange={val => {
                  const t = templates.find(t => t.id === val);
                  if (t) addTemplateItem(t);
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={templates.length ? "Artikel auswählen…" : "Keine Artikel vorhanden"} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(templatesByKategorie).map(([kat, items]) => (
                    items.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        [{kat}] {t.name} – € {eur(t.einzelpreis)}/{t.einheit}
                      </SelectItem>
                    ))
                  ))}
                </SelectContent>
              </Select>
              <button type="button" className="kb-btn min-h-[44px]" onClick={addCustomItem}>
                <Plus className="h-4 w-4 text-kb-green" /> Freie Position
              </button>
            </div>

            {/* Package items list */}
            {packageItems.length > 0 && (
              <div className="space-y-2">
                <Label>Positionen im Paket</Label>
                {packageItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg border p-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={item.beschreibung}
                        onChange={e => updatePackageItem(idx, "beschreibung", e.target.value)}
                        placeholder="Beschreibung"
                        aria-label={`Beschreibung Position ${idx + 1}`}
                        className="h-10"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[11px] text-muted-foreground">Einheit</span>
                          <Input
                            value={item.einheit}
                            onChange={e => updatePackageItem(idx, "einheit", e.target.value)}
                            className="h-10"
                            aria-label={`Einheit Position ${idx + 1}`}
                            placeholder="m²"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground">Preis €</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={item.einzelpreis}
                            onChange={e => updatePackageItem(idx, "einzelpreis", e.target.value)}
                            className="h-10"
                            aria-label={`Einzelpreis Position ${idx + 1}`}
                            placeholder="0,00"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground">Std.-Menge</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={item.default_menge}
                            onChange={e => updatePackageItem(idx, "default_menge", e.target.value)}
                            className="h-10"
                            aria-label={`Standardmenge Position ${idx + 1}`}
                            placeholder="1"
                          />
                        </div>
                      </div>
                      <p className="text-right text-xs text-muted-foreground">
                        Zeilensumme: € {eur((parseDecimal(item.einzelpreis) ?? 0) * (parseDecimal(item.default_menge) ?? 0))}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="kb-btn h-11 w-11 shrink-0 justify-center"
                      aria-label={`Position ${idx + 1} entfernen`}
                      onClick={() => removePackageItem(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2 text-sm font-bold">
                  <span>Paketsumme (netto)</span>
                  <span>€ {eur(draftSumme)}</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Löschen-Bestätigung — vorher wurde ohne Nachfrage gelöscht. */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Paket löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `„${deleteTarget.name}" wird mit allen Positionen dauerhaft gelöscht.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        Schnellangebot: bisher war der Dialog im Code vorhanden, aber von keiner
        Maske aus erreichbar — Angebotspakete hatten damit gar keinen Abnehmer.
        Hier ist die naheliegende Stelle: Paket auswählen → Mengen anpassen →
        Angebot anlegen.
      */}
      <QuickOfferDialog open={quickOfferOpen} onOpenChange={setQuickOfferOpen} />
    </div>
  );
}
