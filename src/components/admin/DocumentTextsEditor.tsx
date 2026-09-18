import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { MAIL_PLATZHALTER, MAIL_TYP, POSTFAECHER, STANDARD_MAIL_BETREFF, STANDARD_MAIL_TEXT, standardSignatur, mailVorlagenVergessen } from "@/lib/mailVorlagen";

type FieldKey = "intro" | "closing" | "zahlungsbedingungen" | "anzahlung_hinweis" | "mail_betreff" | "mail_text";

const DOC_TYPES: { key: string; label: string }[] = [
  { key: "angebot",              label: "Angebot" },
  { key: "auftragsbestaetigung", label: "Auftragsbestätigung" },
  { key: "rechnung",             label: "Rechnung" },
  { key: "anzahlungsrechnung",   label: "Anzahlungsrechnung" },
  { key: "schlussrechnung",      label: "Schlussrechnung" },
  { key: "lieferschein",         label: "Lieferschein" },
  { key: "gutschrift",           label: "Gutschrift" },
  // Nur für die Mail-Felder: der Standard, wenn ein Belegtyp keinen eigenen Text hat.
  { key: MAIL_TYP,               label: "E-Mail-Standard (alle Belegtypen)" },
];

const FIELDS: { key: FieldKey; label: string; hint: string; rows?: number }[] = [
  { key: "intro",               label: "Einleitungstext", hint: "Erscheint am Anfang des Dokuments, über den Positionen.", rows: 3 },
  { key: "closing",             label: "Schlusstext",     hint: "Erscheint am Ende des Dokuments, nach den Positionen.", rows: 3 },
  { key: "zahlungsbedingungen", label: "Zahlungsbedingungen", hint: "Zusätzlicher Zahlungshinweis (nur bei Rechnungstypen relevant).", rows: 2 },
  { key: "anzahlung_hinweis",   label: "Anzahlungshinweis", hint: "Nur Anzahlungsrechnung – erscheint unter dem Betrag.", rows: 2 },
  // Beleg-Mail (Kundenwunsch 18.09.2026): Betreff und Text beim Versand aus dem Beleg.
  { key: "mail_betreff",        label: "E-Mail: Betreff",  hint: "Beim Versenden des Belegs per Mail. Leer = Standard für alle Belegtypen bzw. eingebaut.", rows: 1 },
  { key: "mail_text",           label: "E-Mail: Text",     hint: "Der Mailtext beim Versenden. {{signatur}} setzt die Signatur des Postfachs ein.", rows: 8 },
];
const LEER: Record<FieldKey, string> = { intro: "", closing: "", zahlungsbedingungen: "", anzahlung_hinweis: "", mail_betreff: "", mail_text: "" };
const MAIL_FELDER: FieldKey[] = ["mail_betreff", "mail_text"];

