import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, Receipt, AlertTriangle, Download, Archive, ArchiveRestore, Trash2, FileDown, Printer, Settings, MoreHorizontal, ChevronDown, ChevronUp, Undo2, Truck, Plus, Filter, Pencil, Copy as CopyIcon, CircleDot } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { matchesSearch } from "@/lib/searchUtils";
import { loadInvoiceLogo } from "@/lib/logoLoader";
import { formatDateShort } from "@/lib/dateFormat";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, parseISO, isBefore } from "date-fns";
import { de } from "date-fns/locale";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { ExportInvoicesDialog } from "@/components/ExportInvoicesDialog";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { DokumentKopierenDialog, KOPIER_OPTIONEN_KEY } from "@/components/DokumentKopierenDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { type InvoiceLayoutSettings, DEFAULT_LAYOUT, parseLayoutSettings } from "@/lib/invoiceLayoutTypes";

interface Invoice {
  id: string;
  typ: string;
  nummer: string;
  status: string;
  kunde_name: string;
  datum: string;
  brutto_summe: number;
  netto_summe: number;
  project_id: string | null;
  faellig_am: string | null;
  mahnstufe: number;
  gueltig_bis: string | null;
  bezahlt_betrag: number;
  archiviert: boolean;
}

const statusColors: Record<string, string> = {
  entwurf: "bg-muted text-muted-foreground",
  offen: "bg-blue-100 text-blue-800",
  bezahlt: "bg-green-100 text-green-800",
  teilbezahlt: "bg-yellow-100 text-yellow-800",
  storniert: "bg-red-100 text-red-800",
  abgelehnt: "bg-red-100 text-red-800",
  angenommen: "bg-[#002337]/10 text-[#002337] border border-[#002337]/20",
  verrechnet: "bg-purple-100 text-purple-800",
};

const statusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  offen: "Offen",
  bezahlt: "Bezahlt",
  teilbezahlt: "Teilbezahlt",
  storniert: "Storniert",
  abgelehnt: "Abgelehnt",
  angenommen: "Angenommen",
  verrechnet: "Verrechnet",
};

// Rechnung: Kein Entwurf zurück, kein Storniert von außen (nur in Detail-Ansicht)
const rechnungStatuses = ["offen", "teilbezahlt", "bezahlt"];
const angebotStatuses = ["entwurf", "offen", "angenommen", "abgelehnt", "verrechnet"];
// Auftragsbestätigung IST das angenommene Angebot → angenommen/abgelehnt sind redundant.
const abStatuses = ["offen", "verrechnet"];
// Lieferschein: preislos. "verrechnet" = in einer Rechnung aufgegangen.
const lieferscheinStatuses = ["entwurf", "offen", "verrechnet"];
// Gutschrift = Auszahlung an Kunden. "teilbezahlt/bezahlt" passt nicht;
// "verrechnet" markiert, dass die Gutschrift mit einer Rechnung verrechnet wurde.
const gutschriftStatuses = ["offen", "verrechnet"];
// Zahlbare Rechnungstypen (Kunde → wir). Gutschrift bewusst ausgeschlossen.
const PAYABLE_INVOICE_TYPES = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);
// Alle rechnungs-artigen Typen (inkl. Gutschrift) für Umsatz-/Liste-Filter.
const INVOICE_LIKE_TYPES = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung", "gutschrift"]);
const ANGEBOT_LIKE_TYPES = new Set(["angebot", "auftragsbestaetigung"]);

// Gültige ?tab=-Werte (die Hauptmaske verlinkt mit ?tab=angebot|rechnung|lieferschein).
const VALID_TABS = ["rechnung", "angebot", "lieferschein", "storno"];

