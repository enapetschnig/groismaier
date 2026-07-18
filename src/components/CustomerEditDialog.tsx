import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Schnell-Editor für Kunden-Stammdaten (aufgerufen z. B. aus dem
 * Beleg-Editor). KingBill-Look: blaue Toolbar mit Zurück-Knopf und
 * grünem „Speichern & Schließen", darunter das zweispaltige Formular
 * (links Identität, rechts Adresse + Kontakt) wie im Kunden-Editor.
 */

export interface CustomerEditDialogProps {
  open: boolean;
  onClose: () => void;
  customerId: string | null;
  /** Wird aufgerufen nach erfolgreichem Save mit den aktualisierten Kundendaten. */
  onSaved?: (customer: CustomerFields) => void;
}

interface CustomerFields {
  id: string;
  name: string;
  anrede: string | null;
  titel: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  email: string | null;
  telefon: string | null;
  uid_nummer: string | null;
  kundennummer: string | null;
  ansprechpartner: string | null;
}

const EMPTY_FORM: Omit<CustomerFields, "id"> = {
  name: "",
  anrede: "",
  titel: "",
  adresse: "",
  plz: "",
  ort: "",
  land: "Österreich",
  email: "",
  telefon: "",
  uid_nummer: "",
  kundennummer: "",
  ansprechpartner: "",
};

export function CustomerEditDialog({ open, onClose, customerId, onSaved }: CustomerEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });

  useEffect(() => {
    if (!open || !customerId) return;
    setLoading(true);
    supabase
      .from("customers")
      .select("name, anrede, titel, adresse, plz, ort, land, email, telefon, uid_nummer, kundennummer, ansprechpartner")
      .eq("id", customerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d: any = data;
          setForm({
            name: d.name || "",
            anrede: d.anrede || "",
            titel: d.titel || "",
            adresse: d.adresse || "",
            plz: d.plz || "",
            ort: d.ort || "",
            land: d.land || "Österreich",
            email: d.email || "",
            telefon: d.telefon || "",
            uid_nummer: d.uid_nummer || "",
            kundennummer: d.kundennummer || "",
            ansprechpartner: d.ansprechpartner || "",
          });
        }
        setLoading(false);
      });
  }, [open, customerId]);

  const set = <K extends keyof typeof EMPTY_FORM>(k: K, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!customerId || saving) return;
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Name erforderlich" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      anrede: form.anrede || null,
      titel: form.titel.trim() || null,
      adresse: form.adresse.trim() || null,
      plz: form.plz.trim() || null,
      ort: form.ort.trim() || null,
      land: form.land.trim() || null,
      email: form.email.trim() || null,
      telefon: form.telefon.trim() || null,
      uid_nummer: form.uid_nummer.trim() || null,
      kundennummer: form.kundennummer.trim() || null,
      ansprechpartner: form.ansprechpartner.trim() || null,
    };
    const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      setSaving(false);
      return;
    }
    toast({ title: "Kunde gespeichert" });
    onSaved?.({ id: customerId, ...payload } as CustomerFields);
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Kunden bearbeiten</DialogTitle>
        </DialogHeader>
        <KBToolbar
          sticky={false}
          className="rounded-t-md pr-12"
          onBack={onClose}
          backLabel="Schließen ohne Speichern"
          title="Kunden bearbeiten"
          rightActions={
            <KBToolbarButton
              icon={Check}
              label={saving ? "Speichert…" : "Speichern & Schließen"}
              variant="green"
              onClick={handleSave}
              disabled={saving || loading}
            />
          }
        />

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>
        ) : (
          <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {/* ── Linke Spalte: Identität ── */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Kundennummer</Label>
                <Input value={form.kundennummer || ""} onChange={(e) => set("kundennummer", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Anrede</Label>
                  <Select value={form.anrede || "none"} onValueChange={(v) => set("anrede", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="Herr">Herr</SelectItem>
                      <SelectItem value="Frau">Frau</SelectItem>
                      <SelectItem value="Firma">Firma</SelectItem>
                      <SelectItem value="Familie">Familie</SelectItem>
                      <SelectItem value="Divers">Divers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Titel</Label>
                  <Input value={form.titel || ""} onChange={(e) => set("titel", e.target.value)} placeholder="Mag., Dr., Ing." />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Firma / Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Firma oder Name" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Kontaktperson</Label>
                <Input value={form.ansprechpartner || ""} onChange={(e) => set("ansprechpartner", e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">UID-Nummer</Label>
                <Input value={form.uid_nummer || ""} onChange={(e) => set("uid_nummer", e.target.value)} placeholder="ATU..." />
              </div>
            </div>

            {/* ── Rechte Spalte: Adresse + Kontakt ── */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Straße / Nr.</Label>
                <Input value={form.adresse || ""} onChange={(e) => set("adresse", e.target.value)} placeholder="Straße + Hausnr." />
              </div>

              <div className="grid grid-cols-[90px_1fr] gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Plz</Label>
                  <Input value={form.plz || ""} onChange={(e) => set("plz", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ort</Label>
                  <Input value={form.ort || ""} onChange={(e) => set("ort", e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Land</Label>
                <Input value={form.land || ""} onChange={(e) => set("land", e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Telefon</Label>
                <Input value={form.telefon || ""} onChange={(e) => set("telefon", e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">E-Mail</Label>
                <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
