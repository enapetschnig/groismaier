import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Truck, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Vehicle {
  id: string;
  bezeichnung: string;
  kennzeichen: string | null;
  typ: string | null;
  aktiv: boolean;
  notizen: string | null;
}

const TYP_OPTIONS = [
  { value: "pkw", label: "PKW" },
  { value: "bus", label: "Bus / Transporter" },
  { value: "lkw", label: "LKW" },
  { value: "anhaenger", label: "Anhänger" },
  { value: "stapler", label: "Stapler / Bagger" },
  { value: "sonstiges", label: "Sonstiges" },
];

export function VehicleManager() {
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    bezeichnung: "",
    kennzeichen: "",
    typ: "pkw",
    aktiv: true,
    notizen: "",
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("vehicles" as never) as any)
      .select("*")
      .order("aktiv", { ascending: false })
      .order("bezeichnung");
    if (!error && data) setVehicles(data as Vehicle[]);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newVehicle.bezeichnung.trim()) {
      toast({ variant: "destructive", title: "Bezeichnung fehlt" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("vehicles" as never) as any).insert({
      bezeichnung: newVehicle.bezeichnung.trim(),
      kennzeichen: newVehicle.kennzeichen.trim() || null,
      typ: newVehicle.typ || null,
      aktiv: newVehicle.aktiv,
      notizen: newVehicle.notizen.trim() || null,
    });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Fahrzeug hinzugefügt" });
      setNewVehicle({ bezeichnung: "", kennzeichen: "", typ: "pkw", aktiv: true, notizen: "" });
      load();
    }
    setSaving(false);
  };

  const handleUpdate = async (v: Vehicle) => {
    const { error } = await (supabase.from("vehicles" as never) as any)
      .update({
        bezeichnung: v.bezeichnung,
        kennzeichen: v.kennzeichen,
        typ: v.typ,
        aktiv: v.aktiv,
        notizen: v.notizen,
      })
      .eq("id", v.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gespeichert" });
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Fahrzeug wirklich löschen? Buchungen mit diesem Fahrzeug bleiben erhalten, verlieren aber die Zuordnung.")) return;
    const { error } = await (supabase.from("vehicles" as never) as any).delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gelöscht" });
      load();
    }
  };

  const updateLocal = (id: string, patch: Partial<Vehicle>) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Fahrzeuge / KFZ
        </CardTitle>
        <CardDescription>
          Fahrzeuge, die bei der Zeiterfassung ausgewählt werden können (für Kilometerstände).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Liste */}
            <div className="space-y-2">
              {vehicles.length === 0 && (
                <p className="text-sm text-muted-foreground">Noch keine Fahrzeuge angelegt.</p>
              )}
              {vehicles.map((v) => (
                <div key={v.id} className={`rounded-md border p-3 grid grid-cols-1 md:grid-cols-5 gap-2 ${!v.aktiv ? "opacity-60" : ""}`}>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Bezeichnung</Label>
                    <Input value={v.bezeichnung} onChange={(e) => updateLocal(v.id, { bezeichnung: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Kennzeichen</Label>
                    <Input value={v.kennzeichen || ""} onChange={(e) => updateLocal(v.id, { kennzeichen: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Typ</Label>
                    <Select value={v.typ || "pkw"} onValueChange={(val) => updateLocal(v.id, { typ: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <Checkbox checked={v.aktiv} onCheckedChange={(c) => updateLocal(v.id, { aktiv: !!c })} />
                      aktiv
                    </label>
                    <Button size="sm" variant="outline" onClick={() => handleUpdate(v)} className="gap-1">
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(v.id)} className="text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Neu hinzufügen */}
            <div className="rounded-md border border-dashed p-3 grid grid-cols-1 md:grid-cols-5 gap-2 bg-muted/20">
              <div className="md:col-span-2">
                <Label className="text-xs">Bezeichnung *</Label>
                <Input
                  value={newVehicle.bezeichnung}
                  onChange={(e) => setNewVehicle(prev => ({ ...prev, bezeichnung: e.target.value }))}
                  placeholder="z.B. VW T6 Werkstatt"
                />
              </div>
              <div>
                <Label className="text-xs">Kennzeichen</Label>
                <Input
                  value={newVehicle.kennzeichen}
                  onChange={(e) => setNewVehicle(prev => ({ ...prev, kennzeichen: e.target.value }))}
                  placeholder="ZT-1234F"
                />
              </div>
              <div>
                <Label className="text-xs">Typ</Label>
                <Select value={newVehicle.typ} onValueChange={(v) => setNewVehicle(prev => ({ ...prev, typ: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAdd} disabled={saving} className="w-full gap-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Hinzufügen
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