/** Kompakte Kennzahl-Zeile für die linke KingBill-Filterspalte. */
function KBStat({ label, value, valueClass = "" }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border bg-muted/40 px-2.5 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

// Typ-Kürzel + Farbe für das Badge (Liste + Karten verwenden dieselben Werte).
const TYP_BADGE_STYLES: Record<string, string> = {
  angebot: "bg-blue-100 text-blue-800 border-blue-300",
  auftragsbestaetigung: "bg-indigo-100 text-indigo-800 border-indigo-300",
  rechnung: "bg-green-100 text-green-800 border-green-300",
  anzahlungsrechnung: "bg-orange-100 text-orange-800 border-orange-300",
  schlussrechnung: "bg-emerald-100 text-emerald-900 border-emerald-400",
  lieferschein: "bg-amber-100 text-amber-800 border-amber-300",
  gutschrift: "bg-purple-100 text-purple-800 border-purple-300",
};
const TYP_BADGE_LABELS: Record<string, string> = {
  angebot: "AN", auftragsbestaetigung: "AB", rechnung: "RE",
  anzahlungsrechnung: "AR", schlussrechnung: "SR",
  lieferschein: "LS", gutschrift: "GS",
};
const TYP_TITLES: Record<string, string> = {
  angebot: "Angebot", auftragsbestaetigung: "Auftragsbestätigung", rechnung: "Rechnung",
  anzahlungsrechnung: "Anzahlungsrechnung", schlussrechnung: "Schlussrechnung",
  lieferschein: "Lieferschein", gutschrift: "Gutschrift",
};

/** Typ-Badge (AN/AB/RE/…) — identisch in Tabelle und Karte. */
function TypBadge({ typ }: { typ: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded border min-w-[28px] ${TYP_BADGE_STYLES[typ] || "bg-muted text-foreground border-border"}`}
      title={TYP_TITLES[typ] || typ}
    >
      {TYP_BADGE_LABELS[typ] || typ.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function Invoices() {
  // Query-Params: ?tab= wählt die Belegart, ?q= füllt die Suche,
  // ?status= setzt den Status-Filter (Verlinkung von der Hauptmaske).
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTyp, setFilterTyp] = useState<string>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : "rechnung"
  );
  const [filterStatus, setFilterStatus] = useState<string>(searchParams.get("status") || "alle");
  // Mobile: linke Filterspalte auf-/zuklappbar (auf lg+ immer sichtbar)
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Sub-Typ-Filter innerhalb der Rechnungen- bzw. Angebote-Tabs.
  //   "alle" = keine weitere Einschränkung
  //   sonst = exakter invoices.typ-Wert
  const [filterSubTyp, setFilterSubTyp] = useState<string>("alle");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [showArchive, setShowArchive] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  // KingBill-Auswahlmodell: Klick markiert die Zeile (gelb), Doppelklick
  // öffnet den Beleg; die Toolbar-Aktionen (Bearbeiten / Kopieren in … /
  // Status ändern / Kommentare / Löschen) wirken auf die markierte Zeile.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kommentarOpen, setKommentarOpen] = useState(false);
  const [kommentarText, setKommentarText] = useState("");
  // „Kopieren in …": erst der KingBill-Dialog „Was soll kopiert werden?",
  // dann Navigation in den from_doc-Kopierfluss mit den gewählten Optionen.
  const [kopierenZielTyp, setKopierenZielTyp] = useState<string | null>(null);
  const [bankKontoinhaber, setBankKontoinhaber] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [bankBic, setBankBic] = useState("");
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [createProjectForInvoiceId, setCreateProjectForInvoiceId] = useState<string | null>(null);
  const [createProjectDefaults, setCreateProjectDefaults] = useState({ name: "", customerName: "", customerId: null as string | null, adresse: "", plz: "", ort: "", email: "", telefon: "", uidNummer: "", anrede: "", titel: "" });
  // Projekt-Namen (id → name) für die Projekt-Spalte im Lieferscheine-Tab.
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [invoiceLayout, setInvoiceLayout] = useState<InvoiceLayoutSettings>(DEFAULT_LAYOUT);

  // Payment dialog for status change to teilbezahlt/bezahlt
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("bezahlt");
  const [paymentBetrag, setPaymentBetrag] = useState("");
  const [paymentDatum, setPaymentDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentNotiz, setPaymentNotiz] = useState("");
  const [existingPayments, setExistingPayments] = useState<{ betrag: number; datum: string; notizen: string | null; created_at: string }[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
    fetchNumberSettings();
    fetchProjectNames();
  }, []);

  const fetchProjectNames = async () => {
    const { data } = await supabase.from("projects").select("id, name");
    if (data) setProjectNames(Object.fromEntries((data as { id: string; name: string }[]).map(p => [p.id, p.name])));
  };

  const fetchNumberSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "invoice_layout"]);
    if (data) {
      data.forEach(s => {
        if (s.key === "bank_kontoinhaber") setBankKontoinhaber(s.value);
        if (s.key === "bank_iban") setBankIban(s.value);
        if (s.key === "bank_bic") setBankBic(s.value);
        if (s.key === "invoice_layout") setInvoiceLayout(parseLayoutSettings(s.value));
      });
    }
  };

  // Tab-Wechsel per Klick: Sub-Typ + Status-Filter zurücksetzen.
  // (Bewusst kein Effekt auf filterTyp — sonst würde ein per ?status=
  // gesetzter Filter beim Mount sofort wieder überschrieben.)
  const selectTab = (tab: string) => {
    setFilterTyp(tab);
    setFilterSubTyp("alle");
    setFilterStatus("alle");
  };

  // Späte Query-Param-Änderungen (z. B. erneute Navigation auf /invoices?…)
  // weiter auf die Filter anwenden.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && VALID_TABS.includes(tab)) setFilterTyp(tab);
    const q = searchParams.get("q");
    if (q !== null) setSearchQuery(q);
    const status = searchParams.get("status");
    if (status) setFilterStatus(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchInvoices = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, typ, nummer, status, kunde_name, datum, brutto_summe, netto_summe, project_id, faellig_am, mahnstufe, gueltig_bis, bezahlt_betrag, archiviert, storno_nummer, storno_datum, kundennummer, betreff, kunde_adresse, kunde_plz, kunde_ort, leistungsdatum, leistungsdatum_bis, lieferadresse, notizen")
      .order("datum", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnungen konnten nicht geladen werden" });
    } else {
      setInvoices(((data as any[]) || []).map(d => ({ ...d, mahnstufe: (d as any).mahnstufe || 0, gueltig_bis: (d as any).gueltig_bis || null, bezahlt_betrag: Number((d as any).bezahlt_betrag) || 0, archiviert: !!(d as any).archiviert })));
    }
    setLoading(false);
  };

  const handleStatusChange = async (invoiceId: string, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    // Prevent invalid backward status transitions
    const terminalStatuses = ["storniert", "bezahlt", "verrechnet"];
    if (terminalStatuses.includes(inv.status)) {
      toast({ variant: "destructive", title: "Status kann nicht geändert werden", description: `Status "${statusLabels[inv.status]}" ist endgültig` });
      return;
    }
    // Prevent backward transitions from jeglichen Zahlungs-Status
    if ((inv.status === "teilbezahlt" || inv.status === "bezahlt") &&
        (newStatus === "offen" || newStatus === "entwurf")) {
      toast({ variant: "destructive", title: "Nicht möglich", description: `Status kann nicht von "${statusLabels[inv.status]}" auf "${statusLabels[newStatus]}" zurückgesetzt werden` });
      return;
    }

    // For teilbezahlt/bezahlt: open payment dialog first — NUR für echte
    // zahlbare Rechnungen (nicht Gutschrift, nicht Angebot/AB).
    if ((newStatus === "teilbezahlt" || newStatus === "bezahlt") && PAYABLE_INVOICE_TYPES.has(inv.typ)) {
      setPaymentInvoiceId(invoiceId);
      setPaymentStatus(newStatus);
      setPaymentBetrag(newStatus === "bezahlt" && inv ? String((inv.brutto_summe - (inv.bezahlt_betrag || 0)).toFixed(2)) : "");
      setPaymentDatum(format(new Date(), "yyyy-MM-dd"));
      setPaymentNotiz("");
      // Load existing payments
      const { data: payments } = await supabase
        .from("invoice_payments")
        .select("betrag, datum, notizen, created_at")
        .eq("invoice_id", invoiceId)
        .order("datum", { ascending: true });
      setExistingPayments(payments || []);
      setPaymentDialogOpen(true);
      return;
    }

    const { error } = await supabase.from("invoices").update({ status: newStatus }).eq("id", invoiceId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Status konnte nicht geändert werden" });
      return;
    }

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: newStatus } : inv));
    toast({ title: "Status geändert", description: `Status auf "${statusLabels[newStatus]}" gesetzt` });

    // When offer is accepted → open CreateProjectDialog
    if (newStatus === "angenommen") {
      const inv = invoices.find(i => i.id === invoiceId);
      if (inv && !inv.project_id) {
        const { data: fullInv } = await supabase
          .from("invoices")
          .select("kunde_name, kunde_adresse, kunde_plz, kunde_ort, customer_id, kunde_email, kunde_telefon, kunde_uid, kunde_anrede, kunde_titel")
          .eq("id", invoiceId)
          .single();

        if (fullInv) {
          setCreateProjectForInvoiceId(invoiceId);
          setCreateProjectDefaults({
            name: `${fullInv.kunde_name} - ${inv.nummer}`,
            customerName: fullInv.kunde_name || "",
            customerId: fullInv.customer_id || null,
            adresse: fullInv.kunde_adresse || "",
            plz: fullInv.kunde_plz || "",
            ort: fullInv.kunde_ort || "",
            email: (fullInv as any).kunde_email || "",
            telefon: (fullInv as any).kunde_telefon || "",
            uidNummer: (fullInv as any).kunde_uid || "",
            anrede: (fullInv as any).kunde_anrede || "",
            titel: (fullInv as any).kunde_titel || "",
          });
          setCreateProjectDialogOpen(true);
        }
      }
    }
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPdf = async (invoiceId: string, nummer: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingId(invoiceId);
    try {
      // Load invoice + items + bank data
      const [{ data: inv }, { data: invItems }, { data: bankSettings }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"),
        supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid"]),
      ]);
      if (!inv) throw new Error("Rechnung nicht gefunden");

      const bank = { kontoinhaber: "", iban: bankIban, bic: bankBic };
      let firmenUid = "";
      if (bankSettings) {
        bankSettings.forEach((s: any) => {
          if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
          if (s.key === "bank_iban") bank.iban = s.value;
          if (s.key === "bank_bic") bank.bic = s.value;
          if (s.key === "firmen_uid") firmenUid = s.value;
        });
      }

      // Load logo (prüft Custom-Logo aus Admin, fällt zurück auf Default)
      const logoUri = await loadInvoiceLogo();

      // QR code for invoices
      let qrUri: string | undefined;
      const { generateEpcQrCode } = await import("@/lib/invoiceHtml");
      if (PAYABLE_INVOICE_TYPES.has(inv.typ) && Number(inv.brutto_summe) > 0) {
        try { qrUri = await generateEpcQrCode(Number(inv.brutto_summe), inv.nummer || "", bank); } catch {}
      }

      const { generateInvoicePdf } = await import("@/lib/pdfGenerator");
      const { loadDocumentTexts, applyDocumentTextsToInvoice } = await import("@/lib/documentTextsLoader");
      const docTexts = await loadDocumentTexts(inv.typ);
      const tageMatchDL = (inv.zahlungsbedingungen || "").match(/\d+/);
      const invoiceWithTexts = applyDocumentTextsToInvoice({
        // KOMPLETTE Zeile spreaden — so kommen auch die neuen Felder
        // (referenz, zeige_faelligkeit, zahlungstext, custom_*_text,
        // lieferadresse, kunde_kontaktperson, kundennummer) mit aufs PDF
        // und beleg-eigene Texte werden nicht mehr überschrieben (Audit).
        ...(inv as any),
        kunde_anrede: inv.kunde_anrede || "", kunde_titel: inv.kunde_titel || "", reverse_charge: inv.reverse_charge || false,
        netto_summe: Number(inv.netto_summe), mwst_satz: Number(inv.mwst_satz),
        mwst_betrag: Number(inv.mwst_betrag), brutto_summe: Number(inv.brutto_summe),
        bezahlt_betrag: Number(inv.bezahlt_betrag), rabatt_prozent: Number(inv.rabatt_prozent),
        rabatt_betrag: Number(inv.rabatt_betrag), mahnstufe: Number(inv.mahnstufe),
        skonto_prozent: Number(inv.skonto_prozent || 0), skonto_tage: Number(inv.skonto_tage || 0),
        anzahlung_prozent: Number((inv as any).anzahlung_prozent || 0) || undefined,
      }, docTexts, { tage: tageMatchDL ? Number(tageMatchDL[0]) : 14 });
      const pdfBlob = await generateInvoicePdf(
        invoiceWithTexts,
        (invItems || []).map((it: any) => ({
          position: it.position, beschreibung: it.beschreibung,
          kurztext: it.kurztext || it.beschreibung, langtext: it.langtext || "",
          menge: Number(it.menge), einheit: it.einheit || "Stk.",
          einzelpreis: Number(it.einzelpreis), gesamtpreis: Number(it.gesamtpreis),
          // Positionsrabatt + Gruppen-/Sichtbarkeits-Felder MÜSSEN mit,
          // sonst druckt der Generator falsche Summen bzw. Aufbauten doppelt.
          rabatt_prozent: Number(it.rabatt_prozent) || 0,
          produktnummer: it.produktnummer || "",
          gruppe: it.gruppe || null,
          auf_pdf: it.auf_pdf !== false,
          ist_gruppensumme: !!it.ist_gruppensumme,
          mwst_exempt: !!(it as any).mwst_exempt,
        })),
        bank, logoUri, qrUri, firmenUid, invoiceLayout
      );

      // Direct download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nummer}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("PDF download error:", err);
      toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht erstellt werden" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrintPdf = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Generate real PDF using jsPDF (same as download)
      const [{ data: inv }, { data: invItems }, { data: settings }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"),
        supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid"]),
      ]);
      if (!inv) throw new Error("Nicht gefunden");

      const bank = { kontoinhaber: bankKontoinhaber, iban: bankIban, bic: bankBic };
      let firmenUid = "";
      settings?.forEach((s: any) => {
        if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
        if (s.key === "bank_iban") bank.iban = s.value;
        if (s.key === "bank_bic") bank.bic = s.value;
        if (s.key === "firmen_uid") firmenUid = s.value;
      });

      const logoUri = await loadInvoiceLogo();

      let qrUri: string | undefined;
      if (PAYABLE_INVOICE_TYPES.has(inv.typ) && Number(inv.brutto_summe) > 0) {
        try {
          const { generateEpcQrCode } = await import("@/lib/invoiceHtml");
          qrUri = await generateEpcQrCode(Number(inv.brutto_summe), inv.nummer || "", bank);
        } catch {}
      }

      const { generateInvoicePdf } = await import("@/lib/pdfGenerator");
      const { loadDocumentTexts, applyDocumentTextsToInvoice } = await import("@/lib/documentTextsLoader");
      const docTexts = await loadDocumentTexts(inv.typ);
      const tageMatchDL = (inv.zahlungsbedingungen || "").match(/\d+/);
      const invoiceWithTexts = applyDocumentTextsToInvoice({
        // KOMPLETTE Zeile spreaden — so kommen auch die neuen Felder
        // (referenz, zeige_faelligkeit, zahlungstext, custom_*_text,
        // lieferadresse, kunde_kontaktperson, kundennummer) mit aufs PDF
        // und beleg-eigene Texte werden nicht mehr überschrieben (Audit).
        ...(inv as any),
        kunde_anrede: inv.kunde_anrede || "", kunde_titel: inv.kunde_titel || "", reverse_charge: inv.reverse_charge || false,
        netto_summe: Number(inv.netto_summe), mwst_satz: Number(inv.mwst_satz),
        mwst_betrag: Number(inv.mwst_betrag), brutto_summe: Number(inv.brutto_summe),
        bezahlt_betrag: Number(inv.bezahlt_betrag), rabatt_prozent: Number(inv.rabatt_prozent),
        rabatt_betrag: Number(inv.rabatt_betrag), mahnstufe: Number(inv.mahnstufe),
        skonto_prozent: Number(inv.skonto_prozent || 0), skonto_tage: Number(inv.skonto_tage || 0),
        anzahlung_prozent: Number((inv as any).anzahlung_prozent || 0) || undefined,
      }, docTexts, { tage: tageMatchDL ? Number(tageMatchDL[0]) : 14 });
      const pdfBlob = await generateInvoicePdf(
        invoiceWithTexts,
        (invItems || []).map((it: any) => ({
          position: it.position, beschreibung: it.beschreibung,
          kurztext: it.kurztext || it.beschreibung, langtext: it.langtext || "",
          menge: Number(it.menge), einheit: it.einheit || "Stk.",
          einzelpreis: Number(it.einzelpreis), gesamtpreis: Number(it.gesamtpreis),
          // Positionsrabatt + Gruppen-/Sichtbarkeits-Felder MÜSSEN mit,
          // sonst druckt der Generator falsche Summen bzw. Aufbauten doppelt.
          rabatt_prozent: Number(it.rabatt_prozent) || 0,
          produktnummer: it.produktnummer || "",
          gruppe: it.gruppe || null,
          auf_pdf: it.auf_pdf !== false,
          ist_gruppensumme: !!it.ist_gruppensumme,
          mwst_exempt: !!(it as any).mwst_exempt,
        })),
        bank, logoUri, qrUri, firmenUid, invoiceLayout
      );

      // Open PDF in new tab for printing
      const url = URL.createObjectURL(pdfBlob);
      const win = window.open(url, "_blank");
      if (win) {
        win.addEventListener("load", () => {
          setTimeout(() => win.print(), 500);
        });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Drucken fehlgeschlagen" });
    }
  };

  const handleArchive = async (invoiceId: string, archive: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("invoices").update({ archiviert: archive }).eq("id", invoiceId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler" });
    } else {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, archiviert: archive } : inv));
      toast({ title: archive ? "Archiviert" : "Wiederhergestellt" });
    }
  };

  const handleDelete = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv && inv.status !== "entwurf") {
      toast({ variant: "destructive", title: "Löschen nicht möglich", description: "Ausgestellte Rechnungen/Angebote können aus rechtlichen Gründen nicht gelöscht werden. Verwenden Sie stattdessen die Storno-Funktion." });
      return;
    }
    if (!confirm("Wirklich endgültig löschen?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler" });
    } else {
      setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
      toast({ title: "Gelöscht" });
    }
  };

  // Sammel-Export läuft über <ExportInvoicesDialog/> (clientseitige PDFs → ZIP).
  // Der frühere Inline-Export (HTML-Tabs via Edge-Function) war Dead Code und
  // bei mehreren Dokumenten durch Popup-Blocker unbrauchbar — entfernt.

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOverdue = (inv: Invoice) =>
    PAYABLE_INVOICE_TYPES.has(inv.typ) &&
    inv.faellig_am &&
    (inv.status === "offen" || inv.status === "teilbezahlt") &&
    isBefore(parseISO(inv.faellig_am), today);

  const isExpiredOffer = (inv: Invoice) =>
    inv.typ === "angebot" &&
    inv.gueltig_bis &&
    inv.status === "offen" &&
    isBefore(parseISO(inv.gueltig_bis), today);

  const filtered = invoices.filter(i => {
    const matchSearch = !searchQuery.trim() ||
      matchesSearch(i.nummer, searchQuery) ||
      matchesSearch((i as any).storno_nummer, searchQuery) ||
      matchesSearch(i.kunde_name, searchQuery) ||
      String(i.brutto_summe).includes(searchQuery) ||
      i.brutto_summe.toFixed(2).includes(searchQuery);
    const matchArchive = showArchive ? true : !i.archiviert;

    // Tab "storno" → NUR stornierte Rechnungen
    if (filterTyp === "storno") {
      return matchSearch && matchArchive && i.status === "storniert";
    }
    if (i.status === "storniert") return false;
    // "rechnung"-Tab sammelt alle Rechnungs-artigen Dokumente
    let matchTyp: boolean;
    if (filterTyp === "rechnung") {
      matchTyp = INVOICE_LIKE_TYPES.has(i.typ);
      // Sub-Filter innerhalb der Rechnungen (normale / AR / SR / GS)
      if (matchTyp && filterSubTyp !== "alle") matchTyp = i.typ === filterSubTyp;
    } else if (filterTyp === "angebot") {
      matchTyp = ANGEBOT_LIKE_TYPES.has(i.typ);
      // Sub-Filter innerhalb der Angebote (Angebot / AB)
      if (matchTyp && filterSubTyp !== "alle") matchTyp = i.typ === filterSubTyp;
    } else if (filterTyp === "lieferschein") {
      matchTyp = i.typ === "lieferschein";
    } else {
      matchTyp = i.typ === filterTyp;
    }
    const matchStatus = filterStatus === "alle" ? true : i.status === filterStatus;
    return matchTyp && matchStatus && matchSearch && matchArchive;
  });

  const storniertCount = invoices.filter(i => i.status === "storniert").length;

  /**
   * Gemeinsame Ableitungen je Beleg. Desktop-Tabelle und Mobil-Karten nutzen
   * exakt dieselben Werte — so können sich die zwei Darstellungen nicht
   * auseinanderentwickeln (Ampelfarbe, Warnhinweis, erlaubte Status).
   */
  const docMeta = (inv: Invoice) => {
    const overdue = isOverdue(inv);
    const expired = isExpiredOffer(inv);
    const brutto = Number(inv.brutto_summe);
    const bezahlt = Number(inv.bezahlt_betrag) || 0;
    const offen = brutto - bezahlt;
    // Status-Set pro Typ:
    //   - echte zahlbare Rechnungen (RE/AR/SR) → offen/teilbezahlt/bezahlt
    //   - Gutschrift → offen/verrechnet (Auszahlung, kein Bezahlstatus)
    //   - Angebot → offen/angenommen/abgelehnt/verrechnet
    //   - Auftragsbestätigung → offen/verrechnet (AB IST das angenommene Angebot)
    const availableStatuses =
      inv.typ === "gutschrift" ? gutschriftStatuses :
      inv.typ === "lieferschein" ? lieferscheinStatuses :
      inv.typ === "auftragsbestaetigung" ? abStatuses :
      PAYABLE_INVOICE_TYPES.has(inv.typ) ? rechnungStatuses :
      angebotStatuses;
    const dotColor =
      inv.status === "bezahlt" ? "bg-green-500" :
      inv.status === "angenommen" ? "bg-[#002337]" :
      inv.status === "storniert" || inv.status === "abgelehnt" ? "bg-red-500" :
      overdue ? "bg-red-500" :
      inv.status === "teilbezahlt" ? "bg-yellow-500" :
      inv.status === "verrechnet" ? "bg-blue-500" :
      "bg-orange-500";
    const warn = overdue ? "überfällig" : expired ? "abgelaufen" : inv.mahnstufe > 0 ? `Mahnung ${inv.mahnstufe}` : "";
    return { overdue, expired, brutto, bezahlt, offen, availableStatuses, dotColor, warn };
  };

  const totalRechnungen = invoices.filter(i => INVOICE_LIKE_TYPES.has(i.typ) && i.status !== "storniert").length;
  const totalAngebote = invoices.filter(i => ANGEBOT_LIKE_TYPES.has(i.typ) && i.status !== "storniert").length;
  // Offen: nur echte Forderungen (keine Gutschriften — die sind aus
  // unserer Sicht "wir schulden dem Kunden", also negative Forderung).
  const offeneSumme = invoices
    .filter(i => PAYABLE_INVOICE_TYPES.has(i.typ) && (i.status === "offen" || i.status === "teilbezahlt"))
    .reduce((sum, i) => sum + Number(i.brutto_summe) - i.bezahlt_betrag, 0);
  // Bezahlt = vereinnahmt minus an Kunden zurückerstattete Gutschriften.
  const bezahltEingenommen = invoices
    .filter(i => PAYABLE_INVOICE_TYPES.has(i.typ) && (i.status === "bezahlt" || i.status === "teilbezahlt"))
    .reduce((sum, i) => sum + i.bezahlt_betrag, 0);
  const verrechnete_gutschriften = invoices
    .filter(i => i.typ === "gutschrift" && i.status === "verrechnet")
    .reduce((sum, i) => sum + Number(i.brutto_summe), 0);
  const bezahlteSumme = bezahltEingenommen - verrechnete_gutschriften;

  // Status options for the filter depend on selected typ
  const statusFilterOptions = filterTyp === "rechnung"
    ? rechnungStatuses
    : filterTyp === "angebot"
      ? angebotStatuses
      : filterTyp === "lieferschein"
        ? lieferscheinStatuses
        : [...new Set([...rechnungStatuses, ...angebotStatuses])];

  return (
    <div className="kb-page min-h-screen">
      {/* Print-CSS: „Liste drucken" druckt nur das Dokumenten-Grid */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kb-print-area, #kb-print-area * { visibility: visible; }
          #kb-print-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; border-radius: 0; }
          #kb-print-area .overflow-x-auto { overflow: visible !important; }
        }
      `}</style>

      {/* KingBill-Toolbar: [Zurück] links, neue Belege + Liste drucken Mitte, Export rechts */}
      <KBToolbar
        onBack={() => navigate("/")}
        title="Dokumente"
        rightActions={
          <>
            {/* Am Handy wandert „Export" ins ⋯-Menü — sonst bleibt für den
                „Neuer Beleg"-Knopf kein Platz und er wird überdeckt. */}
            <span className="hidden sm:contents">
              <KBToolbarButton icon={FileDown} label="Export" onClick={() => setExportDialogOpen(true)} />
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="kb-btn kb-btn-lg px-3" title="Mehr Aktionen" aria-label="Mehr Aktionen">
                  <MoreHorizontal className="h-5 w-5 text-kb-blue-dark" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Am Handy sind „Export"/„Liste drucken" nicht in der Toolbar — hier rein. */}
                <DropdownMenuItem className="sm:hidden" onClick={() => setExportDialogOpen(true)}>
                  <FileDown className="h-4 w-4 mr-2" /> Export
                </DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" /> Liste drucken
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowArchive(!showArchive)}>
                  <Archive className="h-4 w-4 mr-2" />
                  {showArchive ? "Archiv ausblenden" : "Archiv anzeigen"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin?tab=einstellungen#nummernkreise")}>
                  <Settings className="h-4 w-4 mr-2" /> Nummernkreise
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        {/* Mobil: EIN „Neu"-Knopf mit allen Belegarten — sonst quillt die
            Toolbar am Handy über und schiebt die Liste nach unten. */}
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Neuer Beleg" title="Neuen Beleg anlegen" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem onClick={() => navigate("/invoices/new?typ=angebot")}>
                <FileText className="w-4 h-4 mr-2" /> Neues Angebot
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/invoices/new?typ=rechnung")}>
                <Receipt className="w-4 h-4 mr-2" /> Neue Rechnung
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/invoices/new?typ=lieferschein")}>
                <Truck className="w-4 h-4 mr-2" /> Neuer Lieferschein
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/invoices/new?typ=auftragsbestaetigung")}>
                <FileText className="w-4 h-4 mr-2" /> Neue Auftragsbestätigung
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/invoices/new?typ=anzahlungsrechnung")}>
                <Receipt className="w-4 h-4 mr-2" /> Neue Anzahlungsrechnung
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/invoices/new?typ=schlussrechnung")}>
                <Receipt className="w-4 h-4 mr-2" /> Neue Schlussrechnung
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/invoices/new?typ=gutschrift")}>
                <Undo2 className="w-4 h-4 mr-2" /> Neue Gutschrift
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Ab sm: KingBill-Aktionsleiste — Neu | Bearbeiten | Kopieren in … |
            Status ändern | Kommentare | Löschen. Die Aktionen wirken auf die
            in der Liste MARKIERTE Zeile (Klick = markieren, Doppelklick =
            öffnen) — exakt wie im Original. */}
        <div className="hidden sm:contents">
          {(() => {
            const sel = invoices.find((i) => i.id === selectedId) || null;
            const brauchtAuswahl = () =>
              toast({ title: "Kein Beleg markiert", description: "Bitte zuerst eine Zeile in der Liste anklicken." });
            const neuTyp =
              filterTyp === "angebot" ? "angebot" :
              filterTyp === "lieferschein" ? "lieferschein" : "rechnung";
            return (
              <>
                <KBToolbarButton
                  icon={Plus}
                  iconClassName="text-kb-green"
                  label="Neu"
                  onClick={() => navigate(`/invoices/new?typ=${neuTyp}`)}
                  title={`Neuen Beleg anlegen (${neuTyp === "angebot" ? "Angebot" : neuTyp === "lieferschein" ? "Lieferschein" : "Rechnung"})`}
                />
                <KBToolbarButton
                  icon={Pencil}
                  iconClassName="text-kb-yellow"
                  label="Bearbeiten"
                  onClick={() => (sel ? navigate(`/invoices/${sel.id}`) : brauchtAuswahl())}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <KBToolbarButton icon={CopyIcon} label="Kopieren in …" title="Markierten Beleg in einen neuen Beleg kopieren" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {([
                      ["angebot", "ein neues Angebot"],
                      ["auftragsbestaetigung", "einen neuen Auftrag"],
                      ["lieferschein", "einen neuen Lieferschein"],
                      ["rechnung", "eine neue Rechnung"],
                      ["gutschrift", "eine neue Gutschrift"],
                    ] as const).map(([typ, label]) => (
                      <DropdownMenuItem
                        key={typ}
                        onClick={() => (sel ? setKopierenZielTyp(typ) : brauchtAuswahl())}
                      >
                        <FileText className="w-4 h-4 mr-2" /> {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <KBToolbarButton icon={CircleDot} iconClassName="text-kb-green" label="Status ändern" title="Status des markierten Belegs ändern" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {sel ? (
                      docMeta(sel).availableStatuses.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => handleStatusChange(sel.id, s, { stopPropagation: () => {} } as any)}>
                          {statusLabels[s] || s}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem disabled>Zuerst eine Zeile markieren</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <KBToolbarButton
                  icon={FileText}
                  label="Kommentare"
                  title="Kommentar/Notiz zum markierten Beleg"
                  onClick={() => {
                    if (!sel) return brauchtAuswahl();
                    setKommentarText(((sel as any).notizen as string) || "");
                    setKommentarOpen(true);
                  }}
                />
                <KBToolbarButton
                  icon={Trash2}
                  label="Löschen"
                  title="Markierten Beleg löschen"
                  onClick={(e) => (sel ? handleDelete(sel.id, e as any) : brauchtAuswahl())}
                />
                <KBToolbarButton icon={Printer} label="Liste drucken" onClick={() => window.print()} />
              </>
            );
          })()}
        </div>
      </KBToolbar>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-[1600px]">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-4">

          {/* ── Linke KingBill-Filterspalte ── */}
          <aside className="kb-panel w-full lg:w-64 shrink-0 p-3 print:hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            {/* Mobile: Filterspalte auf-/zuklappen */}
            <button
              type="button"
              className="kb-btn w-full justify-between lg:hidden"
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
                placeholder={filterTyp === "storno" ? "Storno-Nr., Rechnungsnr., Kunde…" : "Suche… (Nummer, Kunde, Betrag)"}
                aria-label="Dokumente durchsuchen"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {/* Belegart — vertikale Tab-Liste, aktiver Tab gelb-orange umrandet */}
              <div className="flex flex-col gap-1.5">
                {([
                  { val: "rechnung", label: "Rechnungen", icon: Receipt, hint: "Rechnungen, Anzahlungs-/Schlussrechnungen + Gutschriften" },
                  { val: "angebot", label: "Angebote", icon: FileText, hint: "Angebote + Auftragsbestätigungen" },
                  { val: "lieferschein", label: "Lieferscheine", icon: Truck, hint: "Lieferscheine (ohne Preise)" },
                  { val: "storno", label: "Storno-Belege", icon: Undo2, hint: "Stornierte Rechnungen / Storno-Belege" },
                ] as const).map(t => {
                  const TabIcon = t.icon;
                  const active = filterTyp === t.val;
                  return (
                    <button
                      key={t.val}
                      type="button"
                      onClick={() => selectTab(t.val)}
                      className={`${active ? "kb-tab-active" : "kb-tab"} w-full`}
                      title={t.hint}
                    >
                      <TabIcon className="h-4 w-4 shrink-0 text-kb-blue-dark" />
                      <span className="truncate">{t.label}</span>
                      {t.val === "storno" && storniertCount > 0 && (
                        <span className="kb-badge ml-auto shrink-0">{storniertCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Sub-Filter pro Typ — nur sichtbar bei Rechnungen + Angebote */}
              {(filterTyp === "rechnung" || filterTyp === "angebot") && (() => {
                const chips: { val: string; label: string; cls: string }[] = filterTyp === "rechnung"
                  ? [
                      { val: "alle",                label: "Alle",               cls: "bg-muted text-foreground" },
                      { val: "rechnung",            label: "Rechnung",           cls: "bg-green-100 text-green-800 border-green-300" },
                      { val: "anzahlungsrechnung",  label: "Anzahlungsrechnung", cls: "bg-orange-100 text-orange-800 border-orange-300" },
                      { val: "schlussrechnung",    label: "Schlussrechnung",    cls: "bg-emerald-100 text-emerald-900 border-emerald-400" },
                    ]
                  : [
                      { val: "alle",                label: "Alle",               cls: "bg-muted text-foreground" },
                      { val: "angebot",             label: "Angebot",            cls: "bg-blue-100 text-blue-800 border-blue-300" },
                      { val: "auftragsbestaetigung", label: "Auftragsbestätigung", cls: "bg-indigo-100 text-indigo-800 border-indigo-300" },
                    ];
                return (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {chips.map(chip => {
                      const active = filterSubTyp === chip.val;
                      return (
                        <button
                          key={chip.val}
                          onClick={() => setFilterSubTyp(chip.val)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                            active
                              ? `${chip.cls} ring-2 ring-offset-1 ring-primary/50`
                              : `${chip.cls} opacity-60 hover:opacity-100`
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Status filtern */}
              {filterTyp !== "storno" && (
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full h-9" aria-label="Status filtern">
                    <SelectValue placeholder="Status filtern…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Status</SelectItem>
                    {statusFilterOptions.map(s => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Summen wie im KingBill-Original: Anzahl · Summe Netto · Summe Brutto
                  — bezogen auf die aktuell GEFILTERTE Liste. */}
              <div className="border-t border-border pt-2 text-sm space-y-0.5">
                <div className="flex justify-between">
                  <span>Anzahl {filterTyp === "angebot" ? "Angebote" : filterTyp === "lieferschein" ? "Lieferscheine" : filterTyp === "storno" ? "Storni" : "Rechnungen"}</span>
                  <span className="font-bold tabular-nums">{loading ? "…" : filtered.length}</span>
                </div>
                {filterTyp !== "lieferschein" && (
                  <>
                    <div className="flex justify-between">
                      <span>Summe Netto</span>
                      <span className="font-bold tabular-nums">
                        € {filtered.reduce((s, i) => s + Number((i as any).netto_summe || 0), 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Summe Brutto</span>
                      <span className="font-bold tabular-nums">
                        € {filtered.reduce((s, i) => s + Number(i.brutto_summe || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>

        {/* Kompakte Stats — kontextuell gefiltert */}
        {(() => {
          if (filterTyp === "storno") {
            const stornoDocs = invoices.filter(i => i.status === "storniert");
            const summe = stornoDocs.reduce((s, i) => s + Number(i.brutto_summe), 0);
            return (
              <div className="flex flex-col gap-1.5">
                <KBStat label="Storno-Belege" value={stornoDocs.length} />
                <KBStat label="Stornierte Summe" value={`€ ${summe.toFixed(2)}`} valueClass="text-red-600" />
              </div>
            );
          }
          if (filterTyp === "lieferschein") {
            // Lieferscheine sind preislos → Zähler statt €-Summen.
            const lsDocs = invoices.filter(i => i.typ === "lieferschein" && i.status !== "storniert");
            return (
              <div className="flex flex-col gap-1.5">
                <KBStat label="Lieferscheine" value={lsDocs.length} />
                <KBStat label="Offen" value={lsDocs.filter(i => i.status === "offen").length} valueClass="text-orange-600" />
                <KBStat label="Verrechnet" value={lsDocs.filter(i => i.status === "verrechnet").length} valueClass="text-purple-700" />
              </div>
            );
          }
          const visibleInvoices = invoices.filter(i => i.typ === filterTyp && i.status !== "storniert");
          const count = visibleInvoices.length;
          const openBrutto = visibleInvoices.filter(i => PAYABLE_INVOICE_TYPES.has(i.typ) && (i.status === "offen" || i.status === "teilbezahlt")).reduce((s, i) => s + (Number(i.brutto_summe) - Number(i.bezahlt_betrag || 0)), 0);
          const overdue = visibleInvoices.filter(i => isOverdue(i)).length;
          return (
            <div className="flex flex-col gap-1.5">
              <KBStat label={filterTyp === "rechnung" ? "Rechnungen" : "Angebote"} value={count} />
              {filterTyp === "rechnung" ? (
                <KBStat label="Offener Betrag" value={`€ ${openBrutto.toFixed(2)}`} valueClass="text-orange-600" />
              ) : (
                <KBStat label="Summe" value={`€ ${visibleInvoices.reduce((s, i) => s + Number(i.brutto_summe), 0).toFixed(2)}`} />
              )}
              <KBStat label="Überfällig" value={overdue} valueClass={overdue > 0 ? "text-red-600" : ""} />
            </div>
          );
        })()}

              {/* Ampel-Legende (KingBill-Stil): erklärt die Status-Punkte */}
              <div className="flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" />offen</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />teilbezahlt</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />bezahlt</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />verrechnet</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#002337]" />angenommen</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />überfällig / storniert</span>
              </div>
            </div>
          </aside>

          {/* ── Dokumenten-Grid rechts (zugleich Druckbereich) ── */}
          <section id="kb-print-area" className="kb-panel flex-1 min-w-0 overflow-hidden">
            {/* Druck-Kopf: nur beim „Liste drucken" sichtbar */}
            <div className="hidden print:block px-4 pt-4">
              <h2 className="text-lg font-bold">
                {filterTyp === "storno" ? "Storno-Belege" : filterTyp === "angebot" ? "Angebote" : filterTyp === "lieferschein" ? "Lieferscheine" : "Rechnungen"}
              </h2>
              <p className="text-xs text-muted-foreground">Anzahl: {filtered.length}</p>
            </div>
            <div className="p-2 sm:p-3">
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Lädt...</p>
            ) : filtered.length === 0 ? (
              filterTyp === "storno" ? (
                <EmptyState
                  icon={<Receipt className="w-12 h-12" />}
                  title="Keine Storno-Belege"
                  description="Hier erscheinen stornierte Rechnungen. Aktuell ist nichts storniert."
                />
              ) : (
                <EmptyState
                  icon={filterTyp === "angebot" ? <FileText className="w-12 h-12" /> : filterTyp === "lieferschein" ? <Truck className="w-12 h-12" /> : <Receipt className="w-12 h-12" />}
                  title={filterTyp === "angebot" ? "Noch keine Angebote" : filterTyp === "lieferschein" ? "Noch keine Lieferscheine" : "Noch keine Rechnungen"}
                  description={filterTyp === "angebot" ? "Erstelle dein erstes Angebot für einen Kunden." : filterTyp === "lieferschein" ? "Erstelle deinen ersten Lieferschein — ohne Preise, ideal zur Warenübergabe." : "Erstelle deine erste Rechnung."}
                  action={{
                    label: filterTyp === "angebot" ? "Erstes Angebot erstellen" : filterTyp === "lieferschein" ? "Ersten Lieferschein erstellen" : "Erste Rechnung erstellen",
                    onClick: () => navigate(`/invoices/new?typ=${filterTyp}`),
                  }}
                />
              )
            ) : filterTyp === "storno" ? (
              <>
              {/* ── Mobil/Tablet: Storno-Karten ── */}
              <div className="lg:hidden print:hidden flex flex-col gap-2">
                {filtered.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="w-full text-left rounded-lg border border-red-200 bg-white p-3 shadow-sm active:bg-red-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                      <span className="font-mono font-semibold">{(inv as any).storno_nummer || "—"}</span>
                      <span className="ml-auto font-semibold tabular-nums">€ {Number(inv.brutto_summe).toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium">{inv.kunde_name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Storniert am {formatDateShort((inv as any).storno_datum)}</span>
                      <span className="font-mono">Original: {inv.nummer}</span>
                    </div>
                    {(inv as any).storno_grund && (
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{(inv as any).storno_grund}</div>
                    )}
                  </button>
                ))}
              </div>
              {/* ── Desktop: KingBill-Grid ── */}
              <div className="hidden lg:block print:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {/* Status-Ampel-Punkt in der ersten Spalte (KingBill-Grid) */}
                      <TableHead className="w-8"><span className="sr-only">Status-Ampel</span></TableHead>
                      <TableHead>Storno-Nr.</TableHead>
                      <TableHead>Original Rechnung</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead>Storno-Datum</TableHead>
                      <TableHead>Grund</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                      <TableHead className="w-12 print:hidden"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => (
                      <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <TableCell className="w-8">
                          <span className="block h-2.5 w-2.5 rounded-full bg-red-500" title="Storniert" />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{(inv as any).storno_nummer || "—"}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{inv.nummer}</TableCell>
                        <TableCell>{inv.kunde_name}</TableCell>
                        <TableCell>{formatDateShort((inv as any).storno_datum)}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{(inv as any).storno_grund || "—"}</TableCell>
                        <TableCell className="text-right font-medium">€ {Number(inv.brutto_summe).toFixed(2)}</TableCell>
                        <TableCell className="print:hidden" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Download Storno-PDF
                              try {
                                const logoUri = await loadInvoiceLogo();
                                const bank = { kontoinhaber: bankKontoinhaber, iban: bankIban, bic: bankBic };
                                const { generateStornoPdf } = await import("@/lib/pdfGenerator");
                                const pdfBlob = generateStornoPdf(
                                  { nummer: inv.nummer, kunde_name: inv.kunde_name, brutto_summe: Number(inv.brutto_summe), datum: inv.datum },
                                  (inv as any).storno_nummer || "",
                                  (inv as any).storno_datum || new Date().toISOString().split("T")[0],
                                  (inv as any).storno_grund || "",
                                  bank, logoUri, invoiceLayout
                                );
                                const url = URL.createObjectURL(pdfBlob);
                                const a = document.createElement("a"); a.href = url;
                                a.download = `Storno_${(inv as any).storno_nummer || inv.nummer}.pdf`; a.click();
                                URL.revokeObjectURL(url);
                              } catch (err: any) {
                                toast({ variant: "destructive", title: "Fehler", description: err.message });
                              }
                            }}
                            title="Storno-Beleg herunterladen"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </>
            ) : (
              <>
              {/* ══ Mobil/Tablet: eine Karte je Beleg ══════════════════════
                  Der Chef bedient das am Handy: großes Tap-Ziel (ganze Karte
                  öffnet den Beleg), Ampel + Typ-Badge + Nummer oben, Kunde,
                  Datum und Betrag darunter, Status als eigene Zeile mit
                  44px-Touchziel. Keine horizontal scrollende Tabelle mehr. */}
              <div className="lg:hidden print:hidden flex flex-col gap-2">
                {filtered.map((inv) => {
                  const { overdue, brutto, bezahlt, offen, availableStatuses, dotColor, warn } = docMeta(inv);
                  return (
                    <div
                      key={inv.id}
                      className={`rounded-lg border shadow-sm ${overdue ? "border-red-300 bg-red-50" : "border-border bg-white"}`}
                    >
                      {/* Tap-Fläche: öffnet den Beleg */}
                      <button
                        type="button"
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                        className="w-full text-left px-3 pt-3 pb-2 active:bg-muted/50 rounded-t-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} title={statusLabels[inv.status] || inv.status} />
                          <TypBadge typ={inv.typ} />
                          <span className="font-mono font-semibold truncate">{inv.nummer}</span>
                          {filterTyp !== "lieferschein" && (
                            <span className="ml-auto shrink-0 text-base font-bold tabular-nums">€ {brutto.toFixed(2)}</span>
                          )}
                        </div>
                        <div className="mt-1.5 text-sm font-medium truncate">{inv.kunde_name || "—"}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{formatDateShort(inv.datum)}</span>
                          {filterTyp === "lieferschein" && (
                            <span className="truncate">{inv.project_id ? (projectNames[inv.project_id] || "ohne Projekt") : "ohne Projekt"}</span>
                          )}
                          {PAYABLE_INVOICE_TYPES.has(inv.typ) && bezahlt > 0 && inv.status !== "bezahlt" && (
                            <span className="text-yellow-700 font-medium">
                              bezahlt € {bezahlt.toFixed(2)} · offen € {offen.toFixed(2)}
                            </span>
                          )}
                          {warn && <span className="text-red-600 font-semibold">{warn}</span>}
                        </div>
                      </button>

                      {/* Fußzeile: Status ändern + Aktionen (nicht durchklickbar) */}
                      <div className="flex items-center gap-2 border-t border-border/70 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        {inv.status === "storniert" ? (
                          <span className="text-xs font-medium text-red-700 px-1">
                            Storniert{(inv as any).storno_nummer ? ` (${(inv as any).storno_nummer})` : ""}
                          </span>
                        ) : (
                          <Select
                            value={inv.status}
                            onValueChange={(val) => handleStatusChange(inv.id, val, { stopPropagation: () => {} } as React.MouseEvent)}
                          >
                            <SelectTrigger className="h-10 w-auto min-w-[130px] text-sm font-medium" aria-label="Status ändern">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableStatuses.map(s => (
                                <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <div className="ml-auto flex items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            title="PDF herunterladen"
                            disabled={downloadingId === inv.id}
                            onClick={(e) => handleDownloadPdf(inv.id, inv.nummer, e as any)}
                          >
                            <Download className="h-5 w-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            title="Drucken"
                            onClick={(e) => handlePrintPdf(inv.id, e as any)}
                          >
                            <Printer className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ══ Desktop: KingBill-Grid — Spalten wie im Original:
                  Status·Datum·Betreff·Kundennumm·Kunde·Adresse·Plz·Ort·
                  Leistungszeitraum·Lieferadresse·Projekt·Netto·Brutto·Kommentare.
                  Klick markiert die Zeile GELB, Doppelklick öffnet den Beleg. */}
              <div className="hidden lg:block print:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Status</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="min-w-[12rem]">Betreff</TableHead>
                      <TableHead>Kundennumm</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead className="hidden xl:table-cell">Adresse</TableHead>
                      <TableHead className="hidden xl:table-cell">Plz</TableHead>
                      <TableHead className="hidden xl:table-cell">Ort</TableHead>
                      <TableHead className="hidden 2xl:table-cell">Leistungszeitraum</TableHead>
                      <TableHead className="hidden 2xl:table-cell">Lieferadresse</TableHead>
                      <TableHead className="hidden xl:table-cell">Projekt</TableHead>
                      {filterTyp !== "lieferschein" && <TableHead className="text-right">Summe Netto</TableHead>}
                      {filterTyp !== "lieferschein" && <TableHead className="text-right">Summe Brutto</TableHead>}
                      <TableHead className="hidden xl:table-cell">Kommentare</TableHead>
                      <TableHead className="w-12 print:hidden"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => {
                      const { overdue, brutto, bezahlt, offen, availableStatuses, dotColor, warn } = docMeta(inv);
                      const selektiert = selectedId === inv.id;
                      return (
                        <TableRow
                          key={inv.id}
                          className={`cursor-pointer ${
                            selektiert
                              ? "bg-[#FFF3B8] hover:bg-[#FFEE9E]"
                              : `hover:bg-muted/50 ${overdue ? "bg-red-50" : ""}`
                          }`}
                          onClick={() => setSelectedId(inv.id)}
                          onDoubleClick={() => navigate(`/invoices/${inv.id}`)}
                        >
                          <TableCell className="w-10">
                            <span
                              className={`block h-3 w-3 rounded-full border border-black/10 ${dotColor}`}
                              title={`${statusLabels[inv.status] || inv.status}${warn ? ` — ${warn}` : ""}`}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateShort(inv.datum)}</TableCell>
                          <TableCell className="max-w-[18rem]">
                            <div className="flex items-center gap-2">
                              <TypBadge typ={inv.typ} />
                              <span className="truncate font-medium">
                                {((inv as any).betreff as string)?.trim() || inv.nummer}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{(inv as any).kundennummer || "—"}</TableCell>
                          <TableCell className="max-w-[12rem] truncate">{inv.kunde_name}</TableCell>
                          <TableCell className="hidden max-w-[10rem] truncate text-muted-foreground xl:table-cell">{(inv as any).kunde_adresse || ""}</TableCell>
                          <TableCell className="hidden text-muted-foreground xl:table-cell">{(inv as any).kunde_plz || ""}</TableCell>
                          <TableCell className="hidden max-w-[8rem] truncate text-muted-foreground xl:table-cell">{(inv as any).kunde_ort || ""}</TableCell>
                          <TableCell className="hidden whitespace-nowrap text-muted-foreground 2xl:table-cell">
                            {(() => {
                              const von = (inv as any).leistungsdatum as string | null;
                              const bis = (inv as any).leistungsdatum_bis as string | null;
                              if (!von) return "";
                              return bis && bis !== von
                                ? `${formatDateShort(von)} – ${formatDateShort(bis)}`
                                : formatDateShort(von);
                            })()}
                          </TableCell>
                          <TableCell className="hidden max-w-[9rem] truncate text-muted-foreground 2xl:table-cell">
                            {(((inv as any).lieferadresse as string) || "").split("\n")[0]}
                          </TableCell>
                          <TableCell className="hidden max-w-[9rem] truncate text-muted-foreground xl:table-cell">
                            {inv.project_id ? (projectNames[inv.project_id] || "") : ""}
                          </TableCell>
                          {filterTyp !== "lieferschein" && (
                            <TableCell className="text-right tabular-nums">{Number(inv.netto_summe || 0).toFixed(2)}</TableCell>
                          )}
                          {filterTyp !== "lieferschein" && (
                            <TableCell className="text-right font-medium tabular-nums">
                              {brutto.toFixed(2)}
                              {PAYABLE_INVOICE_TYPES.has(inv.typ) && bezahlt > 0 && inv.status !== "bezahlt" && (
                                <div className="text-[10px] font-normal text-muted-foreground">offen: € {offen.toFixed(2)}</div>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="hidden max-w-[10rem] truncate text-xs text-muted-foreground xl:table-cell">
                            {(((inv as any).notizen as string) || "").split("\n")[0]}
                          </TableCell>
                          <TableCell className="print:hidden" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Aktionen">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => handleDownloadPdf(inv.id, inv.nummer, e as any)} disabled={downloadingId === inv.id}>
                                  <Download className="h-4 w-4 mr-2" /> PDF herunterladen
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => handlePrintPdf(inv.id, e as any)}>
                                  <Printer className="h-4 w-4 mr-2" /> Drucken
                                </DropdownMenuItem>
                                {PAYABLE_INVOICE_TYPES.has(inv.typ) && isOverdue(inv) && (
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-700"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const logoUri = await loadInvoiceLogo();
                                        const bank = { kontoinhaber: bankKontoinhaber, iban: bankIban, bic: bankBic };
                                        const stufe = Number(inv.mahnstufe || 0) + 1;
                                        if (stufe > 3) {
                                          toast({
                                            title: "Mahnstufe 3 erreicht",
                                            description: "Das System erlaubt keine weiteren Mahnungen. Nächster Schritt: Inkasso-Übergabe oder Rechnung abschreiben/stornieren.",
                                            duration: 8000,
                                          });
                                          return;
                                        }
                                        const { generateMahnungPdf } = await import("@/lib/pdfGenerator");
                                        const pdfBlob = generateMahnungPdf(
                                          {
                                            nummer: inv.nummer, datum: inv.datum, faellig_am: inv.faellig_am || "",
                                            kunde_name: inv.kunde_name, kunde_adresse: (inv as any).kunde_adresse,
                                            kunde_plz: (inv as any).kunde_plz, kunde_ort: (inv as any).kunde_ort,
                                            brutto_summe: Number(inv.brutto_summe), bezahlt_betrag: Number(inv.bezahlt_betrag || 0),
                                          },
                                          stufe, 0, bank, logoUri, invoiceLayout
                                        );
                                        await supabase.from("invoices").update({ mahnstufe: stufe }).eq("id", inv.id);
                                        const url = URL.createObjectURL(pdfBlob);
                                        const a = document.createElement("a"); a.href = url;
                                        a.download = `Mahnung_${stufe}_${inv.nummer}.pdf`; a.click();
                                        URL.revokeObjectURL(url);
                                        toast({ title: `Mahnung ${stufe} erstellt` });
                                        fetchInvoices();
                                      } catch (err: any) {
                                        toast({ variant: "destructive", title: "Fehler", description: err.message });
                                      }
                                    }}
                                  >
                                    <AlertTriangle className="h-4 w-4 mr-2" /> Mahnung {Number(inv.mahnstufe || 0) + 1} erstellen
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        {/* Export Dialog */}
        <ExportInvoicesDialog
          open={exportDialogOpen}
          onClose={() => setExportDialogOpen(false)}
          bankData={{ kontoinhaber: bankKontoinhaber, iban: bankIban, bic: bankBic }}
        />

        {/* „Dokument kopieren — Was soll kopiert werden?" (KingBill 1:1) */}
        <DokumentKopierenDialog
          open={!!kopierenZielTyp}
          onClose={() => setKopierenZielTyp(null)}
          onKopieren={(optionen) => {
            if (!selectedId || !kopierenZielTyp) return;
            try {
              sessionStorage.setItem(KOPIER_OPTIONEN_KEY, JSON.stringify(optionen));
            } catch { /* ohne sessionStorage: Vollkopie wie bisher */ }
            const ziel = kopierenZielTyp;
            setKopierenZielTyp(null);
            navigate(`/invoices/new?typ=${ziel}&from_doc=${selectedId}`);
          }}
        />

        {/* Kommentar/Notiz zum markierten Beleg (KingBill-Toolbar „Kommentare") */}
        <Dialog open={kommentarOpen} onOpenChange={(o) => !o && setKommentarOpen(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Kommentar zum Beleg</DialogTitle>
            </DialogHeader>
            <Textarea
              rows={5}
              value={kommentarText}
              onChange={(e) => setKommentarText(e.target.value)}
              placeholder="Interner Kommentar/Notiz zu diesem Beleg …"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setKommentarOpen(false)}>Abbrechen</Button>
              <Button
                onClick={async () => {
                  if (!selectedId) return;
                  const { error } = await supabase
                    .from("invoices")
                    .update({ notizen: kommentarText.trim() || null })
                    .eq("id", selectedId);
                  if (error) {
                    toast({ variant: "destructive", title: "Fehler", description: error.message });
                    return;
                  }
                  setInvoices((prev) => prev.map((i) => i.id === selectedId ? ({ ...i, notizen: kommentarText.trim() } as any) : i));
                  setKommentarOpen(false);
                  toast({ title: "Kommentar gespeichert" });
                }}
              >
                Speichern
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Create Project Dialog (when offer accepted) */}
        <CreateProjectDialog
          open={createProjectDialogOpen}
          onClose={() => setCreateProjectDialogOpen(false)}
          onCreated={async (newProject) => {
            if (createProjectForInvoiceId) {
              await supabase.from("invoices").update({ project_id: newProject.id }).eq("id", createProjectForInvoiceId);
              setInvoices(prev => prev.map(i => i.id === createProjectForInvoiceId ? { ...i, project_id: newProject.id } : i));
            }
            setCreateProjectDialogOpen(false);
            setCreateProjectForInvoiceId(null);
          }}
          defaultName={createProjectDefaults.name}
          defaultCustomerId={createProjectDefaults.customerId}
          defaultCustomerName={createProjectDefaults.customerName}
          defaultAdresse={createProjectDefaults.adresse}
          defaultPlz={createProjectDefaults.plz}
          defaultOrt={createProjectDefaults.ort}
          defaultEmail={createProjectDefaults.email}
          defaultTelefon={createProjectDefaults.telefon}
          defaultUidNummer={createProjectDefaults.uidNummer}
          defaultAnrede={createProjectDefaults.anrede}
          defaultTitel={createProjectDefaults.titel}
        />

        {/* Payment Dialog for Teilbezahlt/Bezahlt */}
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {paymentStatus === "bezahlt" ? "Zahlung erfassen" : "Teilzahlung erfassen"}
              </DialogTitle>
            </DialogHeader>

            {/* Invoice summary — always visible */}
            {(() => {
              const inv = invoices.find(i => i.id === paymentInvoiceId);
              const brutto = inv?.brutto_summe || 0;
              const bereitsGezahlt = existingPayments.reduce((s, p) => s + Number(p.betrag), 0);
              const offen = brutto - bereitsGezahlt;
              return (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Rechnungsbetrag (brutto):</span>
                    <span className="font-bold">€ {brutto.toFixed(2)}</span>
                  </div>
                  {bereitsGezahlt > 0 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Bereits bezahlt:</span>
                      <span className="font-medium">€ {bereitsGezahlt.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-orange-600 border-t pt-1">
                    <span>Noch offen:</span>
                    <span>€ {offen.toFixed(2)}</span>
                  </div>

                  {/* Existing payment history */}
                  {existingPayments.length > 0 && (
                    <div className="border-t pt-2 mt-1 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Zahlungshistorie:</p>
                      {existingPayments.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-medium text-green-700">€ {Number(p.betrag).toFixed(2)}</span>
                            <span className="text-muted-foreground ml-2">{new Date(p.datum).toLocaleDateString("de-AT")}</span>
                          </div>
                          {p.notizen && <span className="text-muted-foreground italic">{p.notizen}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* New payment */}
            {(() => {
              const inv = invoices.find(i => i.id === paymentInvoiceId);
              const maxBetrag = (inv?.brutto_summe || 0) - existingPayments.reduce((s, p) => s + Number(p.betrag), 0);
              return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Betrag (€) <span className="text-muted-foreground font-normal">max. € {maxBetrag.toFixed(2)}</span></Label>
                  <Input
                    type="number"
                    value={paymentBetrag}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      if (val > maxBetrag) setPaymentBetrag(maxBetrag.toFixed(2));
                      else setPaymentBetrag(e.target.value);
                    }}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    max={maxBetrag}
                  />
                </div>
                <div>
                  <Label>Zahlungsdatum</Label>
                  <Input
                    type="date"
                    value={paymentDatum}
                    onChange={(e) => setPaymentDatum(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Notiz (optional)</Label>
                <Input
                  value={paymentNotiz}
                  onChange={(e) => setPaymentNotiz(e.target.value)}
                  placeholder="z.B. Überweisung, Bar, Teilzahlung Anzahlung..."
                />
              </div>
            </div>
              );
            })()}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={async () => {
                if (!paymentInvoiceId || !paymentBetrag) return;
                const betrag = parseFloat(paymentBetrag);
                if (isNaN(betrag) || betrag <= 0) {
                  toast({ variant: "destructive", title: "Ungültiger Betrag" });
                  return;
                }

                const inv = invoices.find(i => i.id === paymentInvoiceId);
                // Einzige Quelle der Wahrheit = Summe der erfassten Zahlungen
                // (NICHT das denormalisierte bezahlt_betrag, das durch
                // Gutschrift/Storno abweichen kann — sonst werden gültige
                // Beträge abgelehnt oder Überzahlung zugelassen).
                const bereitsGezahlt = existingPayments.reduce((s, p) => s + Number(p.betrag), 0);
                const maxBetrag = Math.round(((inv?.brutto_summe || 0) - bereitsGezahlt) * 100) / 100;
                if (betrag > maxBetrag) {
                  toast({ variant: "destructive", title: "Betrag zu hoch", description: `Maximaler Betrag: €${maxBetrag.toFixed(2)}` });
                  return;
                }

                const { error: payErr } = await supabase.from("invoice_payments").insert({
                  invoice_id: paymentInvoiceId,
                  betrag,
                  datum: paymentDatum,
                  notizen: paymentNotiz.trim() || null,
                });
                if (payErr) {
                  toast({ variant: "destructive", title: "Zahlung nicht gespeichert", description: payErr.message });
                  return;
                }

                const newBezahlt = Math.round((bereitsGezahlt + betrag) * 100) / 100;
                const newStatus = newBezahlt >= (inv?.brutto_summe || 0) ? "bezahlt" : "teilbezahlt";

                const { error: updErr } = await supabase.from("invoices").update({
                  status: newStatus,
                  bezahlt_betrag: newBezahlt,
                }).eq("id", paymentInvoiceId);
                if (updErr) {
                  toast({ variant: "destructive", title: "Status nicht aktualisiert", description: updErr.message });
                  return;
                }

                setInvoices(prev => prev.map(i =>
                  i.id === paymentInvoiceId ? { ...i, status: newStatus, bezahlt_betrag: newBezahlt } : i
                ));

                toast({
                  title: newStatus === "bezahlt" ? "Vollständig bezahlt" : "Teilzahlung erfasst",
                  description: `€ ${betrag.toFixed(2)} am ${new Date(paymentDatum).toLocaleDateString("de-AT")}`,
                });
                setPaymentDialogOpen(false);
              }}>
                Zahlung speichern
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
