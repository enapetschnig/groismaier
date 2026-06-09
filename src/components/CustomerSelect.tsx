import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CustomerForm,
  EMPTY_CUSTOMER_FORM,
  composeCustomerName,
  type CustomerFormData,
} from "@/components/CustomerForm";

export interface CustomerData {
  id: string;
  name: string;
  anrede?: string;
  titel?: string;
  adresse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  email?: string;
  telefon?: string;
  uid_nummer?: string;
  kundennummer?: string;
  ansprechpartner?: string;
}

interface CustomerSelectProps {
  value: string | null;
  onChange: (customerId: string | null, customer: CustomerData | null) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function CustomerSelect({
  value,
  onChange,
  placeholder = "Kunde auswählen...",
  required = false,
  className,
}: CustomerSelectProps) {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormData>(EMPTY_CUSTOMER_FORM);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const selectedCustomer = customers.find((c) => c.id === value) ?? null;

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase
      .from("customers")
      .select(
        "id, name, anrede, titel, adresse, plz, ort, land, email, telefon, uid_nummer, kundennummer, ansprechpartner"
      )
      .order("name");
    if (data) {
      setCustomers(data as CustomerData[]);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleSelect = (customer: CustomerData) => {
    onChange(customer.id, customer);
    setPopoverOpen(false);
  };

  const handleClear = () => {
    onChange(null, null);
  };

  const handleCreateCustomer = async () => {
    const isGeschaeftlich = customerForm.kundentyp === "geschaeftskunde";
    const displayName = composeCustomerName(customerForm);

    if (!displayName) {
      toast({
        title: isGeschaeftlich ? "Firmenname erforderlich" : "Name erforderlich",
        description: isGeschaeftlich
          ? "Bitte Firmennamen eingeben."
          : "Bitte Vor- und Nachname eingeben.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Fehler", description: "Nicht eingeloggt", variant: "destructive" });
        setSaving(false);
        return;
      }

      const insertData: Record<string, any> = {
        user_id: user.id,
        name: displayName,
        kundentyp: customerForm.kundentyp,
        land: customerForm.land || "Österreich",
      };
      if (isGeschaeftlich) {
        insertData.firmenname = customerForm.firmenname.trim() || null;
        insertData.ansprechpartner = customerForm.ansprechpartner.trim() || null;
      } else {
        insertData.vorname = customerForm.vorname.trim() || null;
        insertData.nachname = customerForm.nachname.trim() || null;
        if (customerForm.anrede) insertData.anrede = customerForm.anrede;
        if (customerForm.titel) insertData.titel = customerForm.titel.trim();
      }
      if (customerForm.adresse) insertData.adresse = customerForm.adresse.trim();
      if (customerForm.plz) insertData.plz = customerForm.plz.trim();
      if (customerForm.ort) insertData.ort = customerForm.ort.trim();
      if (customerForm.email) insertData.email = customerForm.email.trim();
      if (customerForm.telefon) insertData.telefon = customerForm.telefon.trim();
      if (isGeschaeftlich && customerForm.uid_nummer) {
        insertData.uid_nummer = customerForm.uid_nummer.trim();
      }

      const { data, error } = await supabase
        .from("customers")
        .insert(insertData as any)
        .select(
          "id, name, anrede, titel, adresse, plz, ort, land, email, telefon, uid_nummer, kundennummer, ansprechpartner"
        )
        .single();

      if (error) throw error;

      const created = data as CustomerData;
      setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id, created);
      setDialogOpen(false);
      setCustomerForm(EMPTY_CUSTOMER_FORM);
      toast({ title: "Kunde erstellt", description: created.name });
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err.message || "Kunde konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={popoverOpen}
            className={cn(
              "w-full justify-between font-normal",
              !selectedCustomer && "text-muted-foreground",
              className
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <Search className="w-4 h-4 shrink-0" />
              {selectedCustomer ? selectedCustomer.name : placeholder}
            </span>
            {selectedCustomer && (
              <span
                role="button"
                className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Kunde suchen..." />
            <CommandList>
              <CommandEmpty>Kein Kunde gefunden</CommandEmpty>
              <CommandGroup>
                {!required && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      handleClear();
                      setPopoverOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">Kein Kunde</span>
                  </CommandItem>
                )}
                {customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => handleSelect(c)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {value === c.id && (
                        <Check className="w-4 h-4 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        {(c.plz || c.ort) && (
                          <p className="text-xs text-muted-foreground">
                            {[c.plz, c.ort].filter(Boolean).join(" ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  value="__neuer_kunde__"
                  onSelect={() => {
                    setPopoverOpen(false);
                    setCustomerForm(EMPTY_CUSTOMER_FORM);
                    setDialogOpen(true);
                  }}
                  className="text-primary"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Neuer Kunde
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Neuen Kunden erstellen</DialogTitle>
          </DialogHeader>
          <CustomerForm
            value={customerForm}
            onChange={setCustomerForm}
            variant="minimal"
            hideSaveButton
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setCustomerForm(EMPTY_CUSTOMER_FORM);
              }}
            >
              Abbrechen
            </Button>
            <Button onClick={handleCreateCustomer} disabled={saving}>
              {saving ? "Speichern..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