const VARIABLES_HINT = `Platzhalter in Belegtexten: {{kunde_name}}, {{projekt_name}}, {{angebot_nr}}, {{ab_nr}}, {{rechnung_nr}}, {{tage}}, {{prozent}}, {{betrag}}, {{datum}} — in E-Mail-Texten: {{anrede}}, {{belegbezeichnung}}, {{nummer}}, {{kunde_name}}, {{datum}}, {{signatur}}`;

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
  /** Signaturen je Postfach (typ „mail", feld „signatur:<adresse>"); leer = eingebaute Signatur. */
  const [signaturen, setSignaturen] = useState<Record<string, string>>({});
  const [savingSig, setSavingSig] = useState(false);

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
      map[t.key] = { ...LEER };
    }
    const sig: Record<string, string> = {};
    if (!error) {
      ((data as TextEntry[]) || []).forEach((row) => {
        if (row.typ === MAIL_TYP && String(row.feld).startsWith("signatur:")) { sig[String(row.feld).slice("signatur:".length)] = row.inhalt || ""; return; }
        if (!map[row.typ]) map[row.typ] = { ...LEER };
        if (FIELDS.some(f => f.key === row.feld)) {
          map[row.typ][row.feld as FieldKey] = row.inhalt || "";
        }
      });
    }
    setTexts(map);
    setSignaturen(sig);
    setLoading(false);
  };

  const handleSaveSignaturen = async () => {
    setSavingSig(true);
    try {
      for (const pf of POSTFAECHER) {
        const val = (signaturen[pf.adresse] || "").trim();
        const feld = `signatur:${pf.adresse}`;
        if (!val) {
          await (supabase.from("document_texts" as never) as any).delete().eq("typ", MAIL_TYP).eq("feld", feld).eq("sprache", "de");
        } else {
          const { error } = await (supabase.from("document_texts" as never) as any)
            .upsert([{ typ: MAIL_TYP, feld, inhalt: val, sprache: "de" }], { onConflict: "typ,feld,sprache" });
          if (error) throw error;
        }
      }
      mailVorlagenVergessen();
      toast({ title: "Signaturen gespeichert" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSavingSig(false);
    }
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
      mailVorlagenVergessen();
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

  const currentTexts = texts[selectedType] || { ...LEER };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Textbausteine
        </CardTitle>
        <CardDescription>
          Standardtexte für jeden Dokumenttyp und für die E-Mail beim Versand. Leere Felder fallen auf einen sinnvollen Default zurück.
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
            // „E-Mail-Standard" hat nur die Mail-Felder
            if (selectedType === MAIL_TYP && !MAIL_FELDER.includes(f.key)) return null;
            const istMail = MAIL_FELDER.includes(f.key);
            const standard = f.key === "mail_betreff" ? STANDARD_MAIL_BETREFF : f.key === "mail_text" ? STANDARD_MAIL_TEXT : "";
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label>{f.label}</Label>
                  <span className="text-xs text-muted-foreground">{f.hint}</span>
                </div>
                {f.key === "mail_betreff" ? (
                  <Input
                    value={currentTexts[f.key]}
                    onChange={(e) => updateText(selectedType, f.key, e.target.value)}
                    placeholder={standard}
                  />
                ) : (
                  <Textarea
                    value={currentTexts[f.key]}
                    onChange={(e) => updateText(selectedType, f.key, e.target.value)}
                    rows={f.rows || 2}
                    placeholder={istMail ? standard : "(Standardtext wird verwendet, wenn leer)"}
                    className={istMail ? "font-mono text-xs" : undefined}
                  />
                )}
                {istMail && f.key === "mail_text" && (
                  <p className="text-xs text-muted-foreground">
                    Platzhalter: {MAIL_PLATZHALTER.map((p) => p.name).join(" · ")} — leer = {selectedType === MAIL_TYP ? "eingebauter Text" : "E-Mail-Standard (alle Belegtypen)"}.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichert...</> : <><Save className="h-4 w-4 mr-2" /> Speichern</>}
          </Button>
        </div>

        {/* Signaturen je Postfach (Kundenwunsch 18.09.2026) — gelten in der
            Beleg-Mail ({{signatur}}) und beim Antworten im Mail-Bereich. */}
        <div className="space-y-3 border-t pt-4">
          <div>
            <Label className="text-base">E-Mail-Signaturen</Label>
            <p className="text-xs text-muted-foreground">
              Je Postfach. Leer = eingebaute Signatur (unten grau als Vorschau). Gilt für Beleg-Mails und Antworten im Mail-Bereich.
            </p>
          </div>
          {POSTFAECHER.map((pf) => (
            <div key={pf.adresse} className="space-y-1">
              <Label>{pf.kurz} <span className="font-normal text-muted-foreground">({pf.adresse})</span></Label>
              <Textarea
                value={signaturen[pf.adresse] || ""}
                onChange={(e) => setSignaturen((prev) => ({ ...prev, [pf.adresse]: e.target.value }))}
                rows={6}
                className="font-mono text-xs"
                placeholder={standardSignatur(pf.adresse)}
              />
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={handleSaveSignaturen} disabled={savingSig}>
              {savingSig ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichert...</> : <><Save className="h-4 w-4 mr-2" /> Signaturen speichern</>}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
