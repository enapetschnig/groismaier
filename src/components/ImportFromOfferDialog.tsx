import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Check } from "lucide-react";

/**
 * Geldbetrag im österreichischen Format: 4.303,50 (statt 4303.50).
 * Gleiche Schreibweise wie im Beleg-Editor (Punkt als Tausendertrenner) —
 * toLocaleString("de-AT") würde ein schmales Leerzeichen setzen.
 */
const eur = (n: number): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00";
  const teile = Math.abs(v).toFixed(2).split(".");
  teile[0] = teile[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (v < 0 ? "-" : "") + teile.join(",");
};


interface OfferItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  rabatt_prozent: number;
  gesamtpreis: number;
  langtext: string | null;
  kurztext: string | null;
  mwst_exempt: boolean;
  produktnummer: string | null;
}

interface Offer {
  id: string;
  nummer: string;
  kunde_name: string;
  kunde_adresse: string | null;
  kunde_plz: string | null;
  kunde_ort: string | null;
  kunde_land: string | null;
  kunde_email: string | null;
  kunde_telefon: string | null;
  kunde_uid: string | null;
  customer_id: string | null;
  status: string;
  datum: string;
  brutto_summe: number;
  project_id: string | null;
}

interface ImportFromOfferDialogProps {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  onImport: (items: OfferItem[], offer: Offer) => void;
}

export function ImportFromOfferDialog({ open, onClose, projectId, onImport }: ImportFromOfferDialogProps) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [offerItems, setOfferItems] = useState<OfferItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (open) {
      fetchOffers();
      setSelectedOfferId(null);
      setOfferItems([]);
    }
  }, [open, projectId]);

  const fetchOffers = async () => {
    setLoading(true);
    let query = supabase
      .from("invoices")
      .select("id, nummer, kunde_name, kunde_adresse, kunde_plz, kunde_ort, kunde_land, kunde_email, kunde_telefon, kunde_uid, customer_id, status, datum, brutto_summe, project_id")
      .eq("typ", "angebot")
      .order("datum", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data } = await query;
    setOffers(data || []);
    setLoading(false);
  };

  const selectOffer = async (offer: Offer) => {
    setSelectedOfferId(offer.id);
    setLoadingItems(true);
    const { data } = await supabase
      .from("invoice_items")
      .select("beschreibung, menge, einheit, einzelpreis, rabatt_prozent, gesamtpreis, langtext, kurztext, mwst_exempt, produktnummer")
      .eq("invoice_id", offer.id)
      .order("position");
    setOfferItems(data || []);
    setLoadingItems(false);
  };

  const handleImport = () => {
    const offer = offers.find(o => o.id === selectedOfferId);
    if (offer && offerItems.length > 0) {
      onImport(offerItems, offer);
    }
  };

  const statusLabels: Record<string, string> = {
    entwurf: "Entwurf",
    gesendet: "Offen",
    angenommen: "Angenommen",
    abgelehnt: "Abgelehnt",
  };

  const statusColors: Record<string, string> = {
    entwurf: "bg-muted text-muted-foreground",
    gesendet: "bg-blue-100 text-blue-800",
    angenommen: "bg-green-100 text-green-800",
    abgelehnt: "bg-red-100 text-red-800",
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Positionen aus Angebot importieren
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt Angebote...</p>
        ) : offers.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            {projectId ? "Keine Angebote für dieses Projekt gefunden" : "Keine Angebote vorhanden"}
          </p>
        ) : (
          <div className="space-y-2">
            {offers.map(offer => (
              <div
                key={offer.id}
                onClick={() => selectOffer(offer)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedOfferId === offer.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedOfferId === offer.id && <Check className="w-4 h-4 text-primary" />}
                    <span className="font-mono font-medium text-sm">{offer.nummer}</span>
                    <Badge className={`text-xs ${statusColors[offer.status] || ""}`}>
                      {statusLabels[offer.status] || offer.status}
                    </Badge>
                  </div>
                  <span className="text-sm font-medium">€ {eur(Number(offer.brutto_summe))}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {offer.kunde_name} · {new Date(offer.datum).toLocaleDateString("de-AT")}
                </div>

                {/* Items Preview */}
                {selectedOfferId === offer.id && (
                  <div className="mt-3 border-t pt-2">
                    {loadingItems ? (
                      <p className="text-xs text-muted-foreground">Lädt Positionen...</p>
                    ) : offerItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine Positionen</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{offerItems.length} Positionen:</p>
                        {offerItems.map((item, idx) => (
                          <div key={idx} className="text-xs flex justify-between">
                            <span className="truncate flex-1">{item.beschreibung}</span>
                            <span className="ml-2 shrink-0">{item.menge} {item.einheit} · € {eur(Number(item.einzelpreis))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={handleImport}
            disabled={!selectedOfferId || offerItems.length === 0}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {offerItems.length > 0 ? `${offerItems.length} Positionen importieren` : "Importieren"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
