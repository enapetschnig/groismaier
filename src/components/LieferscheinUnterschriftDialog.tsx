// ============================================================================
// Unterschrift zum Lieferschein (Kundenwunsch 11.09.2026)
//
// „ein Unterschrift-Feld, wo der Kunde oder Frächter dann unterschreiben kann"
//
// Bewusst NICHT der SignatureDialog der Regieberichte: Der lädt Material und
// Fotos des Berichts und verschickt eine Mail. Hier braucht es nur zwei
// Dinge — wer unterschreibt, und die Unterschrift selbst. Der Name ist
// Pflicht, weil beim Lieferschein oft nicht der Kunde, sondern der Fahrer
// unterschreibt; ohne Namen weiß später niemand, wer die Ware übernommen hat.
// ============================================================================
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenLine } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vorschlag für den Namen, z. B. der Kundenname. */
  vorschlagName?: string;
  onBestaetigen: (unterschrift: string, name: string) => Promise<void>;
}

export function LieferscheinUnterschriftDialog({ open, onOpenChange, vorschlagName, onBestaetigen }: Props) {
  const [name, setName] = useState(vorschlagName || "");
  const [unterschrift, setUnterschrift] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  // Das Feld ist auf dem Handy schmaler als 400 px — sonst ragt es aus dem Dialog.
  const breite = typeof window === "undefined" ? 400 : Math.min(400, window.innerWidth - 72);

  const bestaetigen = async () => {
    if (!unterschrift || !name.trim()) return;
    setSpeichert(true);
    try {
      await onBestaetigen(unterschrift, name.trim());
      onOpenChange(false);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!speichert) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" /> Übernahme bestätigen
          </DialogTitle>
          <DialogDescription>
            Wer übernimmt die Ware? Name eintragen und unterschreiben — Kunde oder Frächter.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ls-unterschrift-name">Name des Unterzeichners *</Label>
            <Input
              id="ls-unterschrift-name"
              className="h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Max Huber (Frächter)"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unterschrift *</Label>
            <div className="overflow-hidden rounded-md border bg-white">
              <SignaturePad onSignatureChange={setUnterschrift} width={breite} height={180} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>
              Abbrechen
            </Button>
            <Button className="h-11" onClick={() => void bestaetigen()} disabled={!unterschrift || !name.trim() || speichert}>
              {speichert ? "Wird gespeichert …" : "Unterschrift speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
