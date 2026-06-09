import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ContactHistoryTimeline } from "@/components/ContactHistoryTimeline";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { matchesSearch } from "@/lib/searchUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Search, Users, X, Receipt, ArrowLeft } from "lucide-react";
import { getDocConfig } from "@/lib/documentTypes";
import { CustomerForm, EMPTY_CUSTOMER_FORM, composeCustomerName, type CustomerFormData } from "@/components/CustomerForm";
import { PageHeader } from "@/components/PageHeader";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Customer {
  id: string;
  name: string;
  kundennummer: string | null;
  anrede: string | null;
  titel: string | null;
  vorname: string | null;
  nachname: string | null;
  ansprechpartner: string | null;
  uid_nummer: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  email: string | null;
  telefon: string | null;
  telefon2: string | null;
  notizen: string | null;
  kundentyp: string | null;
  firmenname: string | null;
  branche: string | null;
  website: string | null;
  rechnungs_adresse: string | null;
  rechnungs_plz: string | null;
  rechnungs_ort: string | null;
  rechnungs_land: string | null;
  zahlungsbedingungen: string | null;
  skonto_prozent: number | null;
  skonto_tage: number | null;
  nettofrist: number | null;
  herkunft?: string | null;
  wichtige_daten?: any[] | null;
  created_at?: string;
  user_id?: string;
  farbe_bg?: string | null;
  farbe_text?: string | null;
}

interface CustomerInvoice {
  id: string;
  typ: string;
  nummer: string;
  status: string;
  datum: string;
  brutto_summe: number;
}

const emptyForm = {
  name: "",
  kundennummer: "",
  anrede: "",
  titel: "",
  vorname: "",
  nachname: "",
  ansprechpartner: "",
  uid_nummer: "",
  adresse: "",
  plz: "",
  ort: "",
  land: "Österreich",
  email: "",
  telefon: "",
  telefon2: "",
  notizen: "",
  zahlungsbedingungen: "",
  skonto_prozent: 0,
  skonto_tage: 0,
  nettofrist: 0,
  kundentyp: "geschaeftskunde",
  firmenname: "",
  branche: "",
  website: "",
  rechnungs_adresse: "",
  rechnungs_plz: "",
  rechnungs_ort: "",
  rechnungs_land: "",
  herkunft: "",
  wichtige_daten: [] as any[],
};

const statusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  gesendet: "Gesendet",
  bezahlt: "Bezahlt",
  teilbezahlt: "Teilbezahlt",
  storniert: "Storniert",
  abgelehnt: "Abgelehnt",
  angenommen: "Angenommen",
};

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<CustomerInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [typFilter, setTypFilter] = useState<"alle" | "privatkunde" | "geschaeftskunde">("alle");
  const [customerColors, setCustomerColors] = useState<Record<string, { bg: string; text: string }>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*");

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Kunden konnten nicht geladen werden" });
    } else {
      // Sortier-Schlüssel: bei Privat = Nachname, bei Firma = Firmenname.
      // Fallback auf "name" (Legacy-Spalte). Lokal sortieren ist
      // pragmatisch — bei < ~5000 Kunden völlig unkritisch.
      const sorted = ((data as any[]) || []).slice().sort((a, b) => {
        const ka = ((a.kundentyp === "privatkunde" ? a.nachname : a.firmenname) || a.name || "").toLowerCase();
        const kb = ((b.kundentyp === "privatkunde" ? b.nachname : b.firmenname) || b.name || "").toLowerCase();
        return ka.localeCompare(kb, "de");
      });
      setCustomers(sorted as Customer[]);
      // Farben direkt aus customers.farbe_bg / farbe_text ableiten
      const map: Record<string, { bg: string; text: string }> = {};
      ((data as any[]) || []).forEach((c: any) => {
        if (c.farbe_bg && c.farbe_text) {
          map[c.id] = { bg: c.farbe_bg, text: c.farbe_text };
        }
      });
      setCustomerColors(map);
    }
    setLoading(false);
  };

  const fetchCustomerInvoices = async (customerId: string) => {
    setLoadingInvoices(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, typ, nummer, status, datum, brutto_summe")
      .eq("customer_id", customerId)
      .order("datum", { ascending: false });
    setCustomerInvoices(data || []);
    setLoadingInvoices(false);
  };

  const openCustomerDetail = (c: Customer) => {
    setSelectedCustomer(c);
    fetchCustomerInvoices(c.id);
  };

  const filtered = customers.filter(c => {
    if (typFilter !== "alle" && (c as any).kundentyp !== typFilter) return false;
    if (!search.trim()) return true;
    return matchesSearch(c.name, search)
      || matchesSearch(c.ort, search)
      || matchesSearch(c.email, search)
      || matchesSearch((c as any).kundennummer, search)
      || matchesSearch((c as any).firmenname, search)
      || matchesSearch((c as any).uid_nummer, search);
  });

  const openNew = () => {
    setEditId(null);
    // Kundennummer wird vom DB-Trigger (assign_kundennummer_before_insert)
    // beim Speichern aus number_ranges fortlaufend vergeben — Frontend
    // lässt das Feld leer. Vorab-Generierung im Frontend war race-anfällig
    // und nicht synchron mit dem number_ranges-Counter.
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      kundennummer: (c as any).kundennummer || "",
      anrede: (c as any).anrede || "",
      titel: (c as any).titel || "",
      vorname: (c as any).vorname || "",
      nachname: (c as any).nachname || "",
      ansprechpartner: c.ansprechpartner || "",
      uid_nummer: c.uid_nummer || "",
      adresse: c.adresse || "",
      plz: c.plz || "",
      ort: c.ort || "",
      land: c.land || "Österreich",
      email: c.email || "",
      telefon: c.telefon || "",
      telefon2: (c as any).telefon2 || "",
      notizen: c.notizen || "",
      zahlungsbedingungen: (c as any).zahlungsbedingungen || "",
      skonto_prozent: Number((c as any).skonto_prozent) || 0,
      skonto_tage: Number((c as any).skonto_tage) || 0,
      nettofrist: Number((c as any).nettofrist) || 0,
      kundentyp: (c as any).kundentyp || "geschaeftskunde",
      firmenname: (c as any).firmenname || "",
      branche: (c as any).branche || "",
      website: (c as any).website || "",
      rechnungs_adresse: (c as any).rechnungs_adresse || "",
      rechnungs_plz: (c as any).rechnungs_plz || "",
      rechnungs_ort: (c as any).rechnungs_ort || "",
      rechnungs_land: (c as any).rechnungs_land || "",
      herkunft: (c as any).herkunft || "",
      wichtige_daten: Array.isArray((c as any).wichtige_daten) ? (c as any).wichtige_daten : [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Name automatisch aus Kundentyp-Feldern komponieren (firmenname bzw.
    // titel/vorname/nachname). Damit muss der User keinen separaten "Name"
    // eintragen — das Feld bleibt für DB-Backwards-Compat erhalten.
    const composedName = composeCustomerName(form as CustomerFormData);
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

    // E-Mail-Validierung
    if (form.email && form.email.trim()) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
      if (!emailOk) {
        toast({ variant: "destructive", title: "Ungültige E-Mail", description: "Bitte gültige E-Mail-Adresse eingeben (z.B. name@firma.at)" });
        return;
      }
    }

    // Zahlungsbedingungen-Validierung (C-1, C-3, C-4)
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

    // Duplikat-Check Kundennummer
    if (form.kundennummer?.trim()) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("kundennummer", form.kundennummer.trim())
        .neq("id", editId || "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (existing) {
        toast({ variant: "destructive", title: "Kundennummer existiert bereits", description: `Die Nummer ${form.kundennummer} ist bereits vergeben.` });
        return;
      }
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    try {
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

      if (editId) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editId);
        if (error) throw error;
        // Detailansicht sofort aktualisieren, damit sie nach dem Bearbeiten
        // nicht veraltete Daten zeigt.
        if (selectedCustomer?.id === editId) {
          setSelectedCustomer(prev => (prev ? ({ ...prev, ...payload } as Customer) : prev));
        }
        toast({ title: "Gespeichert", description: "Kunde wurde aktualisiert" });
      } else {
        const { data: created, error } = await supabase.from("customers")
          .insert({ user_id: user.id, ...payload })
          .select("kundennummer")
          .single();
        if (error) throw error;
        toast({
          title: "Erstellt",
          description: created?.kundennummer
            ? `Neuer Kunde angelegt — Kundennummer ${created.kundennummer}`
            : "Neuer Kunde wurde angelegt",
        });
      }
      setDialogOpen(false);
      fetchCustomers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Gelöscht", description: "Kunde wurde gelöscht" });
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      fetchCustomers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
  };

  // Customer detail view
  if (selectedCustomer) {
    // Alle zahlbaren Rechnungstypen (auch Anzahlungs-/Schlussrechnung) zählen zum Umsatz.
    // Gutschriften (typ=gutschrift, status=verrechnet) werden abgezogen,
    // damit der Umsatz buchhalterisch sauber den Netto-Effekt zeigt.
    const _payableInvoiceTypes = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);
    const _invoiceLikeTypes = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung", "gutschrift"]);
    const _angebotLikeTypes = new Set(["angebot", "auftragsbestaetigung"]);
    const umsatzPositiv = customerInvoices
      .filter(i => _payableInvoiceTypes.has(i.typ) && i.status === "bezahlt")
      .reduce((sum, i) => sum + Number(i.brutto_summe), 0);
    const umsatzGutschriften = customerInvoices
      .filter(i => i.typ === "gutschrift" && i.status === "verrechnet")
      .reduce((sum, i) => sum + Number(i.brutto_summe), 0);
    const umsatz = umsatzPositiv - umsatzGutschriften;

    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setSelectedCustomer(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{selectedCustomer.name}</h1>
                {(selectedCustomer as any).kundentyp === "privatkunde" && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Privat</span>
                )}
                {(selectedCustomer as any).kundentyp === "geschaeftskunde" && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">Gewerbe</span>
                )}
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(selectedCustomer)}>
                <Pencil className="w-4 h-4 mr-1" /> Bearbeiten
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Umsatz (bezahlt)</CardDescription>
                <CardTitle className="text-2xl text-green-600">€ {umsatz.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Rechnungen</CardDescription>
                <CardTitle className="text-2xl">{customerInvoices.filter(i => _invoiceLikeTypes.has(i.typ)).length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Angebote</CardDescription>
                <CardTitle className="text-2xl">{customerInvoices.filter(i => _angebotLikeTypes.has(i.typ)).length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Contact info */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kontaktdaten</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {(selectedCustomer as any).kundentyp && (
                  <div>
                    <Badge variant={(selectedCustomer as any).kundentyp === "geschaeftskunde" ? "default" : "secondary"}>
                      {(selectedCustomer as any).kundentyp === "geschaeftskunde" ? "Geschäftskunde" : "Privatkunde"}
                    </Badge>
                  </div>
                )}
                {(selectedCustomer as any).firmenname && <div><span className="text-muted-foreground">Firma:</span> {(selectedCustomer as any).firmenname}</div>}
                {(selectedCustomer as any).branche && <div><span className="text-muted-foreground">Branche:</span> {(selectedCustomer as any).branche}</div>}
                {selectedCustomer.ansprechpartner && <div><span className="text-muted-foreground">Ansprechpartner:</span> {selectedCustomer.ansprechpartner}</div>}
                {selectedCustomer.email && <div><span className="text-muted-foreground">E-Mail:</span> {selectedCustomer.email}</div>}
                {selectedCustomer.telefon && <div><span className="text-muted-foreground">Telefon:</span> {selectedCustomer.telefon}</div>}
                {(selectedCustomer as any).website && <div><span className="text-muted-foreground">Website:</span> {(selectedCustomer as any).website}</div>}
                {selectedCustomer.adresse && <div><span className="text-muted-foreground">Adresse:</span> {selectedCustomer.adresse}</div>}
                {(selectedCustomer.plz || selectedCustomer.ort) && (
                  <div><span className="text-muted-foreground">PLZ / Ort:</span> {[selectedCustomer.plz, selectedCustomer.ort].filter(Boolean).join(" ")}</div>
                )}
                {selectedCustomer.uid_nummer && <div><span className="text-muted-foreground">UID:</span> {selectedCustomer.uid_nummer}</div>}
                {(selectedCustomer as any).herkunft && <div><span className="text-muted-foreground">Herkunft:</span> {(selectedCustomer as any).herkunft}</div>}
              </div>
            </CardContent>
          </Card>

          {/* Invoice history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="w-4 h-4" /> Rechnungen & Angebote
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <p className="text-center py-4 text-muted-foreground">Lädt...</p>
              ) : customerInvoices.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">Keine Rechnungen/Angebote für diesen Kunden</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nummer</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerInvoices.map(inv => (
                      <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <TableCell className="font-mono">{inv.nummer}</TableCell>
                        <TableCell>
                          <Badge variant={_invoiceLikeTypes.has(inv.typ) ? "default" : "secondary"}>
                            {getDocConfig(inv.typ).label}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(parseISO(inv.datum), "dd.MM.yyyy", { locale: de })}</TableCell>
                        <TableCell className="text-right font-medium">€ {Number(inv.brutto_summe).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{statusLabels[inv.status] || inv.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Contact History */}
          {selectedCustomer && (
            <ContactHistoryTimeline customerId={selectedCustomer.id} />
          )}
        </div>

        {/* Reuse dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Kunde bearbeiten</DialogTitle>
            </DialogHeader>
            <CustomerForm
              value={form}
              onChange={setForm}
              onSave={handleSave}
              saving={saving}
              editId={editId}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <PageHeader title="Kundenverwaltung" backPath="/" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Gesamt</CardDescription>
              <CardTitle className="text-2xl">{customers.length} Kunden</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div className="flex gap-2 flex-1 flex-wrap items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Kunde suchen..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant={typFilter === "alle" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypFilter("alle")}
                  >Alle</Button>
                  <Button
                    type="button"
                    variant={typFilter === "privatkunde" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypFilter("privatkunde")}
                  >Privat</Button>
                  <Button
                    type="button"
                    variant={typFilter === "geschaeftskunde" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypFilter("geschaeftskunde")}
                  >Gewerbe</Button>
                </div>
              </div>
              <Button onClick={openNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Neuer Kunde
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Lädt...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-semibold mb-1">
                  {search ? "Keine Kunden gefunden" : "Noch keine Kunden"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {search
                    ? "Passe deine Suche an oder lege einen neuen Kunden an."
                    : "Lege deinen ersten Kunden an um Rechnungen und Angebote zu erstellen."}
                </p>
                {!search && (
                  <Button onClick={openNew} className="gap-2">
                    <Plus className="w-4 h-4" /> Ersten Kunden anlegen
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Ansprechpartner</TableHead>
                      <TableHead>Ort</TableHead>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => {
                      const color = customerColors[c.id];
                      const typ = (c as any).kundentyp;
                      return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openCustomerDetail(c)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            {color && (
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color.bg }}
                                title="Kundenfarbe"
                              />
                            )}
                            <span>{c.name}</span>
                            {typ === "privatkunde" && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Privat</span>
                            )}
                            {typ === "geschaeftskunde" && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">Gewerbe</span>
                            )}
                            {c.uid_nummer && <span className="text-xs text-muted-foreground">({c.uid_nummer})</span>}
                          </div>
                        </TableCell>
                        <TableCell>{c.ansprechpartner || "–"}</TableCell>
                        <TableCell>{c.ort ? `${c.plz || ""} ${c.ort}`.trim() : "–"}</TableCell>
                        <TableCell>{c.email || "–"}</TableCell>
                        <TableCell>{c.telefon || "–"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Kunde löschen?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {c.name} wird dauerhaft gelöscht.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Kunde bearbeiten" : "Neuer Kunde"}</DialogTitle>
          </DialogHeader>
          <CustomerForm value={form} onChange={setForm} onSave={handleSave} saving={saving} editId={editId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
