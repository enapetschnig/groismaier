/**
 * Beleg per E-Mail senden (Kundenwunsch: „das mit dem Rechnung senden kannst
 * du ja jetzt mit der Mail verknüpfen").
 *
 * Gesendet wird über das ECHTE Firmenpostfach (Microsoft 365, Edge Function
 * mail-postfach) — nicht über einen Fremdversender. Die Mail liegt dadurch
 * anschließend in Outlook unter „Gesendete Elemente", genau wie eine von Hand
 * geschriebene. Das PDF hängt automatisch an; der frühere Weg war ein
 * mailto:-Link, bei dem der Anwender das PDF selbst anhängen musste.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Paperclip, Send } from "lucide-react";

/** Absender-Postfächer (identisch zur Allowlist der Edge Function). */
const POSTFAECHER = [
  { adresse: "office@cg-holzbau.at", kurz: "Office" },
  { adresse: "christian.groismaier@cg-holzbau.at", kurz: "Christian" },
  { adresse: "buchhaltung@cg-holzbau.at", kurz: "Buchhaltung" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fertiges Beleg-PDF. */
  pdfBlob: Blob | null;
  dateiname: string;
  /** Vorbelegung aus dem Beleg. */
  empfaenger: string;
  belegBezeichnung: string;
  belegNummer: string;
  kundeAnrede?: string;
  kundeName?: string;
}

export function BelegMailDialog({
  open, onOpenChange, pdfBlob, dateiname,
  empfaenger, belegBezeichnung, belegNummer, kundeAnrede, kundeName,
}: Props) {
  const { toast } = useToast();
  const [von, setVon] = useState(POSTFAECHER[0].adresse);
  const [an, setAn] = useState("");
  const [cc, setCc] = useState("");
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAn(empfaenger || "");
    setCc("");
    setBetreff(`${belegBezeichnung} ${belegNummer}`.trim());
    // Anrede aus den Kundendaten ableiten — „Frau Salat" statt „Damen und Herren".
    const nachname = (kundeName || "").trim().split(/\s+/).slice(-1)[0] || "";
    const anrede = kundeAnrede === "Frau" && nachname
      ? `Sehr geehrte Frau ${nachname},`
      : kundeAnrede === "Herr" && nachname
        ? `Sehr geehrter Herr ${nachname},`
        : "Sehr geehrte Damen und Herren,";
    setText(
      `${anrede}\n\n` +
      `anbei erhalten Sie ${belegBezeichnung.toLowerCase().startsWith("a") ? "unser" : "unsere"} ` +
      `${belegBezeichnung} ${belegNummer} als PDF.\n\n` +
      `Bei Fragen stehen wir Ihnen gerne zur Verfügung.\n\n` +
      `Mit freundlichen Grüßen\nHolzbau Groismaier GmbH`,
    );
  }, [open, empfaenger, belegBezeichnung, belegNummer, kundeAnrede, kundeName]);

  const senden = async () => {
    const empfaengerListe = an.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    if (empfaengerListe.length === 0) {
      toast({ title: "Empfänger fehlt", description: "Bitte eine E-Mail-Adresse eintragen.", variant: "destructive" });
      return;
    }
    if (!pdfBlob) {
      toast({ title: "Kein PDF", description: "Der Beleg konnte nicht erzeugt werden.", variant: "destructive" });
      return;
    }
    setSendet(true);
    try {
      // PDF als base64 (ohne data:-Präfix) — so erwartet es Microsoft Graph.
      const base64: string = await new Promise((auf, ab) => {
        const r = new FileReader();
        r.onload = () => auf(String(r.result).split(",")[1] || "");
        r.onerror = () => ab(new Error("PDF konnte nicht gelesen werden"));
        r.readAsDataURL(pdfBlob);
      });

      const { data, error } = await supabase.functions.invoke("mail-postfach", {
        body: {
          aktion: "senden",
          postfach: von,
          modus: "neu",
          an: empfaengerListe,
          cc: cc.split(/[;,]/).map((x) => x.trim()).filter(Boolean),
          betreff,
          text,
          anhaenge: [{ name: dateiname, inhaltBase64: base64, typ: "application/pdf" }],
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Beleg versendet",
        description: `${belegBezeichnung} ${belegNummer} ging an ${empfaengerListe.join(", ")} — die Mail liegt in Outlook unter »Gesendete Elemente«.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Senden fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSendet(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{belegBezeichnung} {belegNummer} per E-Mail senden</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Absender</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={von}
              onChange={(e) => setVon(e.target.value)}
            >
              {POSTFAECHER.map((p) => (
                <option key={p.adresse} value={p.adresse}>{p.adresse}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>An</Label>
            <Input
              value={an}
              onChange={(e) => setAn(e.target.value)}
              placeholder="kunde@firma.at — mehrere mit Beistrich"
              autoFocus={!empfaenger}
            />
            {!empfaenger && (
              <p className="text-[11px] text-amber-600">
                Beim Kunden ist keine E-Mail hinterlegt — bitte eintragen.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>CC (optional)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Betreff</Label>
            <Input value={betreff} onChange={(e) => setBetreff(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nachricht</Label>
            <Textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-kb-blue" />
            <span className="truncate">{dateiname}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {pdfBlob ? `${Math.max(1, Math.round(pdfBlob.size / 1024))} KB` : "wird erzeugt…"}
            </span>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={senden} disabled={sendet || !pdfBlob}>
              {sendet ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Senden
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
