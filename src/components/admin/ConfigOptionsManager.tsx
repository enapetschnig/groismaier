import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  kategorie: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  showFarbe?: boolean;
}

interface ConfigOption {
  id?: string;
  kategorie: string;
  wert: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  farbe: string | null;
  _isNew?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function ConfigOptionsManager({ kategorie, title, description, icon, showFarbe = false }: Props) {
  const [options, setOptions] = useState<ConfigOption[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadOptions();
  }, [kategorie]);

  async function loadOptions() {
    const { data, error } = await supabase
      .from("admin_config_options" as never)
      .select("id, kategorie, wert, label, sort_order, is_active, farbe")
      .eq("kategorie", kategorie)
      .order("sort_order");

    if (error) {
      toast({ title: "Fehler beim Laden der Optionen", variant: "destructive" });
      return;
    }

    if (data) {
      setOptions(
        (data as unknown as ConfigOption[]).map((row) => ({
          id: row.id,
          kategorie: row.kategorie,
          wert: row.wert,
          label: row.label,
          sort_order: row.sort_order ?? 0,
          is_active: row.is_active ?? true,
          farbe: row.farbe ?? null,
          _isNew: false,
        }))
      );
    }
    setDeletedIds([]);
  }

  function updateOption(index: number, field: keyof ConfigOption, value: unknown) {
    setOptions((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };

      // Auto-generate wert from label for new items
      if (field === "label" && next[index]._isNew) {
        updated.wert = slugify(value as string);
      }

      next[index] = updated;
      return next;
    });
  }

  function addOption() {
    const maxOrder = options.reduce((max, o) => Math.max(max, o.sort_order), 0);
    setOptions((prev) => [
      ...prev,
      {
        kategorie,
        wert: "",
        label: "",
        sort_order: maxOrder + 1,
        is_active: true,
        farbe: showFarbe ? "#3b82f6" : null,
        _isNew: true,
      },
    ]);
  }

  function removeOption(index: number) {
    if (deleteConfirm !== index) {
      setDeleteConfirm(index);
      return;
    }
    const option = options[index];
    if (option.id) {
      setDeletedIds((prev) => [...prev, option.id!]);
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setDeleteConfirm(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Delete removed options
      for (const id of deletedIds) {
        const { error } = await supabase
          .from("admin_config_options" as never)
          .delete()
          .eq("id", id);
        if (error) throw error;
      }

      // Upsert remaining options
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const row = {
          kategorie: o.kategorie,
          wert: o.wert,
          label: o.label,
          sort_order: i + 1,
          is_active: o.is_active,
          farbe: o.farbe,
        };

        if (o.id) {
          const { error } = await supabase
            .from("admin_config_options" as never)
            .update(row)
            .eq("id", o.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("admin_config_options" as never)
            .insert(row);
          if (error) throw error;
        }
      }

      toast({ title: `${title} gespeichert` });
      await loadOptions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      toast({
        title: "Fehler beim Speichern",
        description: message,
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {options.map((option, idx) => (
          <div key={option.id ?? `new-${idx}`} className="flex items-center gap-3 p-3 border rounded-lg">
            {/* Label */}
            <div className="flex-1 min-w-0">
              <Label className="text-xs">Label</Label>
              <Input
                value={option.label}
                onChange={(e) => updateOption(idx, "label", e.target.value)}
                placeholder="Anzeigename"
              />
            </div>

            {/* Wert / Slug */}
            <div className="w-32 shrink-0">
              <Label className="text-xs">Wert</Label>
              <Input
                value={option.wert}
                onChange={(e) => {
                  if (option._isNew) {
                    updateOption(idx, "wert", e.target.value);
                  }
                }}
                readOnly={!option._isNew}
                className={!option._isNew ? "bg-muted" : ""}
                placeholder="slug"
              />
            </div>

            {/* Sort order */}
            <div className="w-20 shrink-0">
              <Label className="text-xs">Reihenfolge</Label>
              <Input
                type="number"
                value={option.sort_order}
                onChange={(e) => updateOption(idx, "sort_order", parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>

            {/* Farbe */}
            {showFarbe && (
              <div className="w-16 shrink-0">
                <Label className="text-xs">Farbe</Label>
                <Input
                  type="color"
                  value={option.farbe ?? "#3b82f6"}
                  onChange={(e) => updateOption(idx, "farbe", e.target.value)}
                  className="h-9 p-0.5 cursor-pointer"
                />
              </div>
            )}

            {/* Active toggle */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Label className="text-xs">Aktiv</Label>
              <Switch
                checked={option.is_active}
                onCheckedChange={(checked) => updateOption(idx, "is_active", checked)}
              />
            </div>

            {/* Delete button */}
            <Button
              variant={deleteConfirm === idx ? "destructive" : "ghost"}
              size="icon"
              onClick={() => removeOption(idx)}
              title={deleteConfirm === idx ? "Nochmal klicken zum Löschen" : "Löschen"}
              className="shrink-0 mt-4"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <Button variant="outline" onClick={addOption} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Neue Option
        </Button>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Speichern..." : "Speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
