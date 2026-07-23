import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ContactHistoryTimeline } from "@/components/ContactHistoryTimeline";
import { matchesSearch } from "@/lib/searchUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Users, Receipt, Printer, Filter, ChevronDown, ChevronUp, Check, IdCard, Phone, Mail } from "lucide-react";
import { getDocConfig } from "@/lib/documentTypes";
import { CustomerForm, EMPTY_CUSTOMER_FORM, composeCustomerName, type CustomerFormData } from "@/components/CustomerForm";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
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
  const [form, setForm] = useState<CustomerFormData>({ ...EMPTY_CUSTOMER_FORM });
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<CustomerInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [typFilter, setTypFilter] = useState<"alle" | "privatkunde" | "geschaeftskunde">("alle");
  const [customerColors, setCustomerColors] = useState<Record<string, { bg: string; text: string }>>({});
  // KingBill-Listenmaske: markierte Zeile (Toolbar-Bearbeiten/-Löschen wirken darauf)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // Mobile: linke Filterspalte auf-/zuklappbar (auf lg+ immer sichtbar)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    fetchCustomers();
    // Deep-Links von der KingBill-Hauptmaske: ?q=<Suche>, ?neu=1 (Anlege-Dialog)
    const q = searchParams.get("q");
    if (q) setSearch(q);
    if (searchParams.get("neu") === "1") {
      setEditId(null);
      setForm({ ...EMPTY_CUSTOMER_FORM });
      setDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setForm({ ...EMPTY_CUSTOMER_FORM });
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
      kundentyp: (c as any).kundentyp === "privatkunde" ? "privatkunde" : "geschaeftskunde",
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
      if (selectedId === id) setSelectedId(null);
      fetchCustomers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
  };

  // Toolbar-Aktionen wirken auf die markierte Zeile
  const selectedRow = customers.find(c => c.id === selectedId) || null;

  const editSelected = () => {
    if (selectedRow) openEdit(selectedRow);
  };

  const detailSelected = () => {
    if (selectedRow) openCustomerDetail(selectedRow);
  };

  // Anlege-/Bearbeiten-Dialog im KingBill-Editor-Look („Kunden bearbeiten"):
  // blaue Toolbar mit Zurück + grünem „Speichern & Schließen", darunter das
  // zweispaltige KingBill-Formular mit Tab-Leiste (CustomerForm variant="full").
  const editorDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{editId ? "Kunden bearbeiten" : "Neuer Kunde"}</DialogTitle>
        </DialogHeader>
        <KBToolbar
          sticky={false}
          className="rounded-t-md pr-12"
          onBack={() => setDialogOpen(false)}
          backLabel="Schließen ohne Speichern"
          title={editId ? "Kunden bearbeiten" : "Neuer Kunde"}
          rightActions={
            <KBToolbarButton
              icon={Check}
              label={saving ? "Speichert…" : "Speichern & Schließen"}
              variant="green"
              onClick={handleSave}
              disabled={saving}
            />
          }
        />
        <div className="p-4 sm:p-5">
          <CustomerForm
            value={form}
            onChange={setForm}
            onSave={handleSave}
            saving={saving}
            editId={editId}
            hideSaveButton
          />
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Kunden-Detailansicht (Umsatz / Belege / Kontakt-Historie) ──
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
      <div className="kb-page min-h-screen">
        <KBToolbar
          onBack={() => setSelectedCustomer(null)}
          backLabel="Zurück zur Kundenliste"
          title={selectedCustomer.name}
        >
          <KBToolbarButton icon={Pencil} label="Bearbeiten" onClick={() => openEdit(selectedCustomer)} />
        </KBToolbar>

        <div className="container mx-auto px-4 py-6 max-w-6xl">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {(selectedCustomer as any).kundennummer && (
              <span className="text-sm font-mono font-bold">{(selectedCustomer as any).kundennummer}</span>
            )}
            {(selectedCustomer as any).kundentyp === "privatkunde" && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Privat</span>
            )}
            {(selectedCustomer as any).kundentyp === "geschaeftskunde" && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">Gewerbe</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <CardDescription>Umsatz (bezahlt)</CardDescription>
                <CardTitle className="text-2xl text-green-600">€ {umsatz.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <CardDescription>Rechnungen</CardDescription>
                <CardTitle className="text-2xl">{customerInvoices.filter(i => _invoiceLikeTypes.has(i.typ)).length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <CardDescription>Angebote</CardDescription>
                <CardTitle className="text-2xl">{customerInvoices.filter(i => _angebotLikeTypes.has(i.typ)).length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Contact info */}
          <Card className="kb-panel mb-6">
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
                {selectedCustomer.ansprechpartner && <div><span className="text-muted-foreground">Kontaktperson:</span> {selectedCustomer.ansprechpartner}</div>}
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
          <Card className="kb-panel">
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

        {editorDialog}
      </div>
    );
  }

  // ── KingBill-Listenmaske: Toolbar + linke Filterspalte + Kunden-Grid ──
  return (
    <div className="kb-page min-h-screen">
      {/* Print-CSS: „Liste drucken" druckt nur das Kunden-Grid */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kb-print-area, #kb-print-area * { visibility: visible; }
          #kb-print-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; border-radius: 0; }
          #kb-print-area .overflow-x-auto { overflow: visible !important; }
        }
      `}</style>

      {/* KingBill-Toolbar: [Zurück] [+ Neu] [Bearbeiten] [Löschen] [Detailblatt] [Liste drucken] */}
      {/*
        Die zeilenabhängigen Aktionen (Bearbeiten/Löschen/Detailblatt) und
        „Liste drucken" sind am Handy ausgeblendet: dort gibt es keine markierte
        Tabellenzeile, sondern Karten mit eigenen Aktionen. Sonst würde die
        Toolbar am Handy 5 Zeilen hoch werden und den halben Bildschirm fressen.
      */}
      <KBToolbar onBack={() => navigate("/")} title="Kunden">
        <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Neu" onClick={openNew} />
        <KBToolbarButton
          className="hidden md:inline-flex"
          icon={Pencil}
          label="Bearbeiten"
          onClick={editSelected}
          disabled={!selectedRow}
          title={selectedRow ? `${selectedRow.name} bearbeiten` : "Zuerst eine Zeile markieren"}
        />
        <KBToolbarButton
          className="hidden md:inline-flex"
          icon={Trash2}
          label="Löschen"
          onClick={() => selectedRow && setDeleteDialogOpen(true)}
          disabled={!selectedRow}
          title={selectedRow ? `${selectedRow.name} löschen` : "Zuerst eine Zeile markieren"}
        />
        <KBToolbarButton
          className="hidden md:inline-flex"
          icon={IdCard}
          label="Detailblatt"
          onClick={detailSelected}
          disabled={!selectedRow}
          title={selectedRow ? `Umsatz & Belege von ${selectedRow.name}` : "Zuerst eine Zeile markieren"}
        />
        <KBToolbarButton className="hidden md:inline-flex" icon={Printer} label="Liste drucken" onClick={() => window.print()} />
      </KBToolbar>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-[1600px]">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-4">

          {/* ── Linke KingBill-Filterspalte ── */}
          <aside className="kb-panel w-full lg:w-64 shrink-0 p-3 print:hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            {/* Mobile: Filterspalte auf-/zuklappen */}
            <button
              type="button"
              className="kb-btn min-h-[44px] w-full justify-between lg:hidden"
              onClick={() => setFiltersOpen(o => !o)}
              aria-expanded={filtersOpen}
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-kb-blue-dark" />
                Filter & Suche
              </span>
              {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            <div className={`${filtersOpen ? "flex" : "hidden"} lg:flex flex-col gap-3 mt-3 lg:mt-0`}>
              {/* Suche */}
              <input
                type="search"
                className="kb-input"
                placeholder="Suche… (Name, Nummer, Ort, UID)"
                aria-label="Kunden durchsuchen"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {/* Gruppe filtern (Kundentyp) */}
              <Select value={typFilter} onValueChange={(v) => setTypFilter(v as typeof typFilter)}>
                <SelectTrigger className="w-full h-9" aria-label="Gruppe filtern">
                  <SelectValue placeholder="Gruppe filtern…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Gruppen</SelectItem>
                  <SelectItem value="privatkunde">Privatkunden</SelectItem>
                  <SelectItem value="geschaeftskunde">Geschäftskunden</SelectItem>
                </SelectContent>
              </Select>

              {/* Anzahl-Zähler wie im KingBill-Original */}
              <div className="border-t border-border pt-2 text-sm font-bold">
                Anzahl Kunden: {loading ? "…" : filtered.length}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Zeile anklicken = markieren, Doppelklick = bearbeiten.
              </p>
            </div>
          </aside>

          {/* ── Kunden-Grid rechts (zugleich Druckbereich) ── */}
          <section id="kb-print-area" className="kb-panel flex-1 min-w-0 overflow-hidden">
            {/* Druck-Kopf: nur beim „Liste drucken" sichtbar */}
            <div className="hidden print:block px-4 pt-4">
              <h2 className="text-lg font-bold">Kundenliste</h2>
              <p className="text-xs text-muted-foreground">Anzahl Kunden: {filtered.length}</p>
            </div>
            <div className="p-2 sm:p-3">
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
                    <button type="button" className="kb-btn mx-auto" onClick={openNew}>
                      <Plus className="w-4 h-4 text-kb-green" /> Ersten Kunden anlegen
                    </button>
                  )}
                </div>
              ) : (
                <>
                {/*
                  ── Mobil (< md): Karten statt Tabelle ──
                  Die 9-spaltige Tabelle ist am Handy unlesbar (abgeschnittene
                  Spalten). Kundenwunsch: „so einfach wie möglich am Handy zu
                  bedienen, mit den Cards wie vorher". Tippen = bearbeiten
                  (entspricht dem Doppelklick am Desktop).
                */}
                <ul className="flex flex-col gap-2 md:hidden print:hidden">
                  {filtered.map((c) => {
                    const color = customerColors[c.id];
                    const typ = (c as any).kundentyp;
                    return (
                      <li key={c.id}>
                        <div className="kb-panel p-3">
                          <button
                            type="button"
                            className="min-h-[44px] w-full text-left"
                            onClick={() => { setSelectedId(c.id); openEdit(c); }}
                          >
                            <div className="flex items-start gap-2">
                              {color && (
                                <span
                                  className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: color.bg }}
                                  title="Kundenfarbe"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-bold leading-tight break-words">{c.name}</p>
                                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                  {(c as any).kundennummer || "–"}
                                </p>
                              </div>
                              {typ === "privatkunde" && (
                                <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] uppercase text-blue-800">Privat</span>
                              )}
                              {typ === "geschaeftskunde" && (
                                <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] uppercase text-purple-800">Gewerbe</span>
                              )}
                            </div>
                            {(c.adresse || c.plz || c.ort) && (
                              <p className="mt-1.5 text-sm text-muted-foreground break-words">
                                {[c.adresse, [c.plz, c.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                              </p>
                            )}
                          </button>
                          <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                            {c.telefon && (
                              <a
                                href={`tel:${c.telefon.replace(/\s/g, "")}`}
                                className="kb-btn min-h-[44px] flex-1 justify-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="h-4 w-4 text-kb-blue-dark" /> Anrufen
                              </a>
                            )}
                            {c.email && (
                              <a
                                href={`mailto:${c.email}`}
                                className="kb-btn min-h-[44px] flex-1 justify-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Mail className="h-4 w-4 text-kb-blue-dark" /> E-Mail
                              </a>
                            )}
                            <button
                              type="button"
                              className="kb-btn min-h-[44px] flex-1 justify-center"
                              onClick={() => { setSelectedId(c.id); openCustomerDetail(c); }}
                            >
                              <IdCard className="h-4 w-4 text-kb-blue-dark" /> Detailblatt
                            </button>
                            {/* Löschen bewusst klein + rechts abgesetzt (Fehlgriff-Schutz);
                                die Sicherheitsabfrage kommt wie am Desktop. */}
                            <button
                              type="button"
                              aria-label={`${c.name} löschen`}
                              title={`${c.name} löschen`}
                              className="kb-btn min-h-[44px] w-11 shrink-0 justify-center"
                              onClick={() => { setSelectedId(c.id); setDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="hidden overflow-x-auto md:block print:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {/* Status-Punkt (KingBill-Grid) — neutral grau, es gibt keinen Kundenstatus */}
                        <TableHead className="w-8"><span className="sr-only">Status</span></TableHead>
                        <TableHead>Kundennummer</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead>Adresse</TableHead>
                        <TableHead>Plz</TableHead>
                        <TableHead>Ort</TableHead>
                        <TableHead>Telefon</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Gruppe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => {
                        const color = customerColors[c.id];
                        const typ = (c as any).kundentyp;
                        const isSelected = selectedId === c.id;
                        return (
                          <TableRow
                            key={c.id}
                            aria-selected={isSelected}
                            className={`cursor-pointer ${isSelected ? "bg-kb-blue/15 hover:bg-kb-blue/20" : "hover:bg-muted/50"}`}
                            onClick={() => setSelectedId(c.id)}
                            onDoubleClick={() => openEdit(c)}
                          >
                            <TableCell className="w-8">
                              <span className="block h-2.5 w-2.5 rounded-full bg-gray-400" title="Kunde" />
                            </TableCell>
                            <TableCell className="font-mono font-medium whitespace-nowrap">{(c as any).kundennummer || "–"}</TableCell>
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
                                {c.uid_nummer && <span className="text-xs text-muted-foreground">({c.uid_nummer})</span>}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate">{c.adresse || "–"}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.plz || "–"}</TableCell>
                            <TableCell>{c.ort || "–"}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.telefon || "–"}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{c.email || "–"}</TableCell>
                            <TableCell>
                              {typ === "privatkunde" && (
                                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Privat</span>
                              )}
                              {typ === "geschaeftskunde" && (
                                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">Gewerbe</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Löschen-Bestätigung für die markierte Zeile */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kunde löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRow ? `${selectedRow.name} wird dauerhaft gelöscht.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (selectedRow) handleDelete(selectedRow.id); setDeleteDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editorDialog}
    </div>
  );
}
