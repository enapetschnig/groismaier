import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type FieldKey = "intro" | "closing" | "zahlungsbedingungen" | "anzahlung_hinweis";

const DOC_TYPES: { key: string; label: string }[] = [
  { key: "angebot",              label: "Angebot" },
  { key: "auftragsbestaetigung", label: "Auftragsbestätigung" },
  { key: "rechnung",             label: "Rechnung" },
  { key: "anzahlungsrechnung",   label: "Anzahlungsrechnung" },
  { key: "schlussrechnung",      label: "Schlussrechnung" },
  { key: "lieferschein",         label: "Lieferschein" },
  { key: "gutschrift",           label: "Gutschrift" },
];

const FIELDS: { key: FieldKey; label: string; hint: string; rows?: number }[] = [
  { key: "intro",               label: "Einleitungstext", hint: "Erscheint am Anfang des Dokuments, über den Positionen.", rows: 3 },
  { key: "closing",             label: "Schlusstext",     hint: "Erscheint am Ende des Dokuments, nach den Positionen.", rows: 3 },
  { key: "zahlungsbedingungen", label: "Zahlungsbedingungen", hint: "Zusätzlicher Zahlungshinweis (nur bei Rechnungstypen relevant).", rows: 2 },
  { key: "anzahlung_hinweis",   label: "Anzahlungshinweis", hint: "Nur Anzahlungsrechnung – erscheint unter dem Betrag.", rows: 2 },
];

const VARIABLES_HINT = `Verfügbare Platzhalter: {{kunde_name}}, {{projekt_name}}, {{angebot_nr}}, {{ab_nr}}, {{rechnung_nr}}, {{tage}}, {{prozent}}, {{betrag}}, {{datum}}`;

interface TextEntry {
  typ: string;
  feld: FieldKey;
  inhalt: string;
}

export function DocumentTextsEditor() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("angebot");
  const [texts, setTexts] = useState<Record<string, Record<FieldKey, string>>>({});

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("document_texts" as never) as any)
      .select("typ, feld, inhalt")
      .eq("sprache", "de");

    const map: Record<string, Record<FieldKey, string>> = {};
    for (const t of DOC_TYPES) {
      map[t.key] = { intro: "", closing: "", zahlungsbedingungen: "", anzahlung_hinweis: "" };
    }
    if (!error) {
      ((data as TextEntry[]) || []).forEach((row) => {
        if (!map[row.typ]) map[row.typ] = { intro: "", closing: "", zahlungsbedingungen: "", anzahlung_hinweis: "" };
        if (FIELDS.some(f => f.key === row.feld)) {
          map[row.typ][row.feld as FieldKey] = row.inhalt || "";
        }
      });
    }
    setTexts(map);
    setLoading(false);
  };

  const updateText = (typ: string, feld: FieldKey, value: string) => {
    setTexts(prev => ({ ...prev, [typ]: { ...prev[typ], [feld]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const current = texts[selectedType] || {};
      const rows: { typ: string; feld: FieldKey; inhalt: string; sprache: string }[] = [];
      for (const f of FIELDS) {
        const val = current[f.key] ?? "";
        // Leere Texte löschen wir (Default-Fallback im PDF-Generator greift)
        if (val.trim() === "") {
          await (supabase.from("document_texts" as never) as any)
            .delete()
            .eq("typ", selectedType)
            .eq("feld", f.key)
            .eq("sprache", "de");
        } else {
          rows.push({ typ: selectedType, feld: f.key, inhalt: val, sprache: "de" });
        }
      }
      if (rows.length > 0) {
        const { error } = await (supabase.from("document_texts" as never) as any)
          .upsert(rows, { onConflict: "typ,feld,sprache" });
        if (error) throw error;
      }
      toast({ title: `Texte für ${DOC_TYPES.find(t => t.key === selectedType)?.label} gespeichert` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
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

  const currentTexts = texts[selectedType] || { intro: "", closing: "", zahlungsbedingungen: "", anzahlung_hinweis: "" };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Textbausteine
        </CardTitle>
        <CardDescription>
          Standardtexte für jeden Dokumenttyp. Leere Felder fallen auf einen sinnvollen Default zurück.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Dokumenttyp:</Label>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="max-w-[320px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground">
          {VARIABLES_HINT}
        </div>

        <div className="space-y-4">
          {FIELDS.map((f) => {
            // Anzahlungshinweis nur für anzahlungsrechnung zeigen
            if (f.key === "anzahlung_hinweis" && selectedType !== "anzahlungsrechnung") return null;
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label>{f.label}</Label>
                  <span className="text-xs text-muted-foreground">{f.hint}</span>
                </div>
                <Textarea
                  value={currentTexts[f.key]}
                  onChange={(e) => updateText(selectedType, f.key, e.target.value)}
                  rows={f.rows || 2}
                  placeholder="(Standardtext wird verwendet, wenn leer)"
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichert...</> : <><Save className="h-4 w-4 mr-2" /> Speichern</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
