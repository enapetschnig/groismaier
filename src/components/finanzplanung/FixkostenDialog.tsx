import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Fixkosten, FixkostenIntervall, INTERVALL_LABELS, MONATE } from "./types";

interface FixkostenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = neuen Eintrag anlegen */
  eintrag: Fixkosten | null;
  onSaved: () => void;
}

export function FixkostenDialog({ open, onOpenChange, eintrag, onSaved }: FixkostenDialogProps) {
  const [name, setName] = useState("");
  const [betrag, setBetrag] = useState("");
  const [intervall, setIntervall] = useState<FixkostenIntervall>("monatlich");
  const [faelligMonat, setFaelligMonat] = useState("1");
  const [faelligTag, setFaelligTag] = useState("1");
  const [aktiv, setAktiv] = useState(true);
  const [notiz, setNotiz] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (eintrag) {
      setName(eintrag.name);
      setBetrag(String(eintrag.betrag));
      setIntervall(eintrag.intervall);
      setFaelligMonat(String(eintrag.faellig_monat ?? 1));
      setFaelligTag(String(eintrag.faellig_tag ?? 1));
      setAktiv(eintrag.aktiv);
      setNotiz(eintrag.notiz ?? "");
    } else {
      setName("");
      setBetrag("");
      setIntervall("monatlich");
      setFaelligMonat("1");
      setFaelligTag("1");
      setAktiv(true);
      setNotiz("");
    }
  }, [open, eintrag]);

  const handleSave = async () => {
    const betragNum = parseFloat(betrag.replace(",", "."));
    if (!name.trim()) {
      toast.error("Bitte einen Namen angeben");
      return;
    }
    if (!Number.isFinite(betragNum) || betragNum <= 0) {
      toast.error("Bitte einen gültigen Betrag angeben");
      return;
    }
    const tagNum = Math.min(31, Math.max(1, parseInt(faelligTag) || 1));

    setSaving(true);
    const payload = {
      name: name.trim(),
      betrag: betragNum,
      intervall,
      faellig_monat: intervall === "monatlich" ? null : parseInt(faelligMonat),
      faellig_tag: tagNum,
      aktiv,
      notiz: notiz.trim() || null,
    };

    const query = (supabase.from("fixkosten" as never) as any);
    const { error } = eintrag
      ? await query.update(payload).eq("id", eintrag.id)
      : await query.insert(payload);

    setSaving(false);
    if (error) {
      toast.error("Fehler beim Speichern", { description: error.message });
      return;
    }
    toast.success(eintrag ? "Fixkosten aktualisiert" : "Fixkosten angelegt");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{eintrag ? "Fixkosten bearbeiten" : "Fixkosten anlegen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fk-name">Name *</Label>
            <Input
              id="fk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Miete Werkstatt"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fk-betrag">Betrag (€ brutto) *</Label>
              <Input
                id="fk-betrag"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={betrag}
                onChange={(e) => setBetrag(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Intervall</Label>
              <Select value={intervall} onValueChange={(v) => setIntervall(v as FixkostenIntervall)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INTERVALL_LABELS) as FixkostenIntervall[]).map((i) => (
                    <SelectItem key={i} value={i}>{INTERVALL_LABELS[i]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {intervall !== "monatlich" && (
              <div className="space-y-1.5">
                <Label>
                  {intervall === "quartalsweise" ? "Erster Fälligkeitsmonat" : "Fälligkeitsmonat"}
                </Label>
                <Select value={faelligMonat} onValueChange={setFaelligMonat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONATE.map((m, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="fk-tag">Fälligkeitstag im Monat</Label>
              <Input
                id="fk-tag"
                type="number"
                min="1"
                max="31"
                value={faelligTag}
                onChange={(e) => setFaelligTag(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="fk-aktiv">Aktiv</Label>
              <p className="text-xs text-muted-foreground">
                Nur aktive Fixkosten fließen in die Vorschau ein
              </p>
            </div>
            <Switch id="fk-aktiv" checked={aktiv} onCheckedChange={setAktiv} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fk-notiz">Notiz</Label>
            <Textarea
              id="fk-notiz"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={2}
              placeholder="Optionale Anmerkung"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichert..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
