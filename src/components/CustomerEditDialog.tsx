import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CustomerForm,
  EMPTY_CUSTOMER_FORM,
  composeCustomerName,
  type CustomerFormData,
} from "@/components/CustomerForm";

/**
 * „Kunde bearbeiten" aus dem Beleg-Editor — die VOLLE KingBill-Kundenmaske
 * (CustomerForm variant="full": zweispaltiges Formular + Reiter Kommentar |
 * Rechnungsadresse | Zahlungsbedingungen | Wichtige Daten), identisch zur
 * Maske der Kunden-Seite. Blaue Toolbar mit Zurück + grünem
 * „Speichern & Schließen" wie im Original.
 *
 * Lädt und speichert den KOMPLETTEN Kundendatensatz (nicht nur die
 * Adressfelder) — dieselben Spalten wie Customers.tsx.
 */

export interface CustomerEditDialogProps {
  open: boolean;
  onClose: () => void;
  customerId: string | null;
  /** Wird aufgerufen nach erfolgreichem Save mit den aktualisierten Kundendaten. */
  onSaved?: (customer: CustomerFields) => void;
}

/** Felder, die der Beleg-Editor als Snapshot übernimmt. */
export interface CustomerFields {
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

export function CustomerEditDialog({ open, onClose, customerId, onSaved }: CustomerEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CustomerFormData>({ ...EMPTY_CUSTOMER_FORM });

  useEffect(() => {
    if (!open || !customerId) return;
    setLoading(true);
    supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const c: any = data;
          setForm({
            name: c.name || "",
            kundennummer: c.kundennummer || "",
            anrede: c.anrede || "",
            titel: c.titel || "",
            vorname: c.vorname || "",
            nachname: c.nachname || "",
            ansprechpartner: c.ansprechpartner || "",
            uid_nummer: c.uid_nummer || "",
            adresse: c.adresse || "",
            plz: c.plz || "",
            ort: c.ort || "",
            land: c.land || "Österreich",
            email: c.email || "",
            telefon: c.telefon || "",
            telefon2: c.telefon2 || "",
            notizen: c.notizen || "",
            zahlungsbedingungen: c.zahlungsbedingungen || "",
            skonto_prozent: Number(c.skonto_prozent) || 0,
            skonto_tage: Number(c.skonto_tage) || 0,
            nettofrist: Number(c.nettofrist) || 0,
            kundentyp: c.kundentyp === "privatkunde" ? "privatkunde" : "geschaeftskunde",
            firmenname: c.firmenname || "",
            branche: c.branche || "",
            website: c.website || "",
            rechnungs_adresse: c.rechnungs_adresse || "",
            rechnungs_plz: c.rechnungs_plz || "",
            rechnungs_ort: c.rechnungs_ort || "",
            rechnungs_land: c.rechnungs_land || "",
            herkunft: c.herkunft || "",
            wichtige_daten: Array.isArray(c.wichtige_daten) ? c.wichtige_daten : [],
          });
        }
        setLoading(false);
      });
  }, [open, customerId]);

  const handleSave = async () => {
    if (!customerId || saving) return;
    // Name aus Kundentyp-Feldern komponieren (wie auf der Kunden-Seite).
    const composedName = composeCustomerName(form);
    if (!composedName) {
      toast({
        variant: "destructive",
        title: "Pflichtfelder fehlen",
        description: form.kundentyp === "geschaeftskunde"
          ? "Firmenname ist erforderlich."
          : "Vor- und Nachname sind erforderlich.",
      });
      return;
    }
    if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast({ variant: "destructive", title: "Ungültige E-Mail", description: "Bitte gültige E-Mail-Adresse eingeben (z.B. name@firma.at)" });
      return;
    }
    // Zahlungsbedingungen-Plausibilität (identisch zur Kunden-Seite).
    const nettofrist = Number(form.nettofrist) || 0;
    const skontoProzent = Number(form.skonto_prozent) || 0;
    const skontoTage = Number(form.skonto_tage) || 0;
    if (nettofrist < 0 || nettofrist > 365) {
      toast({ variant: "destructive", title: "Zahlungsfrist ungültig", description: "Zahlungsfrist muss zwischen 0 und 365 Tagen liegen" });
      return;
    }
    if (skontoProzent < 0 || skontoProzent > 20) {
      toast({ variant: "destructive", title: "Skonto ungültig", description: "Skonto muss zwischen 0 und 20 % liegen" });
      return;
    }
    if (skontoTage < 0 || (nettofrist > 0 && skontoTage > nettofrist)) {
      toast({ variant: "destructive", title: "Skonto-Tage ungültig", description: "Skonto-Tage müssen zwischen 0 und der Zahlungsfrist liegen" });
      return;
    }
    // Duplikat-Check Kundennummer (gegen andere Kunden).
    if (form.kundennummer?.trim()) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("kundennummer", form.kundennummer.trim())
        .neq("id", customerId)
        .maybeSingle();
      if (existing) {
        toast({ variant: "destructive", title: "Kundennummer existiert bereits", description: `Die Nummer ${form.kundennummer} ist bereits vergeben.` });
        return;
      }
    }

    setSaving(true);
    const payload: any = {
      name: composedName,
      kundennummer: form.kundennummer || null,
      anrede: form.anrede || null,
      titel: form.titel || null,
      vorname: form.vorname || null,
      nachname: form.nachname || null,
      ansprechpartner: form.ansprechpartner || null,
      uid_nummer: form.uid_nummer || null,
      adresse: form.adresse || null,
      plz: form.plz || null,
      ort: form.ort || null,
      land: form.land || null,
      email: form.email || null,
      telefon: form.telefon || null,
      telefon2: form.telefon2 || null,
      notizen: form.notizen || null,
      zahlungsbedingungen: form.zahlungsbedingungen || null,
      skonto_prozent: form.skonto_prozent || 0,
      skonto_tage: form.skonto_tage || 0,
      nettofrist: form.nettofrist || 0,
      kundentyp: form.kundentyp || "geschaeftskunde",
      firmenname: form.firmenname || null,
      branche: form.branche || null,
      website: form.website || null,
      rechnungs_adresse: form.rechnungs_adresse || null,
      rechnungs_plz: form.rechnungs_plz || null,
      rechnungs_ort: form.rechnungs_ort || null,
      rechnungs_land: form.rechnungs_land || null,
      herkunft: form.herkunft || null,
      wichtige_daten: form.wichtige_daten || [],
    };
    const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      setSaving(false);
      return;
    }
    toast({ title: "Kunde gespeichert" });
    onSaved?.({
      id: customerId,
      name: composedName,
      anrede: payload.anrede,
      titel: payload.titel,
      adresse: payload.adresse,
      plz: payload.plz,
      ort: payload.ort,
      land: payload.land,
      email: payload.email,
      telefon: payload.telefon,
      uid_nummer: payload.uid_nummer,
      kundennummer: payload.kundennummer,
      ansprechpartner: payload.ansprechpartner,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0" hideClose>
        <DialogHeader className="sr-only">
          <DialogTitle>Kunde bearbeiten</DialogTitle>
        </DialogHeader>
        <KBToolbar
          sticky={false}
          className="rounded-t-md"
          onBack={onClose}
          backLabel="Zurück"
          title="Kunde bearbeiten"
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
          <div className="py-10 text-center text-sm text-muted-foreground">Lädt…</div>
        ) : (
          <div className="p-4 sm:p-5">
            <CustomerForm value={form} onChange={setForm} variant="full" editId={customerId} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
