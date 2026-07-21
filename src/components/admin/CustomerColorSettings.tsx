import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CustomerColor {
  id: string;
  name: string;
  farbe_bg: string | null;
  farbe_text: string | null;
}

const PRESET_COLORS = [
  { bg: "#3b82f6", text: "#ffffff" }, // Blue
  { bg: "#1F3A5F", text: "#ffffff" }, // Dunkelblau
  { bg: "#10b981", text: "#ffffff" }, // Green
  { bg: "#8b5cf6", text: "#ffffff" }, // Purple
  { bg: "#ef4444", text: "#ffffff" }, // Red
  { bg: "#06b6d4", text: "#ffffff" }, // Cyan
];

export function CustomerColorSettings() {
  const [customers, setCustomers] = useState<CustomerColor[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCustomers();
  }, [showAll]);

  async function loadCustomers() {
    let query = supabase
      .from("customers")
      .select("id, name, farbe_bg, farbe_text")
      .order("name");

    const { data, error } = await query;

    if (error) {
      toast({ title: "Fehler beim Laden der Kunden", variant: "destructive" });
      return;
    }

    if (!data) return;

    if (showAll) {
      setCustomers(data as any[]);
    } else {
      // Filter to customers that have projects or invoices
      const { data: projectCustomerIds } = await supabase
        .from("projects")
        .select("customer_id");
      const { data: invoiceCustomerIds } = await supabase
        .from("invoices")
        .select("customer_id");

      const activeIds = new Set<string>();
      (projectCustomerIds as any[])?.forEach((p) => {
        if (p.customer_id) activeIds.add(p.customer_id);
      });
      (invoiceCustomerIds as any[])?.forEach((i) => {
        if (i.customer_id) activeIds.add(i.customer_id);
      });

      setCustomers(
        (data as any[]).filter(
          (c) => activeIds.has(c.id) || c.farbe_bg != null
        )
      );
    }
  }

  function setColor(customerId: string, field: "farbe_bg" | "farbe_text", value: string) {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        return { ...c, [field]: value };
      })
    );
  }

  function applyPreset(customerId: string, preset: { bg: string; text: string }) {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        return { ...c, farbe_bg: preset.bg, farbe_text: preset.text };
      })
    );
  }

  function resetColor(customerId: string) {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        return { ...c, farbe_bg: null, farbe_text: null };
      })
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const c of customers) {
        const { error } = await supabase
          .from("customers")
          .update({ farbe_bg: c.farbe_bg, farbe_text: c.farbe_text } as any)
          .eq("id", c.id);
        if (error) throw error;
      }
      toast({ title: "Kunden-Farben gespeichert" });
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
        {/* flex-wrap: Titel + Umschalter passen auf 390 px nicht in eine Zeile
            und schoben die Seite in den Horizontal-Scroll. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Kunden-Farbcodierung
          </CardTitle>
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Nur aktive Kunden" : "Alle Kunden anzeigen"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {customers.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">
            Keine Kunden gefunden.
          </p>
        )}

        {customers.map((customer) => {
          const hasBg = customer.farbe_bg != null;
          const bg = customer.farbe_bg || "#3b82f6";
          const text = customer.farbe_text || "#ffffff";

          return (
            /* flex-wrap: Vorschau + Name + 8 Preset-Farben + Reset passen auf
               390 px nicht in eine Zeile. */
            <div key={customer.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              {/* Color preview */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border"
                style={
                  hasBg
                    ? { backgroundColor: bg, color: text }
                    : { backgroundColor: "#f3f4f6", color: "#9ca3af" }
                }
              >
                {customer.name.slice(0, 2).toUpperCase()}
              </div>

              {/* Customer name (read-only) */}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{customer.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Label className="text-xs whitespace-nowrap">Hintergrund:</Label>
                  <Input
                    type="color"
                    value={bg}
                    onChange={(e) => setColor(customer.id, "farbe_bg", e.target.value)}
                    className="w-10 h-8 p-0.5 cursor-pointer"
                  />
                  <Label className="text-xs whitespace-nowrap">Text:</Label>
                  <Input
                    type="color"
                    value={text}
                    onChange={(e) => setColor(customer.id, "farbe_text", e.target.value)}
                    className="w-10 h-8 p-0.5 cursor-pointer"
                  />
                </div>
              </div>

              {/* Preset colors */}
              <div className="flex flex-wrap gap-1">
                {PRESET_COLORS.map((preset, pi) => (
                  <button
                    key={pi}
                    className="w-5 h-5 rounded-full border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: preset.bg }}
                    onClick={() => applyPreset(customer.id, preset)}
                    title={`Farbe ${pi + 1}`}
                  />
                ))}
              </div>

              {/* Reset button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => resetColor(customer.id)}
                title="Farbe zuruecksetzen"
                className="shrink-0"
                disabled={!hasBg}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Speichern..." : "Farben speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
