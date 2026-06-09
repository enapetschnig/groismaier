import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Bell, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_MAHNUNG_SETTINGS,
  parseMahnungSettings,
  type MahnungSettings as MahnungSettingsType,
} from "@/lib/mahnungSettings";

export function MahnungSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<MahnungSettingsType>(() =>
    JSON.parse(JSON.stringify(DEFAULT_MAHNUNG_SETTINGS)),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "mahnung_settings")
      .maybeSingle();
    setSettings(parseMahnungSettings((data as any)?.value));
    setLoading(false);
  };

  const updateStufe = <K extends keyof MahnungSettingsType["stufen"][number]>(
    idx: number,
    field: K,
    value: MahnungSettingsType["stufen"][number][K],
  ) => {
    setSettings((prev) => {
      const next = { ...prev, stufen: [...prev.stufen] as MahnungSettingsType["stufen"] };
      next.stufen[idx] = { ...next.stufen[idx], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { key: "mahnung_settings", value: JSON.stringify(settings) };
    const { error } = await supabase
      .from("app_settings")
      .upsert(payload, { onConflict: "key" });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gespeichert", description: "Mahnungstexte aktualisiert" });
    }
    setSaving(false);
  };

  const handleReset = () => {
    if (!confirm("Alle Mahnungstexte auf Vorgaben zurücksetzen?")) return;
    setSettings(JSON.parse(JSON.stringify(DEFAULT_MAHNUNG_SETTINGS)));
  };

  const STUFE_LABELS = ["1. Stufe – Zahlungserinnerung", "2. Stufe – 2. Mahnung", "3. Stufe – Letzte Mahnung"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Mahnungen
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Anschreibetext, Frist und Mahngebühr für die drei Mahnstufen. Platzhalter im Text:
          <code className="ml-1 px-1 bg-muted rounded text-xs">{"{{tage}}"}</code>{" "}
          <code className="ml-1 px-1 bg-muted rounded text-xs">{"{{rechnungsnummer}}"}</code>{" "}
          <code className="ml-1 px-1 bg-muted rounded text-xs">{"{{betrag}}"}</code>
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : (
          settings.stufen.map((stufe, idx) => (
            <div key={idx} className="border rounded-lg p-4 space-y-3">
              <div className="text-sm font-semibold text-primary">{STUFE_LABELS[idx]}</div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">Titel im PDF</Label>
                  <Input
                    value={stufe.titel}
                    onChange={(e) => updateStufe(idx, "titel", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Zahlungsfrist (Tage)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={stufe.frist_tage}
                    onChange={(e) => updateStufe(idx, "frist_tage", Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mahngebühr (€)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={stufe.gebuehr}
                    onChange={(e) => updateStufe(idx, "gebuehr", Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Anschreibetext</Label>
                <Textarea
                  rows={6}
                  value={stufe.text}
                  onChange={(e) => updateStufe(idx, "text", e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ))
        )}

        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Vorgaben wiederherstellen
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Speichert…" : "Speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
