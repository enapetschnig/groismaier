import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Palette, Plus, Trash2, Save, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProjectStatus {
  id: string | null;
  name: string;
  farbe_bg: string;
  farbe_text: string;
  sort_order: number;
  is_default: boolean;
}

export function ProjectStatusSettings() {
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadStatuses();
  }, []);

  async function loadStatuses() {
    const { data, error } = await supabase
      .from("project_statuses" as any)
      .select("id, name, farbe_bg, farbe_text, sort_order, is_default")
      .order("sort_order");

    if (error) {
      toast({ title: "Fehler beim Laden der Status", variant: "destructive" });
      return;
    }

    if (data) {
      setStatuses(
        (data as any[]).map((row) => ({
          id: row.id,
          name: row.name,
          farbe_bg: row.farbe_bg || "#3b82f6",
          farbe_text: row.farbe_text || "#ffffff",
          sort_order: row.sort_order ?? 0,
          is_default: row.is_default ?? false,
        }))
      );
    }
  }

  function updateStatus(index: number, field: keyof ProjectStatus, value: any) {
    setStatuses((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      // Ensure only one default
      if (field === "is_default" && value === true) {
        return next.map((s, i) => ({
          ...s,
          is_default: i === index,
        }));
      }

      return next;
    });
  }

  function addStatus() {
    const maxOrder = statuses.reduce((max, s) => Math.max(max, s.sort_order), 0);
    setStatuses((prev) => [
      ...prev,
      {
        id: null,
        name: "Neuer Status",
        farbe_bg: "#6b7280",
        farbe_text: "#ffffff",
        sort_order: maxOrder + 1,
        is_default: false,
      },
    ]);
  }

  function removeStatus(index: number) {
    if (deleteConfirm !== index) {
      setDeleteConfirm(index);
      return;
    }
    const status = statuses[index];
    setStatuses((prev) => prev.filter((_, i) => i !== index));
    setDeleteConfirm(null);

    // If it had an id, delete from DB
    if (status.id) {
      supabase
        .from("project_statuses" as any)
        .delete()
        .eq("id", status.id)
        .then(({ error }) => {
          if (error) {
            toast({ title: "Fehler beim Löschen", variant: "destructive" });
            loadStatuses();
          }
        });
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (let i = 0; i < statuses.length; i++) {
        const s = statuses[i];
        const row = {
          name: s.name,
          farbe_bg: s.farbe_bg,
          farbe_text: s.farbe_text,
          sort_order: i + 1,
          is_default: s.is_default,
        };

        if (s.id) {
          const { error } = await supabase
            .from("project_statuses" as any)
            .update(row)
            .eq("id", s.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("project_statuses" as any)
            .insert(row);
          if (error) throw error;
        }
      }

      toast({ title: "Status-Konfiguration gespeichert" });
      await loadStatuses();
    } catch (err: any) {
      toast({
        title: "Fehler beim Speichern",
        description: err?.message,
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Projektstatus-Farben
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {statuses.map((status, idx) => (
          <div key={status.id ?? `new-${idx}`} className="flex items-center gap-3 p-3 border rounded-lg">
            {/* Drag handle placeholder */}
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />

            {/* Color preview */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: status.farbe_bg, color: status.farbe_text }}
            >
              {status.name.slice(0, 2)}
            </div>

            {/* Name input */}
            <div className="flex-1 min-w-0">
              <Input
                value={status.name}
                onChange={(e) => updateStatus(idx, "name", e.target.value)}
                className="font-medium"
                placeholder="Statusname"
              />
              <div className="flex items-center gap-2 mt-1">
                <Label className="text-xs whitespace-nowrap">Hintergrund:</Label>
                <Input
                  type="color"
                  value={status.farbe_bg}
                  onChange={(e) => updateStatus(idx, "farbe_bg", e.target.value)}
                  className="w-10 h-8 p-0.5 cursor-pointer"
                />
                <Label className="text-xs whitespace-nowrap">Text:</Label>
                <Input
                  type="color"
                  value={status.farbe_text}
                  onChange={(e) => updateStatus(idx, "farbe_text", e.target.value)}
                  className="w-10 h-8 p-0.5 cursor-pointer"
                />
              </div>
            </div>

            {/* Default toggle */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Label className="text-xs">Standard</Label>
              <Switch
                checked={status.is_default}
                onCheckedChange={(checked) => updateStatus(idx, "is_default", checked)}
              />
            </div>

            {/* Delete button */}
            <Button
              variant={deleteConfirm === idx ? "destructive" : "ghost"}
              size="icon"
              onClick={() => removeStatus(idx)}
              title={deleteConfirm === idx ? "Nochmal klicken zum Löschen" : "Löschen"}
              className="shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <Button variant="outline" onClick={addStatus} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Neuen Status hinzufügen
        </Button>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Speichern..." : "Speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
