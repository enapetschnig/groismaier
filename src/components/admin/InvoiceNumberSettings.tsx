import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NumberConfig {
  prefix: string;
  format: string;
  start_nummer: string;
  stellen: string;
}

// Alle Dokumenttypen, die das UI konfigurieren kann.
// Die Reihenfolge bestimmt die Anzeige-Reihenfolge.
const TYPES: { key: string; label: string; defaults: NumberConfig; example: string; hint?: string }[] = [
  { key: "angebot",              label: "Angebote",              defaults: { prefix: "AN", format: "{PREFIX}{YY}{NNN}", start_nummer: "1", stellen: "3" }, example: "AN26001" },
  { key: "auftragsbestaetigung", label: "Auftragsbestätigungen", defaults: { prefix: "AB", format: "{PREFIX}{YY}{NNN}", start_nummer: "1", stellen: "3" }, example: "AB26001" },
  { key: "rechnung",             label: "Rechnungen",            defaults: { prefix: "",   format: "{YY}{NNN}",         start_nummer: "1", stellen: "3" }, example: "26001", hint: "Anzahlungs- und Schlussrechnungen teilen sich diese Nummernfolge (einheitliches Format für alle Rechnungstypen)." },
  { key: "lieferschein",         label: "Lieferscheine",         defaults: { prefix: "LS", format: "{PREFIX}{YY}{NNN}", start_nummer: "1", stellen: "3" }, example: "LS26001" },
  { key: "gutschrift",           label: "Gutschriften",          defaults: { prefix: "GS", format: "{PREFIX}{YY}{NNN}", start_nummer: "1", stellen: "3" }, example: "GS26001" },
  { key: "kundennummer",         label: "Kundennummern",         defaults: { prefix: "K",  format: "{PREFIX}-{NNN}",    start_nummer: "1", stellen: "5" }, example: "K-00001", hint: "Ohne Jahresbezug. Wird beim Kunden-Anlegen automatisch vergeben." },
];

function generatePreview(cfg: NumberConfig): string {
  const yy = String(new Date().getFullYear()).slice(-2);
  const yyyy = String(new Date().getFullYear());
  const num = parseInt(cfg.start_nummer) || 1;
  const st = parseInt(cfg.stellen) || 3;
  const padded = String(num).padStart(st, "0");

  let result = cfg.format || "{PREFIX}{YY}{NNN}";
  result = result.replace("{PREFIX}", cfg.prefix || "");
  result = result.replace("{YYYY}", yyyy);
  result = result.replace("{YY}", yy);
  result = result.replace("{NNN}", padded);
  result = result.replace("{N}", String(num));
  return result;
}

export function InvoiceNumberSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [configs, setConfigs] = useState<Record<string, NumberConfig>>(() => {
    const init: Record<string, NumberConfig> = {};
    for (const t of TYPES) init[t.key] = { ...t.defaults };
    return init;
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const keys: string[] = [];
    for (const t of TYPES) {
      keys.push(`${t.key}_prefix`, `${t.key}_format`, `${t.key}_start_nummer`, `${t.key}_stellen`);
    }
    const { data: appSettings } = await supabase.from("app_settings").select("key, value").in("key", keys);

    // number_ranges als Fallback / Single Source
    const { data: ranges } = await supabase
      .from("number_ranges" as never)
      .select("typ, prefix, format_pattern, start_nummer, stellen" as never);

    const map: Record<string, string> = {};
    (appSettings || []).forEach((r: any) => { map[r.key] = r.value; });

    const rangeByTyp = new Map<string, any>();
    ((ranges as any[]) || []).forEach((r: any) => rangeByTyp.set(r.typ, r));

    const next: Record<string, NumberConfig> = {};
    for (const t of TYPES) {
      const r = rangeByTyp.get(t.key);
      next[t.key] = {
        prefix: map[`${t.key}_prefix`] ?? r?.prefix ?? t.defaults.prefix,
        format: map[`${t.key}_format`] ?? r?.format_pattern ?? t.defaults.format,
        start_nummer: map[`${t.key}_start_nummer`] ?? (r?.start_nummer != null ? String(r.start_nummer) : t.defaults.start_nummer),
        stellen: map[`${t.key}_stellen`] ?? (r?.stellen != null ? String(r.stellen) : t.defaults.stellen),
      };
    }
    setConfigs(next);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1) app_settings spiegeln (UI-Quelle)
      const settingsRows: { key: string; value: string }[] = [];
      for (const t of TYPES) {
        const c = configs[t.key];
        settingsRows.push(
          { key: `${t.key}_prefix`, value: c.prefix },
          { key: `${t.key}_format`, value: c.format },
          { key: `${t.key}_start_nummer`, value: c.start_nummer },
          { key: `${t.key}_stellen`, value: c.stellen },
        );
      }
      for (const s of settingsRows) {
        await supabase.from("app_settings").upsert({ key: s.key, value: s.value }, { onConflict: "key" });
      }

      // 2) number_ranges sync (wird tatsächlich von next_document_number() genutzt).
      //    aktuelle_nummer nicht anfassen, nur Konfig-Felder.
      for (const t of TYPES) {
        const c = configs[t.key];
        const payload: any = {
          typ: t.key,
          label: t.label,
          prefix: c.prefix || "",
          format_pattern: c.format || "{PREFIX}{YY}{NNN}",
          start_nummer: parseInt(c.start_nummer) || 1,
          stellen: parseInt(c.stellen) || 3,
        };
        await (supabase.from("number_ranges" as never) as any)
          .upsert(payload, { onConflict: "typ" });
      }

      toast({ title: "Nummernkreise gespeichert" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const updateCfg = (key: string, patch: Partial<NumberConfig>) => {
    setConfigs(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="h-5 w-5" />
          Nummernkreise
        </CardTitle>
        <CardDescription>
          Präfix, Startnummer, Stellen und Format pro Dokumenttyp. Platzhalter: {"{PREFIX}"}, {"{YY}"}/{"{YYYY}"}, {"{NNN}"} (mit Nullen) oder {"{N}"} (ohne).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {TYPES.map((t) => {
          const cfg = configs[t.key];
          return (
            <div key={t.key} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{t.label}</span>
                  {t.hint && <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>}
                </div>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  Vorschau: {generatePreview(cfg)}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Prefix</Label>
                  <Input value={cfg.prefix} onChange={e => updateCfg(t.key, { prefix: e.target.value })} placeholder={t.defaults.prefix || "z.B. AN, RE"} />
                </div>
                <div>
                  <Label className="text-xs">Startnummer</Label>
                  <Input type="number" min={1} value={cfg.start_nummer} onChange={e => updateCfg(t.key, { start_nummer: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Stellen</Label>
                  <Input type="number" min={2} max={6} value={cfg.stellen} onChange={e => updateCfg(t.key, { stellen: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Format</Label>
                  <Input value={cfg.format} onChange={e => updateCfg(t.key, { format: e.target.value })} placeholder="{PREFIX}{YY}{NNN}" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Beispiel: {t.example}</p>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichern...</> : <><Save className="h-4 w-4 mr-2" /> Speichern</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
