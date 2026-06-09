import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Zap, Package, Minus, Plus } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CustomerSelect, type CustomerData } from "@/components/CustomerSelect";

interface OfferPackage {
  id: string;
  name: string;
  beschreibung: string | null;
}

interface PackageItem {
  id: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  default_menge: number;
  sort_order: number;
}

interface QuickItem {
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  menge: number;
}

interface QuickOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickOfferDialog({ open, onOpenChange }: QuickOfferDialogProps) {
  const [step, setStep] = useState<"package" | "configure">("package");
  const [packages, setPackages] = useState<OfferPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<OfferPackage | null>(null);
  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [mwstSatz, setMwstSatz] = useState(20);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      fetchPackages();
      setStep("package");
      setSelectedPackage(null);
      setSelectedCustomer(null);
      setQuickItems([]);
    }
  }, [open]);

  const fetchPackages = async () => {
    const { data } = await supabase
      .from("offer_packages")
      .select("id, name, beschreibung")
      .order("name");
    if (data) setPackages(data);
  };

  const selectPackage = async (pkg: OfferPackage) => {
    setSelectedPackage(pkg);
    // Load package items
    const { data } = await supabase
      .from("offer_package_items")
      .select("*")
      .eq("package_id", pkg.id)
      .order("sort_order");
    
    if (data) {
      setQuickItems(data.map((item: any) => ({
        beschreibung: item.beschreibung,
        einheit: item.einheit || "Stk.",
        einzelpreis: Number(item.einzelpreis) || 0,
        menge: Number(item.default_menge) || 1,
      })));
    }
    setStep("configure");
  };

  const updateItemMenge = (index: number, menge: number) => {
    setQuickItems(prev => prev.map((item, i) => 
      i === index ? { ...item, menge: Math.max(0, menge) } : item
    ));
  };

  const updateItemPreis = (index: number, einzelpreis: number) => {
    setQuickItems(prev => prev.map((item, i) => 
      i === index ? { ...item, einzelpreis } : item
    ));
  };

  const removeItem = (index: number) => {
    setQuickItems(prev => prev.filter((_, i) => i !== index));
  };

  const nettoSumme = quickItems.reduce((sum, item) => sum + item.menge * item.einzelpreis, 0);
  const mwstBetrag = nettoSumme * (mwstSatz / 100);
  const bruttoSumme = nettoSumme + mwstBetrag;

  const handleCreate = async () => {
    const customerName = selectedCustomer?.name || "";
    if (!customerName) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte Kunden auswählen" });
      return;
    }
    if (quickItems.filter(i => i.menge > 0).length === 0) {
      toast({ variant: "destructive", title: "Fehler", description: "Mindestens eine Position mit Menge > 0" });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      const customerId = selectedCustomer?.id || null;

      // Einheitlicher Nummernkreis wie im Rechnungs-Editor: next_document_number
      // ist zählergestützt (number_ranges) + zeilengesperrt (FOR UPDATE) und
      // prüft auf Eindeutigkeit. Das frühere next_invoice_number (MAX-basiert)
      // lief getrennt → doppelte Nummern. Jetzt nutzen beide Wege denselben Kreis.
      const { data: numData, error: numError } = await supabase.rpc("next_document_number" as never, {
        p_typ: "angebot",
        p_jahr: new Date().getFullYear(),
      } as never);
      if (numError) throw numError;

      const nummer = numData as string;
      const laufnummer = parseInt((nummer.match(/(\d+)$/) || ["", "1"])[1]) || 1;
      const activeItems = quickItems.filter(i => i.menge > 0);
      const netto = activeItems.reduce((s, i) => s + i.menge * i.einzelpreis, 0);
      const mwst = netto * (mwstSatz / 100);
      const brutto = netto + mwst;

      // Create offer
      const { data: newInvoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          typ: "angebot",
          nummer,
          laufnummer,
          jahr: new Date().getFullYear(),
          status: "entwurf",
          kunde_name: customerName,
          kunde_adresse: selectedCustomer?.adresse || null,
          kunde_plz: selectedCustomer?.plz || null,
          kunde_ort: selectedCustomer?.ort || null,
          kunde_land: selectedCustomer?.land || "Österreich",
          kunde_email: selectedCustomer?.email || null,
          kunde_telefon: selectedCustomer?.telefon || null,
          kunde_uid: selectedCustomer?.uid_nummer || null,
          datum: format(new Date(), "yyyy-MM-dd"),
          netto_summe: netto,
          mwst_satz: mwstSatz,
          mwst_betrag: mwst,
          brutto_summe: brutto,
          customer_id: customerId,
          zahlungsbedingungen: "14 Tage netto",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Insert items
      const itemsToInsert = activeItems.map((item, idx) => ({
        invoice_id: newInvoice.id,
        position: idx + 1,
        beschreibung: item.beschreibung,
        kurztext: item.beschreibung,
        langtext: null,
        menge: item.menge,
        einheit: item.einheit,
        einzelpreis: item.einzelpreis,
        gesamtpreis: item.menge * item.einzelpreis,
        produktnummer: null,
        rabatt_prozent: 0,
      }));

      const { error: itemsError } = await supabase.from("invoice_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      toast({ title: "Angebot erstellt!", description: `${nummer} – € ${brutto.toFixed(2)} brutto` });
      onOpenChange(false);
      navigate(`/invoices/${newInvoice.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Schnellangebot erstellen
          </DialogTitle>
        </DialogHeader>

        {step === "package" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Wähle ein Angebotspaket als Vorlage. Du kannst danach Mengen und Preise anpassen.
            </p>
            {packages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="mb-2">Noch keine Angebotspakete erstellt</p>
                <p className="text-xs">Erstelle Pakete unter Rechnungen → Angebotspakete</p>
                <Button className="mt-4" variant="outline" onClick={() => { onOpenChange(false); navigate("/invoices/packages"); }}>
                  Pakete verwalten
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {packages.map(pkg => (
                  <button
                    key={pkg.id}
                    onClick={() => selectPackage(pkg)}
                    className="w-full text-left p-4 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors"
                  >
                    <div className="font-medium">{pkg.name}</div>
                    {pkg.beschreibung && (
                      <div className="text-sm text-muted-foreground mt-1">{pkg.beschreibung}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "configure" && (
          <div className="space-y-5">
            {/* Customer selection */}
            <div className="space-y-2">
              <Label className="font-medium">Kunde</Label>
              <CustomerSelect
                value={selectedCustomer?.id || null}
                onChange={(id, customer) => {
                  setSelectedCustomer(customer);
                }}
                required
              />
            </div>

            {/* Package items */}
            <div className="space-y-2">
              <Label className="font-medium">
                Positionen – {selectedPackage?.name}
                <Button variant="ghost" size="sm" className="ml-2 text-xs" onClick={() => setStep("package")}>
                  Paket wechseln
                </Button>
              </Label>
              <div className="space-y-2">
                {quickItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.beschreibung}</div>
                      <div className="text-xs text-muted-foreground">{item.einheit} × € {item.einzelpreis.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateItemMenge(idx, item.menge - 1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.menge}
                        onChange={e => updateItemMenge(idx, Number(e.target.value))}
                        className="w-20 text-center h-8"
                        min={0}
                        step={0.5}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateItemMenge(idx, item.menge + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-right w-24 text-sm font-medium">
                      € {(item.menge * item.einzelpreis).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Netto</span>
                <span>€ {nettoSumme.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{mwstSatz}% MwSt.</span>
                <span>€ {mwstBetrag.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-1 border-t">
                <span>Brutto</span>
                <span>€ {bruttoSumme.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {step === "configure" && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep("package")}>Zurück</Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              <Zap className="w-4 h-4" />
              {creating ? "Erstelle..." : "Angebot erstellen"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
