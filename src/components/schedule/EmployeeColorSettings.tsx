import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Palette, Save, CheckCheck } from "lucide-react";
import { DEFAULT_EMPLOYEE_COLORS, getDefaultEmployeeColor } from "./employeeColorDefaults";

interface EmployeeColor {
  employee_id: string;
  bg_color: string;
  text_color: string;
}

interface Employee {
  id: string;
  vorname: string;
  nachname: string;
}

const DEFAULT_COLORS = DEFAULT_EMPLOYEE_COLORS;

export function EmployeeColorSettings() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [colors, setColors] = useState<Record<string, EmployeeColor>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [empRes, colorRes, hiddenRes] = await Promise.all([
      (supabase.from("employees" as never) as any).select("id, vorname, nachname, user_id").eq("aktiv", true).order("nachname"),
      supabase.from("employee_schedule_colors").select("*"),
      (supabase.from("profiles" as never) as any).select("id").eq("hidden", true),
    ]);

    if (empRes.data) {
      const hiddenIds = new Set(((hiddenRes.data as any[]) || []).map((p: any) => p.id));
      setEmployees(empRes.data.filter((e: any) => !e.user_id || !hiddenIds.has(e.user_id)));
    }
    if (colorRes.data) {
      const map: Record<string, EmployeeColor> = {};
      colorRes.data.forEach((c: any) => {
        map[c.employee_id] = { employee_id: c.employee_id, bg_color: c.bg_color, text_color: c.text_color };
      });
      setColors(map);
    }
  }

  function getColor(empId: string, idx: number): EmployeeColor {
    if (colors[empId]) return colors[empId];
    const def = getDefaultEmployeeColor(idx);
    return { employee_id: empId, bg_color: def.bg, text_color: def.text };
  }

  /** Schreibt die aktuell angezeigten Farben (DB oder Default) für ALLE
   *  Mitarbeiter in die DB. So entsteht nach einem Klick ein konsistenter
   *  Zustand zwischen Admin und Plantafel, auch ohne dass der User
   *  einzeln gespeichert hat. */
  async function applyDefaultsToAll() {
    setSaving(true);
    try {
      const rows = employees.map((emp, idx) => {
        const c = getColor(emp.id, idx);
        return { employee_id: emp.id, bg_color: c.bg_color, text_color: c.text_color };
      });
      // Nur einfügen, wo noch nichts gespeichert ist
      const missing = rows.filter(r => !colors[r.employee_id]);
      for (const row of missing) {
        await supabase.from("employee_schedule_colors").upsert(row, { onConflict: "employee_id" });
      }
      // Lokalen State aktualisieren
      setColors(prev => {
        const next = { ...prev };
        missing.forEach(r => { next[r.employee_id] = { ...r }; });
        return next;
      });
      toast({ title: `${missing.length} Default-Farben übernommen`, description: missing.length === 0 ? "Es waren bereits alle Mitarbeiter gespeichert." : undefined });
    } catch {
      toast({ title: "Fehler beim Übernehmen", variant: "destructive" });
    }
    setSaving(false);
  }

  function setColorFor(empId: string, field: "bg_color" | "text_color", value: string) {
    setColors(prev => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || { employee_id: empId, bg_color: "#3b82f6", text_color: "#ffffff" }),
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const rows = employees.map((emp, idx) => {
        const c = getColor(emp.id, idx);
        return { employee_id: emp.id, bg_color: c.bg_color, text_color: c.text_color };
      });

      for (const row of rows) {
        await supabase.from("employee_schedule_colors").upsert(row, { onConflict: "employee_id" });
      }

      toast({ title: "Farben gespeichert" });
    } catch (err) {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
    setSaving(false);
  }

  function applyPreset(empId: string, preset: typeof DEFAULT_COLORS[0]) {
    setColors(prev => ({
      ...prev,
      [empId]: { employee_id: empId, bg_color: preset.bg, text_color: preset.text },
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Plantafel-Farben pro Mitarbeiter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {employees.map((emp, idx) => {
          const c = getColor(emp.id, idx);
          return (
            <div key={emp.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: c.bg_color, color: c.text_color }}
              >
                {emp.vorname?.[0]}{emp.nachname?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{emp.vorname} {emp.nachname}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Label className="text-xs whitespace-nowrap">Hintergrund:</Label>
                  <Input
                    type="color"
                    value={c.bg_color}
                    onChange={(e) => setColorFor(emp.id, "bg_color", e.target.value)}
                    className="w-10 h-8 p-0.5 cursor-pointer"
                  />
                  <Label className="text-xs whitespace-nowrap">Text:</Label>
                  <Input
                    type="color"
                    value={c.text_color}
                    onChange={(e) => setColorFor(emp.id, "text_color", e.target.value)}
                    className="w-10 h-8 p-0.5 cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {DEFAULT_COLORS.slice(0, 5).map((preset, pi) => (
                  <button
                    key={pi}
                    className="w-5 h-5 rounded-full border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: preset.bg }}
                    onClick={() => applyPreset(emp.id, preset)}
                    title={`Farbe ${pi + 1}`}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex gap-2">
          <Button onClick={applyDefaultsToAll} disabled={saving} variant="outline" className="flex-1">
            <CheckCheck className="h-4 w-4 mr-2" />
            Default-Farben für alle übernehmen
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Speichern..." : "Farben speichern"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Die bunten Farben oben sind Vorschläge. Klick „Für alle übernehmen", um sie für alle
          noch nicht gespeicherten Mitarbeiter in die Datenbank zu schreiben — erst dann erscheinen
          sie in der Plantafel. „Farben speichern" schreibt die aktuellen (auch geänderten) Werte.
        </p>
      </CardContent>
    </Card>
  );
}
